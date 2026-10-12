begin;
-- Separate from Step 1: no deployed migration is edited and no Watch is converted.
-- Receipts survive later mutations/deletion of a Watch; they never resurrect it.
create table public.structured_watch_mutations (
 mutation_id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 watch_id uuid not null,
 operation text not null check (operation in ('create','update')),
 expected_revision bigint not null check (expected_revision>=0),
 definition_fingerprint text not null check (definition_fingerprint ~ '^[a-f0-9]{64}$'),
 payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
 resulting_revision bigint not null check (resulting_revision>0),
 created_at timestamptz not null default now()
);
alter table public.structured_watch_mutations enable row level security;
create index structured_watch_mutations_watch_idx on public.structured_watch_mutations(watch_id);
revoke all on table public.structured_watch_mutations from public,anon,authenticated,service_role;

-- Structured writes, including trusted service writes, must enter through the RPC.
-- The marker is transaction-local, restored before returning, and cannot override
-- the independent authenticated/anonymous role guard or restrictive owner RLS.
create or replace function public.guard_structured_watch_write() returns trigger
language plpgsql set search_path='' as $$
declare explicit_version boolean;
begin
 explicit_version:=(tg_op<>'INSERT' and coalesce(old.watch_definition ? 'definitionVersion',false))
   or (tg_op<>'DELETE' and coalesce(new.watch_definition ? 'definitionVersion',false));
 if explicit_version then
  if current_user in ('authenticated','anon') or auth.role() in ('authenticated','anon')
    or current_setting('watch_assistant.structured_rpc',true) is distinct from 'persist.v1' then
   raise exception 'Structured writes require server authorization' using errcode='42501';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;

create function public.persist_structured_watch_v1(
 p_owner uuid,p_id uuid,p_operation text,p_mutation uuid,p_revision bigint,
 p_title text,p_source jsonb,p_definition jsonb,p_definition_fingerprint text,p_payload_fingerprint text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.watches%rowtype; receipt public.structured_watch_mutations%rowtype;
 watch_type text; expected_definition text; expected_payload text; previous_marker text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service authorization required' using errcode='42501'; end if;
 if p_owner is null or p_id is null or p_mutation is null or p_revision is null or p_operation is null
   or p_revision<0 or p_revision>9007199254740990 or p_operation not in ('create','update')
   or (p_operation='create' and p_revision<>0) or (p_operation='update' and p_revision<1)
   or p_title is null or char_length(p_title)>200 or char_length(btrim(p_title))<1
   or p_definition->>'definitionVersion' is distinct from 'watch-definition.v1'
   or not public.valid_structured_watch_definition(p_source,p_definition) then
  raise exception 'INVALID_WATCH_DEFINITION' using errcode='PT422';
 end if;
 expected_definition:=encode(sha256(convert_to(public.watch_canonical_json(p_definition),'UTF8')),'hex');
 expected_payload:=encode(sha256(convert_to(public.watch_canonical_json(jsonb_build_object('definition',p_definition,'source',p_source,'title',p_title)),'UTF8')),'hex');
 if p_definition_fingerprint is distinct from expected_definition or p_payload_fingerprint is distinct from expected_payload then
  raise exception 'INVALID_WATCH_DEFINITION' using errcode='PT422';
 end if;
 -- Fixed lock order serializes nonce reuse and same-Watch concurrent confirmations.
 perform pg_advisory_xact_lock(hashtextextended(p_mutation::text,1));
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,2));
 select * into receipt from public.structured_watch_mutations where mutation_id=p_mutation for update;
 select * into target from public.watches where id=p_id for update;
 if receipt.mutation_id is not null then
  if receipt.owner_id<>p_owner or receipt.watch_id<>p_id or receipt.operation<>p_operation or receipt.expected_revision<>p_revision
    or receipt.definition_fingerprint<>expected_definition or receipt.payload_fingerprint<>expected_payload then
   raise exception 'STRUCTURED_MUTATION_CONFLICT' using errcode='PT409';
  end if;
  if target.id is null or target.user_id<>p_owner or target.deleted_at is not null
    or target.watch_definition->>'definitionVersion' is distinct from 'watch-definition.v1'
    or target.monitoring_state not in ('paused','preparing') then raise exception 'WATCH_CONFLICT' using errcode='PT409'; end if;
 else
  watch_type:=case when p_definition->'plan'->>'domain'='official_company' then 'company_bodacc' else 'media_news' end;
  if p_operation='create' and (target.id is not null or exists(select 1 from public.structured_watch_mutations where watch_id=p_id)) then raise exception 'WATCH_CONFLICT' using errcode='PT409'; end if;
  if p_operation='update' then
   if target.id is null or target.user_id<>p_owner or target.deleted_at is not null
     or target.watch_definition->>'definitionVersion' is distinct from 'watch-definition.v1'
     or target.monitoring_state not in ('paused','preparing') then raise exception 'WATCH_CONFLICT' using errcode='PT409'; end if;
   if target.media_revision<>p_revision then raise exception 'STRUCTURED_REVISION_CONFLICT' using errcode='PT409'; end if;
   if target.type<>watch_type or target.watch_definition->'plan'->>'adapter'<>p_definition->'plan'->>'adapter'
     or (watch_type='company_bodacc' and target.siren<>p_definition->'plan'->'criteria'->>'siren') then
    raise exception 'STRUCTURED_ADAPTER_CONFLICT' using errcode='PT409';
   end if;
  end if;
  previous_marker:=current_setting('watch_assistant.structured_rpc',true);
  perform set_config('watch_assistant.structured_rpc','persist.v1',true);
  if p_operation='create' then
   insert into public.watches(id,user_id,type,title,siren,request,category,watch_definition,monitoring_source,
     monitoring_state,current_status,media_revision,media_mutation_id)
    values(p_id,p_owner,watch_type,p_title,
     case when watch_type='company_bodacc' then p_definition->'plan'->'criteria'->>'siren' end,
     case when watch_type='company_bodacc' then p_definition->>'request' end,p_definition->>'category',p_definition,p_source,
     'paused','paused',1,p_mutation) returning * into target;
  else
   -- Existing triggers retain their PR #52/#53 behavior; they assign OLD+1 too.
   -- Explicit assignment also provides revisions for non-media company rows.
   update public.watches set title=p_title,watch_definition=p_definition,monitoring_source=p_source,
     request=case when watch_type='company_bodacc' then p_definition->>'request' end,
     category=p_definition->>'category',monitoring_state='paused',current_status='paused',
     media_revision=target.media_revision+1,media_mutation_id=p_mutation
    where id=p_id and user_id=p_owner and media_revision=p_revision returning * into target;
   if target.id is null then raise exception 'STRUCTURED_REVISION_CONFLICT' using errcode='PT409'; end if;
  end if;
  perform set_config('watch_assistant.structured_rpc',coalesce(previous_marker,''),true);
  insert into public.structured_watch_mutations(mutation_id,owner_id,watch_id,operation,expected_revision,
    definition_fingerprint,payload_fingerprint,resulting_revision)
   values(p_mutation,p_owner,p_id,p_operation,p_revision,expected_definition,expected_payload,target.media_revision)
   returning * into receipt;
 end if;
 -- Historical acknowledgement, not an instruction to replace a newer local Watch.
 return jsonb_build_object('id',receipt.watch_id,'ownerId',receipt.owner_id,'mutationId',receipt.mutation_id,
  'operation',receipt.operation,'expectedRevision',receipt.expected_revision,'revision',receipt.resulting_revision,
  'definitionFingerprint',receipt.definition_fingerprint,'payloadFingerprint',receipt.payload_fingerprint,'monitoringState','paused');
end $$;
revoke all on function public.persist_structured_watch_v1(uuid,uuid,text,uuid,bigint,text,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.persist_structured_watch_v1(uuid,uuid,text,uuid,bigint,text,jsonb,jsonb,text,text) to service_role;
notify pgrst,'reload schema';
commit;

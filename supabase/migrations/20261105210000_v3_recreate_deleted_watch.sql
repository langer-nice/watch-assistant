begin;

do $migration$
declare
  function_oid regprocedure := to_regprocedure('public.create_v3_watch(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb)');
  definition text;
  request_start integer;
  payload_start integer;
  lock_start integer;
  title_start integer;
  identity_sql text := $identity$
 if p_id is null or p_owner is null or p_instruction is null
    or char_length(p_instruction) not between 1 and 500 or btrim(p_instruction) = ''
    or p_kind is null or p_kind not in ('FREE_TEXT', 'URL') then
   raise exception 'Invalid V3 creation';
 end if;

 -- A committed Watch ID is its original request token. When a different
 -- token reuses an active Watch, keep a receipt for that token as well.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text, 1));
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text || p_instruction, 0));
 receipt_domain := encode(sha256(convert_to('watch-assistant:v3-create-receipt:v1', 'UTF8')), 'hex');
 request_fingerprint := encode(sha256(convert_to(jsonb_build_array(p_kind, p_instruction)::text, 'UTF8')), 'hex');
 select * into receipt from public.structured_watch_mutations where mutation_id = p_id;
 if found then
   if receipt.owner_id is distinct from p_owner
      or receipt.definition_fingerprint is distinct from receipt_domain
      or receipt.payload_fingerprint is distinct from request_fingerprint then
     raise exception 'Creation token conflict' using errcode = 'PT409';
   end if;
   return receipt.watch_id;
 end if;

 if exists(select 1 from public.watches where id = p_id) then
   if not exists(
     select 1 from public.v3_pilot_watches p join public.watches w on w.id = p.watch_id
     where p.watch_id = p_id and p.user_id = p_owner and w.user_id = p_owner
       and p.instruction = p_instruction and p.capture_kind = p_kind
   ) then
     raise exception 'Creation token conflict' using errcode = 'PT409';
   end if;
   return p_id;
 end if;

 -- Keep the original exact-instruction duplicate key, but only reuse
 -- non-deleted rows. The instruction lock serializes concurrent writers.
 select p.watch_id into existing
 from public.v3_pilot_watches p join public.watches w on w.id = p.watch_id
 where p.user_id = p_owner and w.user_id = p_owner
   and p.instruction = p_instruction and w.deleted_at is null
 order by w.created_at, p.watch_id
 limit 1 for update of w;
 if existing is not null then
   insert into public.structured_watch_mutations(
     mutation_id, owner_id, watch_id, operation, expected_revision,
     definition_fingerprint, payload_fingerprint, resulting_revision)
   values(p_id, p_owner, existing, 'create', 0, receipt_domain, request_fingerprint, 1);
   return existing;
 end if;

 -- Identity-only calls avoid model and source work for a replay or duplicate.
 -- A later commit call repeats the locked lookup before inserting.
 if p_understanding is null and p_source is null and p_criteria is null and p_baseline is null then
   return null;
 end if;
$identity$;
begin
  if to_regclass('public.v3_pilot_watches') is null then return; end if;
  if function_oid is null then raise exception 'Missing V3 creation function'; end if;
  definition := pg_get_functiondef(function_oid);
  if position(identity_sql in definition) > 0 then return; end if;
  request_start := position(' if p_id is null or p_owner is null or p_instruction is null' in definition);
  payload_start := position(' or p_understanding->''decision''->>''status''' in definition);
  lock_start := position(' perform pg_advisory_xact_lock(hashtextextended(p_owner::text||p_instruction,0));' in definition);
  title_start := position(' title:=left(p_understanding->''intent''->>''canonical_text'',200);' in definition);
  if request_start = 0 or request_start >= payload_start or payload_start >= lock_start or lock_start >= title_start
     or position('declare existing uuid;' in definition) = 0
     or to_regclass('public.v3_general_original_once') is null then
    raise exception 'Unexpected V3 creation identity contract';
  end if;
  execute replace(
    left(definition, request_start - 1) || identity_sql ||
    ' if ' || substr(definition, payload_start + 4, lock_start - payload_start - 4) ||
    substr(definition, title_start),
    'declare existing uuid;',
    'declare existing uuid; receipt public.structured_watch_mutations%rowtype; receipt_domain text; request_fingerprint text;'
  );
  -- A partial unique index on the sidecar cannot consult watches.deleted_at.
  -- The RPC lock and active lookup now enforce uniqueness for creation.
  drop index public.v3_general_original_once;
  create index v3_creation_instruction_lookup on public.v3_pilot_watches(user_id, instruction);
end;
$migration$;

commit;

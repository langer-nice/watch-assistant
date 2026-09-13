begin;
-- Server-persisted media Watches and a durable, service-role-only email outbox.
alter table public.watches alter column siren drop not null;
alter table public.watches drop constraint watches_type_check;
alter table public.watches add constraint watches_type_check check (type in ('company_bodacc', 'media_news'));
alter table public.watches add column monitoring_source jsonb, add column watch_definition jsonb;
alter table public.watches add constraint watches_type_shape_check check (
  (type = 'company_bodacc' and siren is not null and siren ~ '^[0-9]{9}$') or
  (type = 'media_news' and siren is null and monitoring_source is not null and watch_definition is not null and jsonb_typeof(monitoring_source) = 'object'
    and jsonb_typeof(watch_definition) = 'object')
);
create table public.media_watch_snapshots (
  watch_id uuid primary key references public.watches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  checked_at timestamptz not null, source_title text, source_url text,
  item_ids text[] not null default '{}', items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now()),
  check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 20 and cardinality(item_ids) <= 20)
);
create trigger media_watch_snapshots_set_updated_at before update on public.media_watch_snapshots
for each row execute function public.set_updated_at();
alter table public.media_watch_snapshots enable row level security;
revoke all on table public.media_watch_snapshots from public, anon, authenticated;
grant select on table public.media_watch_snapshots to authenticated, service_role;
create policy media_watch_snapshots_select_own on public.media_watch_snapshots for select to authenticated using (user_id = (select auth.uid()));

create table public.media_watch_notifications (
 id uuid primary key default gen_random_uuid(), watch_id uuid not null references public.watches(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, source_article_id text not null check (char_length(source_article_id) between 1 and 1000),
 watch_title text not null check (char_length(watch_title) between 1 and 200), article jsonb not null check (jsonb_typeof(article) = 'object'),
 status text not null default 'pending' check (status in ('pending','sent','failed')), created_at timestamptz not null default timezone('utc', now()),
 sent_at timestamptz, attempt_count integer not null default 0, last_error_code text, provider_message_id text,
 claim_token uuid, claimed_at timestamptz, submission_started_at timestamptz,
 unique (watch_id, user_id, source_article_id),
 check ((claim_token is null and claimed_at is null and submission_started_at is null) or (claim_token is not null and claimed_at is not null)),
 check (submission_started_at is null or attempt_count > 0),
 check ((status = 'sent' and sent_at is not null and provider_message_id is not null) or (status <> 'sent' and sent_at is null))
);
create index media_watch_notifications_pending_idx on public.media_watch_notifications(created_at) where status = 'pending';
alter table public.media_watch_notifications enable row level security;
revoke all on table public.media_watch_notifications from public, anon, authenticated;
grant select, insert, update on table public.media_watch_notifications to service_role;

-- Browser writes carry a compare-and-swap revision and retry identity. RLS remains active.
alter table public.watches
  add column media_revision bigint not null default 0,
  add column media_mutation_id uuid;

create function public.valid_media_definition(source jsonb, definition jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare entry jsonb;
begin
 if source is null or definition is null or jsonb_typeof(source) <> 'object' or jsonb_typeof(definition) <> 'object'
   or coalesce(definition->>'category','') not in ('general','travel','news','property','price','events','entertainment','finance')
   or jsonb_typeof(definition->'request') is distinct from 'string'
   or char_length(btrim(definition->>'request')) not between 1 and 500
   or octet_length(source::text) > 4000 or octet_length(definition::text) > 8000
   or source - array['type','url','query'] <> '{}'::jsonb
   or source->>'type' is distinct from 'feed'
   or coalesce(source->>'url','') !~ '^https?://[^/@[:space:]]+[^[:space:]]*$'
   or char_length(source->>'url') > 2048
   or (source ? 'query' and (jsonb_typeof(source->'query') <> 'string' or char_length(source->>'query') not between 1 and 500))
 then return false; end if;
 if definition->>'inputType' = 'text' then
  if definition - array['inputType','request','category','mediaMention'] <> '{}'::jsonb
    or jsonb_typeof(definition->'mediaMention') is distinct from 'object'
    or (definition->'mediaMention') - array['subjects','matchMode'] <> '{}'::jsonb
    or definition->'mediaMention'->>'matchMode' is distinct from 'all'
    or jsonb_typeof(definition->'mediaMention'->'subjects') is distinct from 'array'
  then return false; end if;
  if jsonb_array_length(definition->'mediaMention'->'subjects') not between 1 and 8 then return false; end if;
  for entry in select value from jsonb_array_elements(definition->'mediaMention'->'subjects') loop
   if jsonb_typeof(entry) <> 'string' or char_length(btrim(entry #>> '{}')) not between 1 and 200 then return false; end if;
  end loop;
 elsif definition->>'inputType' = 'url' then
  if definition - array['inputType','request','category','storyProfile'] <> '{}'::jsonb
    or jsonb_typeof(definition->'storyProfile') is distinct from 'object'
    or (definition->'storyProfile') - array['concepts','userAddedConcepts'] <> '{}'::jsonb
    or jsonb_typeof(definition->'storyProfile'->'concepts') is distinct from 'array'
    or jsonb_typeof(definition->'storyProfile'->'userAddedConcepts') is distinct from 'array'
  then return false; end if;
  if jsonb_array_length(definition->'storyProfile'->'concepts') not between 1 and 8
    or jsonb_array_length(definition->'storyProfile'->'userAddedConcepts') > 8 then return false; end if;
  for entry in select value from jsonb_array_elements(definition->'storyProfile'->'concepts') loop
   if jsonb_typeof(entry) <> 'object' or entry - array['label','type'] <> '{}'::jsonb
     or jsonb_typeof(entry->'label') is distinct from 'string'
     or char_length(btrim(entry->>'label')) not between 1 and 200
     or coalesce(entry->>'type','') not in ('person','organization','work','product_service','location','event','condition','symptom','phenomenon','relationship','manual') then return false; end if;
  end loop;
  for entry in select value from jsonb_array_elements(definition->'storyProfile'->'userAddedConcepts') loop
   if jsonb_typeof(entry) <> 'string' or char_length(btrim(entry #>> '{}')) not between 1 and 200 then return false; end if;
  end loop;
 else return false;
 end if;
 return true;
end $$;
revoke all on function public.valid_media_definition(jsonb,jsonb) from public,anon;
grant execute on function public.valid_media_definition(jsonb,jsonb) to authenticated,service_role;
alter table public.watches add constraint watches_media_definition_check
 check (type <> 'media_news' or public.valid_media_definition(monitoring_source,watch_definition));

-- This narrow trigger invalidates a baseline when its definition changes, including direct RLS writes.
-- Cron also compares media_revision so an in-flight check cannot commit an obsolete definition.
create function public.invalidate_media_watch_baseline() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.type is distinct from old.type or new.user_id is distinct from old.user_id then
  raise exception 'Watch type and ownership are immutable' using errcode='42501';
 end if;
 if new.type = 'media_news' and (
   new.watch_definition is distinct from old.watch_definition or new.monitoring_source is distinct from old.monitoring_source
   or new.monitoring_state is distinct from old.monitoring_state or new.deleted_at is distinct from old.deleted_at
   or new.title is distinct from old.title or new.media_mutation_id is distinct from old.media_mutation_id
 ) then
  new.media_revision := old.media_revision + 1;
  update public.media_watch_notifications set status='failed',last_error_code='WATCH_CHANGED'
    where watch_id=old.id and status='pending' and submission_started_at is null;
  if new.watch_definition is distinct from old.watch_definition or new.monitoring_source is distinct from old.monitoring_source then
   delete from public.media_watch_snapshots where watch_id = old.id;
   new.last_checked_at := null;
   new.last_check_outcome := null;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.invalidate_media_watch_baseline() from public,anon,authenticated;
create trigger watches_invalidate_media_baseline before update on public.watches
 for each row execute function public.invalidate_media_watch_baseline();

create function public.persist_media_watch(
 p_id uuid, p_title text, p_source jsonb, p_definition jsonb, p_state text,
 p_revision bigint, p_mutation uuid, p_deleted boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare target public.watches%rowtype;
begin
 if auth.uid() is null or p_mutation is null or p_revision is null or p_revision < 0 or p_deleted is null
   or p_state is null or p_state not in ('monitoring','paused')
   or not public.valid_media_definition(p_source,p_definition) then
  raise exception 'Invalid media persistence request' using errcode='22023';
 end if;
 -- No upsert: a retry must never replace a newer definition or resurrect a tombstone.
 if p_revision = 0 then
  insert into public.watches(id,user_id,type,title,monitoring_source,watch_definition,monitoring_state,current_status,media_revision,media_mutation_id,deleted_at)
   values(p_id,auth.uid(),'media_news',p_title,p_source,p_definition,p_state,
     case when p_state='paused' then 'paused' else 'watching' end,1,p_mutation,
     case when p_deleted then timezone('utc',now()) else null end)
   on conflict(id) do nothing;
 end if;
 select * into target from public.watches where id=p_id and user_id=auth.uid() and type='media_news' for update;
 if target.id is null then raise exception 'Media conflict' using errcode='40001'; end if;
 if target.media_mutation_id = p_mutation then return to_jsonb(target); end if;
 if target.media_revision <> p_revision or target.deleted_at is not null then
  raise exception 'Media conflict' using errcode='40001';
 end if;
 update public.watches set title=p_title,monitoring_source=p_source,watch_definition=p_definition,
   monitoring_state=p_state,current_status=case when p_state='paused' then 'paused' else 'watching' end,
   media_mutation_id=p_mutation,deleted_at=case when p_deleted then timezone('utc',now()) else null end
  where id=p_id and user_id=auth.uid() and type='media_news' returning * into target;
 return to_jsonb(target);
end $$;
revoke all on function public.persist_media_watch(uuid,text,jsonb,jsonb,text,bigint,uuid,boolean) from public,anon;
grant execute on function public.persist_media_watch(uuid,text,jsonb,jsonb,text,bigint,uuid,boolean) to authenticated;

create function public.complete_scheduled_media_watch_check(p_watch_id uuid, p_checked_at timestamptz, p_source_title text, p_source_url text, p_item_ids text[], p_items jsonb, p_expected_checked_at timestamptz, p_expected_items jsonb, p_outcome text, p_notification_items jsonb, p_enqueue_notifications boolean, p_expected_revision bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare target public.watches%rowtype; previous public.media_watch_snapshots%rowtype; item jsonb; article_id text;
begin
 if auth.role() <> 'service_role' then raise exception 'Scheduled monitoring requires service role' using errcode='42501'; end if;
 if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 20 or cardinality(p_item_ids) > 20 or jsonb_typeof(p_notification_items) <> 'array' or jsonb_array_length(p_notification_items) > 20 then raise exception 'Invalid media snapshot' using errcode='22023'; end if;
 select * into target from public.watches where id=p_watch_id and type='media_news' and deleted_at is null and monitoring_state='monitoring' for update;
 if target.id is null or target.media_revision is distinct from p_expected_revision then return 'skipped'; end if;
 select * into previous from public.media_watch_snapshots where watch_id=p_watch_id;
 if previous.watch_id is null then if p_expected_checked_at is not null or p_expected_items is not null then return 'skipped'; end if;
 elsif previous.checked_at is distinct from p_expected_checked_at or previous.items is distinct from p_expected_items then return 'skipped'; end if;
 insert into public.media_watch_snapshots(watch_id,user_id,checked_at,source_title,source_url,item_ids,items) values(target.id,target.user_id,p_checked_at,p_source_title,p_source_url,coalesce(p_item_ids,'{}'),p_items)
 on conflict(watch_id) do update set checked_at=excluded.checked_at,source_title=excluded.source_title,source_url=excluded.source_url,item_ids=excluded.item_ids,items=excluded.items;
 update public.watches set last_checked_at=p_checked_at,last_check_outcome=p_outcome,last_check_error_code=null,current_status=case when p_outcome='matching-items' then 'updated' else current_status end,check_started_at=null where id=target.id;
 -- Disabled means discard notification intent at commit time, preventing a later historical backlog.
 if previous.watch_id is not null and p_outcome='matching-items' and p_enqueue_notifications then
  for item in select value from jsonb_array_elements(p_notification_items) loop
   article_id := nullif(btrim(item->>'id'),'');
   if article_id is not null then insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article)
    values(target.id,target.user_id,left(article_id,1000),left(target.title,200),jsonb_build_object('title',item->>'title','url',item->>'url','summary',item->>'excerpt','publishedAt',item->>'publishedAt','source',coalesce(item->>'source',p_source_title))) on conflict do nothing; end if;
  end loop;
 end if;
 return case when p_outcome='matching-items' then 'changed' else 'unchanged' end;
end $$;

create function public.get_media_watch_notification_locale(p_user_id uuid) returns text language plpgsql security definer set search_path='' as $$ declare value text; begin if auth.role()<>'service_role' then raise exception 'Notification delivery requires service role' using errcode='42501'; end if; select locale into value from public.profiles where id=p_user_id; return case when value='fr' then 'fr' else 'en' end; end $$;
create function public.claim_media_watch_email_notification(p_notification_id uuid,p_claim_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare claimed public.media_watch_notifications%rowtype; begin if auth.role()<>'service_role' then raise exception 'Notification delivery requires service role' using errcode='42501'; end if; update public.media_watch_notifications set status='failed',last_error_code='EMAIL_DELIVERY_OUTCOME_UNKNOWN' where id=p_notification_id and status='pending' and submission_started_at is not null and claimed_at < timezone('utc',now())-interval '30 minutes'; if found then return null; end if; update public.media_watch_notifications set claim_token=p_claim_token,claimed_at=timezone('utc',now()) where id=p_notification_id and status='pending' and exists (select 1 from public.watches w where w.id=media_watch_notifications.watch_id and w.type='media_news' and w.deleted_at is null and w.monitoring_state='monitoring') and p_claim_token is not null and submission_started_at is null and (claim_token is null or claimed_at < timezone('utc',now())-interval '30 minutes') returning * into claimed; if claimed.id is null then return null; end if; return jsonb_build_object('id',claimed.id,'watch_id',claimed.watch_id,'user_id',claimed.user_id,'source_article_id',claimed.source_article_id,'watch_title',claimed.watch_title,'article',claimed.article); end $$;
create function public.begin_media_watch_email_submission(p_notification_id uuid,p_claim_token uuid) returns boolean language plpgsql security definer set search_path='' as $$ declare done boolean:=false; begin if auth.role()<>'service_role' then raise exception 'Notification delivery requires service role' using errcode='42501'; end if; update public.media_watch_notifications set submission_started_at=timezone('utc',now()),attempt_count=attempt_count+1 where id=p_notification_id and status='pending' and claim_token=p_claim_token and submission_started_at is null returning true into done; return coalesce(done,false); end $$;
create function public.complete_media_watch_email_notification(p_notification_id uuid,p_claim_token uuid,p_provider_message_id text) returns boolean language plpgsql security definer set search_path='' as $$ declare done boolean:=false; begin if auth.role()<>'service_role' then raise exception 'Notification delivery requires service role' using errcode='42501'; end if; update public.media_watch_notifications set status='sent',sent_at=timezone('utc',now()),provider_message_id=left(p_provider_message_id,200) where id=p_notification_id and status='pending' and claim_token=p_claim_token and submission_started_at is not null and nullif(p_provider_message_id,'') is not null returning true into done; return coalesce(done,false); end $$;
create function public.fail_media_watch_email_notification(p_notification_id uuid,p_claim_token uuid,p_error_code text) returns boolean language plpgsql security definer set search_path='' as $$ declare done boolean:=false; begin if auth.role()<>'service_role' then raise exception 'Notification delivery requires service role' using errcode='42501'; end if; update public.media_watch_notifications set status='failed',last_error_code=left(coalesce(p_error_code,'EMAIL_DELIVERY_FAILED'),100) where id=p_notification_id and status='pending' and claim_token=p_claim_token returning true into done; return coalesce(done,false); end $$;

revoke all on function public.complete_scheduled_media_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,text,jsonb,boolean,bigint) from public,anon,authenticated;
revoke all on function public.get_media_watch_notification_locale(uuid) from public,anon,authenticated;
revoke all on function public.claim_media_watch_email_notification(uuid,uuid) from public,anon,authenticated;
revoke all on function public.begin_media_watch_email_submission(uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_media_watch_email_notification(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.fail_media_watch_email_notification(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_scheduled_media_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,text,jsonb,boolean,bigint) to service_role;
grant execute on function public.get_media_watch_notification_locale(uuid) to service_role;
grant execute on function public.claim_media_watch_email_notification(uuid,uuid) to service_role;
grant execute on function public.begin_media_watch_email_submission(uuid,uuid) to service_role;
grant execute on function public.complete_media_watch_email_notification(uuid,uuid,text) to service_role;
grant execute on function public.fail_media_watch_email_notification(uuid,uuid,text) to service_role;

commit;

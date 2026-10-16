begin;
-- Additive, opt-in policy. No backfill or rewrite of existing article notifications.
create table public.media_watch_email_policies (
 watch_id uuid primary key references public.watches(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 mode text not null default 'daily_digest' check(mode in ('daily_digest','immediate','off')),
 enabled boolean not null default false,
 eligible_after timestamptz not null default clock_timestamp()
);
create table public.media_watch_digests (
 id uuid primary key default gen_random_uuid(),
 watch_id uuid not null references public.watches(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 period date not null,
 status text not null default 'prepared' check(status in ('prepared','claimed','submitting','sent','failed','cancelled')),
 claim_token uuid, claimed_at timestamptz, submission_started_at timestamptz,
 sent_at timestamptz, provider_message_id text, error_code text,
 unique(watch_id,period),
 check((status='sent')=(sent_at is not null and provider_message_id is not null))
);
alter table public.media_watch_notifications
 add column delivery_mode text not null default 'immediate' check(delivery_mode in ('immediate','daily_digest','off')),
 add column digest_id uuid references public.media_watch_digests(id);
create index media_notifications_digest_pending on public.media_watch_notifications(watch_id,created_at)
 where delivery_mode='daily_digest' and status='pending' and digest_id is null;

alter table public.media_watch_email_policies enable row level security;
alter table public.media_watch_digests enable row level security;
revoke all on public.media_watch_email_policies,public.media_watch_digests from public,anon,authenticated,service_role;
grant select on public.media_watch_email_policies to authenticated;
create policy media_email_policy_owner on public.media_watch_email_policies for select to authenticated using(user_id=(select auth.uid()));

create function public.media_digest_period(p_at timestamptz) returns date language sql immutable set search_path='' as $$select (p_at at time zone 'UTC')::date$$;
create unique index media_digest_one_submission_day on public.media_watch_digests(watch_id,public.media_digest_period(submission_started_at)) where submission_started_at is not null;
-- Internal helper: existing Structured consent remains an independent mandatory gate.
create function public.media_digest_consent(p_watch uuid,p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.media_watch_email_policies p join public.watches w on w.id=p.watch_id and w.user_id=p.user_id
 where p.watch_id=p_watch and p.user_id=p_owner and p.enabled and p.mode<>'off' and w.type='media_news'
 and w.monitoring_source->>'type' is distinct from 'currency'
 and w.deleted_at is null and w.monitoring_state='monitoring'
 and (not(w.watch_definition ? 'definitionVersion') or exists(select 1 from public.structured_media_email_preferences e where e.watch_id=w.id and e.user_id=w.user_id and e.enabled)))
$$;
create function public.cancel_media_digests(p_watch uuid) returns void language plpgsql security definer set search_path='' as $$begin
 update public.media_watch_digests set status='cancelled',error_code='WATCH_OR_PREFERENCE_CHANGED'
 where watch_id=p_watch and status in ('prepared','claimed') and submission_started_at is null;
 update public.media_watch_notifications set status='failed',last_error_code='EMAIL_POLICY_CHANGED'
 where watch_id=p_watch and status='pending' and submission_started_at is null;
end $$;

create function public.get_media_watch_email_policy(p_watch_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; p public.media_watch_email_policies%rowtype; consent boolean;
begin
 if auth.role() is distinct from 'authenticated' or auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into w from public.watches where id=p_watch_id and user_id=auth.uid() and type='media_news' and deleted_at is null;
 if w.id is null or w.monitoring_source->>'type'='currency' then return null; end if;
 select * into p from public.media_watch_email_policies where watch_id=w.id and user_id=w.user_id;
 if p.watch_id is null then
  consent:=case when w.watch_definition ? 'definitionVersion' then coalesce((select enabled from public.structured_media_email_preferences where watch_id=w.id and user_id=w.user_id),false) else true end;
  return jsonb_build_object('mode','immediate','enabled',consent,'version','legacy');
 end if;
 return jsonb_build_object('mode',p.mode,'enabled',p.enabled and (not(w.watch_definition ? 'definitionVersion') or exists(select 1 from public.structured_media_email_preferences where watch_id=w.id and user_id=w.user_id and enabled)),'version','daily-digest.v1');
end $$;
create function public.set_media_watch_email_policy(p_watch_id uuid,p_mode text,p_enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; p public.media_watch_email_policies%rowtype;
begin
 if auth.role() is distinct from 'authenticated' or auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into w from public.watches where id=p_watch_id and user_id=auth.uid() and type='media_news' and deleted_at is null for update;
 if w.id is null or w.monitoring_source->>'type'='currency' or p_mode is null or p_mode not in ('daily_digest','immediate','off') or p_enabled is null or (p_mode='off' and p_enabled) then raise exception 'Invalid preference' using errcode='42501'; end if;
 select * into p from public.media_watch_email_policies where watch_id=w.id;
 if p.watch_id is null or p.mode is distinct from p_mode or p.enabled is distinct from p_enabled then
  perform public.cancel_media_digests(w.id);
  insert into public.media_watch_email_policies(watch_id,user_id,mode,enabled) values(w.id,w.user_id,p_mode,p_enabled)
  on conflict(watch_id) do update set mode=excluded.mode,enabled=excluded.enabled,eligible_after=clock_timestamp();
 end if;
 if w.watch_definition ? 'definitionVersion' then
  insert into public.structured_media_email_preferences(watch_id,user_id,enabled) values(w.id,w.user_id,p_enabled)
  on conflict(watch_id) do update set enabled=excluded.enabled;
 end if;
 return public.get_media_watch_email_policy(w.id);
end $$;
-- Keep the existing boolean consent UI/API consistent for enrolled Structured Watches.
create function public.sync_media_digest_consent() returns trigger language plpgsql security definer set search_path='' as $$begin
 if TG_OP='INSERT' or old.enabled is distinct from new.enabled then
  if exists(select 1 from public.media_watch_email_policies where watch_id=new.watch_id and user_id=new.user_id) then
   perform public.cancel_media_digests(new.watch_id);
   update public.media_watch_email_policies set enabled=new.enabled,mode=case when new.enabled and mode='off' then 'daily_digest' else mode end,eligible_after=clock_timestamp() where watch_id=new.watch_id and user_id=new.user_id;
  end if;
 end if; return new;
end $$;
create trigger structured_digest_consent after insert or update on public.structured_media_email_preferences for each row execute function public.sync_media_digest_consent();

-- Capture mode at article creation, while completion holds the Watch lock. An
-- off observation remains in history but can never become a re-opt-in backlog.
create function public.route_media_digest_article() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.media_watch_email_policies%rowtype;
begin
 select * into p from public.media_watch_email_policies where watch_id=new.watch_id and user_id=new.user_id;
 if p.watch_id is not null then
  new.delivery_mode:=p.mode;
  if not public.media_digest_consent(new.watch_id,new.user_id) or new.created_at<p.eligible_after then
   new.status:='failed';new.last_error_code:='EMAIL_OPTED_OUT';
  end if;
 end if;return new;
end $$;
create trigger route_media_digest_article before insert on public.media_watch_notifications for each row execute function public.route_media_digest_article();
create function public.invalidate_media_digest() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.monitoring_state is distinct from old.monitoring_state or new.deleted_at is distinct from old.deleted_at or new.watch_definition is distinct from old.watch_definition or new.monitoring_source is distinct from old.monitoring_source then
  if exists(select 1 from public.media_watch_email_policies where watch_id=new.id) then perform public.cancel_media_digests(new.id);end if;
 end if;return new;
end $$;
create trigger invalidate_media_digest after update on public.watches for each row execute function public.invalidate_media_digest();

-- Transactional creation wrappers: called ONLY when the server feature gate is
-- enabled. No enrollment of an existing Watch, even on a creation retry.
create function public.persist_media_watch_with_digest(p_id uuid,p_title text,p_source jsonb,p_definition jsonb,p_state text,p_revision bigint,p_mutation uuid,p_deleted boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare existed boolean; result jsonb;
begin
 if auth.role() is distinct from 'authenticated' or auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select exists(select 1 from public.watches where id=p_id) into existed;
 result:=public.persist_media_watch(p_id,p_title,p_source,p_definition,p_state,p_revision,p_mutation,p_deleted);
 if not existed and p_revision=0 and not p_deleted and p_source->>'type' is distinct from 'currency' then
  insert into public.media_watch_email_policies(watch_id,user_id) values(p_id,auth.uid()) on conflict do nothing;
 end if;return result;
end $$;
create function public.persist_structured_watch_with_digest(p_owner uuid,p_id uuid,p_operation text,p_mutation uuid,p_revision bigint,p_title text,p_source jsonb,p_definition jsonb,p_definition_fingerprint text,p_payload_fingerprint text) returns jsonb language plpgsql security definer set search_path='' as $$
declare existed boolean; result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select exists(select 1 from public.watches where id=p_id) into existed;
 result:=public.persist_structured_watch_v1(p_owner,p_id,p_operation,p_mutation,p_revision,p_title,p_source,p_definition,p_definition_fingerprint,p_payload_fingerprint);
 if not existed and p_operation='create' and p_definition->'plan'->>'domain'='media_news' then
  insert into public.media_watch_email_policies(watch_id,user_id) values(p_id,p_owner) on conflict do nothing;
 end if;return result;
end $$;

-- SQL claim remains the final authority: digest/off records never enter the
-- individual-email path, including the existing exact Staging selector.
alter function public.claim_media_watch_email_notification(uuid,uuid) rename to claim_media_watch_email_notification_pre_digest;
revoke all on function public.claim_media_watch_email_notification_pre_digest(uuid,uuid) from public,anon,authenticated,service_role;
create function public.claim_media_watch_email_notification(p_notification_id uuid,p_claim_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select target.* into w from public.watches target join public.media_watch_notifications n on n.watch_id=target.id and n.user_id=target.user_id where n.id=p_notification_id for update of target;
 if w.id is null or not exists(select 1 from public.media_watch_notifications where id=p_notification_id and delivery_mode='immediate') then return null;end if;
 if exists(select 1 from public.media_watch_email_policies where watch_id=w.id) and not public.media_digest_consent(w.id,w.user_id) then return null;end if;
 return public.claim_media_watch_email_notification_pre_digest(p_notification_id,p_claim_token);
end $$;

create function public.prepare_media_watch_digests(p_send_hour integer,p_owners uuid[],p_structured boolean) returns integer language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; digest uuid; count_created integer:=0; period_day date:=public.media_digest_period(clock_timestamp());
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if p_send_hour is null or p_send_hour not between 0 and 23 or p_structured is null or (p_structured and coalesce(cardinality(p_owners),0)=0) then raise exception 'Invalid scope' using errcode='22023';end if;
 if extract(hour from clock_timestamp() at time zone 'UTC')<p_send_hour then return 0;end if;
 for w in select target.* from public.watches target join public.media_watch_email_policies p on p.watch_id=target.id and p.user_id=target.user_id
 where p.mode='daily_digest' and public.media_digest_consent(target.id,target.user_id)
 and (target.watch_definition ? 'definitionVersion')=p_structured
 and (not p_structured or target.user_id=any(p_owners))
 and exists(select 1 from public.media_watch_notifications n where n.watch_id=target.id and n.user_id=target.user_id and n.delivery_mode='daily_digest' and n.status='pending' and n.digest_id is null and n.submission_started_at is null and n.created_at>=p.eligible_after)
 order by target.id limit 10 for update of target skip locked loop
  insert into public.media_watch_digests(watch_id,user_id,period) values(w.id,w.user_id,period_day) on conflict(watch_id,period) do nothing returning id into digest;
  if digest is not null then
   update public.media_watch_notifications set digest_id=digest where watch_id=w.id and user_id=w.user_id and delivery_mode='daily_digest' and status='pending' and digest_id is null and submission_started_at is null;
   count_created:=count_created+1;
  end if;
 end loop;return count_created;
end $$;
create function public.claim_media_watch_digest(p_id uuid,p_token uuid,p_owners uuid[],p_structured boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; d public.media_watch_digests%rowtype; articles jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select target.* into w from public.watches target join public.media_watch_digests x on x.watch_id=target.id and x.user_id=target.user_id where x.id=p_id for update of target;
 if w.id is null or p_token is null or p_structured is null or (w.watch_definition ? 'definitionVersion')<>p_structured or (p_structured and not coalesce(w.user_id=any(p_owners),false)) or not public.media_digest_consent(w.id,w.user_id) then return null;end if;
 update public.media_watch_digests set status='claimed',claim_token=p_token,claimed_at=clock_timestamp()
 where id=p_id and submission_started_at is null and (status='prepared' or(status='claimed' and claimed_at<clock_timestamp()-interval '30 minutes'))
 returning * into d;
 if d.id is null then return null;end if;
 select jsonb_agg(jsonb_build_object('id',n.source_article_id,'article',n.article) order by n.created_at,n.id) into articles from public.media_watch_notifications n where n.digest_id=d.id and n.status='pending' and n.user_id=w.user_id and n.watch_id=w.id;
 if articles is null then return null;end if;
 return jsonb_build_object('id',d.id,'watch_id',w.id,'user_id',w.user_id,'watch_title',w.title,'period',d.period,'articles',articles,'is_structured',p_structured);
end $$;
create function public.begin_media_watch_digest(p_id uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; d public.media_watch_digests%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select target.* into w from public.watches target join public.media_watch_digests x on x.watch_id=target.id and x.user_id=target.user_id where x.id=p_id for update of target;
 if w.id is null or not public.media_digest_consent(w.id,w.user_id) then return false;end if;
 if exists(select 1 from public.media_watch_digests where watch_id=w.id and submission_started_at is not null and public.media_digest_period(submission_started_at)=public.media_digest_period(clock_timestamp())) then return false;end if;
 update public.media_watch_digests set status='submitting',submission_started_at=clock_timestamp() where id=p_id and claim_token=p_token and status='claimed' and submission_started_at is null returning * into d;
 if d.id is null then return false;end if;
 update public.media_watch_notifications set claim_token=p_token,claimed_at=clock_timestamp(),submission_started_at=clock_timestamp(),attempt_count=attempt_count+1 where digest_id=d.id and status='pending';
 return true;
end $$;
create function public.finish_media_watch_digest(p_id uuid,p_token uuid,p_provider text,p_error text) returns boolean language plpgsql security definer set search_path='' as $$
declare d public.media_watch_digests%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 update public.media_watch_digests set status=case when nullif(p_provider,'') is not null and p_error is null then 'sent' else 'failed' end,
 sent_at=case when nullif(p_provider,'') is not null and p_error is null then clock_timestamp() end,
 provider_message_id=case when p_error is null then nullif(left(p_provider,200),'') end,error_code=left(p_error,80)
 where id=p_id and claim_token=p_token and status in ('claimed','submitting') and (p_provider is null or submission_started_at is not null) returning * into d;
 if d.id is null then return false;end if;
 update public.media_watch_notifications set status=case when d.status='sent' then 'sent' else 'failed' end,sent_at=d.sent_at,provider_message_id=d.provider_message_id,last_error_code=d.error_code where digest_id=d.id and status='pending';
 return true;
end $$;
-- Selection is service-only and bounded. Membership/claims are never browser-writable.
create function public.pending_media_watch_digests(p_owners uuid[],p_structured boolean) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(x.id) from(select d.id from public.media_watch_digests d join public.watches w on w.id=d.watch_id and w.user_id=d.user_id where (d.status='prepared' or(d.status='claimed' and d.claimed_at<clock_timestamp()-interval '30 minutes')) and d.submission_started_at is null and public.media_digest_consent(w.id,w.user_id) and (w.watch_definition ? 'definitionVersion')=p_structured and (not p_structured or w.user_id=any(p_owners)) order by d.period,d.id limit 10)x),'[]'::jsonb);
end $$;

-- Monitoring still records matches while transport gates are off. Only enrolled
-- consented Media policies opt into this; old Watch enqueue contracts are intact.
create function public.complete_media_check_with_digest(p_watch_id uuid,p_checked_at timestamptz,p_source_title text,p_source_url text,p_item_ids text[],p_items jsonb,p_expected_checked_at timestamptz,p_expected_items jsonb,p_outcome text,p_notification_items jsonb,p_enqueue_notifications boolean,p_expected_revision bigint)
returns text language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 return public.complete_scheduled_media_watch_check(p_watch_id,p_checked_at,p_source_title,p_source_url,p_item_ids,p_items,p_expected_checked_at,p_expected_items,p_outcome,p_notification_items,
 p_enqueue_notifications or public.media_digest_consent(p_watch_id,(select user_id from public.watches where id=p_watch_id)),p_expected_revision);
end $$;
create function public.finish_structured_check_with_digest(p_watch_id uuid,p_owner uuid,p_revision bigint,p_token uuid,p_checked_at timestamptz,p_source_title text,p_source_url text,p_items jsonb,p_expected_checked_at timestamptz,p_expected_items jsonb,p_matching jsonb,p_error text default null,p_enqueue_notifications boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 return public.finish_structured_media_check_with_notifications(p_watch_id,p_owner,p_revision,p_token,p_checked_at,p_source_title,p_source_url,p_items,p_expected_checked_at,p_expected_items,p_matching,p_error,
 p_enqueue_notifications or public.media_digest_consent(p_watch_id,p_owner));
end $$;
create or replace function public.maintain_media_watch_notifications(p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if p_enabled is null then raise exception 'Missing mode' using errcode='22023';end if;
 update public.media_watch_notifications set status='failed',last_error_code='EMAIL_DELIVERY_OUTCOME_UNKNOWN' where status='pending' and submission_started_at is not null and claimed_at<now()-interval '30 minutes';
 if not p_enabled then update public.media_watch_notifications set status='failed',last_error_code='EMAIL_DISABLED' where status='pending' and submission_started_at is null and delivery_mode='immediate';end if;
end $$;

-- Explicit ACLs on every new function, including internal and trigger helpers.
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('complete_media_check_with_digest','finish_structured_check_with_digest','media_digest_period','media_digest_consent','cancel_media_digests','get_media_watch_email_policy','set_media_watch_email_policy','sync_media_digest_consent','route_media_digest_article','invalidate_media_digest','persist_media_watch_with_digest','persist_structured_watch_with_digest','prepare_media_watch_digests','claim_media_watch_digest','begin_media_watch_digest','finish_media_watch_digest','pending_media_watch_digests','claim_media_watch_email_notification') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.get_media_watch_email_policy(uuid),public.set_media_watch_email_policy(uuid,text,boolean),public.persist_media_watch_with_digest(uuid,text,jsonb,jsonb,text,bigint,uuid,boolean) to authenticated;
grant execute on function public.persist_structured_watch_with_digest(uuid,uuid,text,uuid,bigint,text,jsonb,jsonb,text,text),public.prepare_media_watch_digests(integer,uuid[],boolean),public.claim_media_watch_digest(uuid,uuid,uuid[],boolean),public.begin_media_watch_digest(uuid,uuid),public.finish_media_watch_digest(uuid,uuid,text,text),public.pending_media_watch_digests(uuid[],boolean),public.claim_media_watch_email_notification(uuid,uuid) to service_role;
grant execute on function public.complete_media_check_with_digest(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,text,jsonb,boolean,bigint),public.finish_structured_check_with_digest(uuid,uuid,bigint,uuid,timestamptz,text,text,jsonb,timestamptz,jsonb,jsonb,text,boolean) to service_role;
notify pgrst,'reload schema';
commit;

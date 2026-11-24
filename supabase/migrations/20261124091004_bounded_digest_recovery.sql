begin;
-- Migration-time lower bound is immutable. No existing notification is rewritten.
do $$begin
 execute format('create function public.notification_recovery_floor() returns timestamptz language sql immutable set search_path='''' as %L',
  'select '||quote_literal(clock_timestamp())||'::timestamptz');
end $$;
alter table public.media_watch_digests add column recovery_since timestamptz;

-- Conservative automatic policy: one missed daily opportunity only. Unknown date,
-- a changed development, failed current check or equivalent delivery => review.
create function public.notification_recovery_eligible(p_id uuid,p_owner uuid,p_since timestamptz,p_activation timestamptz,p_digest uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare n public.media_watch_notifications%rowtype; w public.watches%rowtype; published timestamptz;
 day_key date:=(clock_timestamp() at time zone 'Europe/Paris')::date;
 lower_bound timestamptz; normal_bound timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if p_activation is null or p_since is null or p_activation<public.notification_recovery_floor() or p_activation>clock_timestamp() then return false;end if;
 lower_bound:=((day_key-2)+time '08:15') at time zone 'Europe/Paris';
 normal_bound:=greatest(p_since,((day_key-1)+time '08:15') at time zone 'Europe/Paris');
 select * into n from public.media_watch_notifications where id=p_id and user_id=p_owner;
 if n.id is null or n.status<>'pending' or n.delivery_mode<>'daily_digest' or n.attempt_count<>0
 or n.submission_started_at is not null or n.provider_message_id is not null or n.sent_at is not null
 or n.last_error_code is not null or n.created_at<greatest(lower_bound,p_activation,p_since) or n.created_at>=normal_bound then return false;end if;
 select * into w from public.watches where id=n.watch_id and user_id=p_owner;
 if w.id is null or not public.media_digest_consent(w.id,p_owner)
 or not exists(select 1 from public.media_watch_email_policies p where p.watch_id=w.id and p.user_id=p_owner and p.mode='daily_digest' and p.enabled and n.created_at>=p.eligible_after)
 or w.last_check_error_code is not null or w.last_checked_at<normal_bound or w.last_checked_at is null
 or w.last_change_item_id is distinct from n.source_article_id or w.last_change_url is distinct from n.article->>'url'
 or w.last_change_summary is distinct from n.article->>'summary' then return false;end if;
 -- Existing V3 evidence establishes a current, non-superseded development.
 -- Non-V3 / unknown relevance stays on the existing explicit-review path.
 if not exists(select 1 from public.v3_pilot_watches v where v.watch_id=w.id and v.user_id=p_owner
 and v.last_judgment->>'action' in ('ALERT','NO_ALERT')
 and v.last_judgment->>'evidence_status' in ('CONFIRMED','STRONG_UNCONFIRMED')
 and v.last_judgment->'condition_check'->>'condition_satisfied' is distinct from 'false') then return false;end if;
 if n.article->>'publishedAt' is null or coalesce(n.article->>'url','') not like 'https://%' then return false;end if;
 begin published:=(n.article->>'publishedAt')::timestamptz;exception when others then return false;end;
 if published<lower_bound or published>n.created_at then return false;end if;
 if not exists(select 1 from auth.users u where u.id=p_owner and u.email_confirmed_at is not null
 and u.email is not null and to_jsonb(u)->>'deleted_at' is null
 and (to_jsonb(u)->>'banned_until' is null or (to_jsonb(u)->>'banned_until')::timestamptz<=clock_timestamp())) then return false;end if;
 -- Unknown submission is as terminal as sent for automatic recovery.
 if exists(select 1 from public.media_watch_notifications later where later.watch_id=n.watch_id and later.user_id=p_owner and later.id<>n.id
 and (later.status='sent' or later.submission_started_at is not null or later.provider_message_id is not null)
 and (later.source_article_id=n.source_article_id or later.article->>'url'=n.article->>'url'
 or lower(trim(later.article->>'title'))=lower(trim(n.article->>'title'))
 or lower(trim(later.article->>'summary'))=lower(trim(n.article->>'summary')))) then return false;end if;
 if n.digest_id is not null and not exists(select 1 from public.media_watch_digests d where d.id=n.digest_id
 and d.watch_id=n.watch_id and d.user_id=p_owner and d.submission_started_at is null and d.provider_message_id is null
 and (d.status='prepared' or(d.status='claimed' and (d.id=p_digest or d.claimed_at<clock_timestamp()-interval '30 minutes')))) then return false;end if;
 return true;
end $$;

create function public.prepare_production_recovery_digests(p_owners uuid[],p_since timestamptz,p_activation timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.watches%rowtype; n public.media_watch_notifications%rowtype; d public.media_watch_digests%rowtype;
 ids jsonb:='[]'; day_key date:=(clock_timestamp() at time zone 'Europe/Paris')::date;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if p_activation is null or p_activation<public.notification_recovery_floor() or p_activation>clock_timestamp()
 or (clock_timestamp() at time zone 'Europe/Paris')::time<time '08:15'
 or (clock_timestamp() at time zone 'Europe/Paris')::time>=time '08:30' then return ids;end if;
 for w in select target.* from public.watches target where target.user_id=any(p_owners)
 and public.media_digest_consent(target.id,target.user_id) order by target.id for update skip locked loop
  if jsonb_array_length(ids)>=10 then exit;end if;
  select * into d from public.media_watch_digests where watch_id=w.id and period=day_key;
  if d.id is not null then
   -- Frozen membership is reused; never append to or reopen an existing digest.
   if d.recovery_since=p_activation and d.submission_started_at is null and (d.status='prepared' or(d.status='claimed' and d.claimed_at<clock_timestamp()-interval '30 minutes')) then ids:=ids||jsonb_build_array(d.id);end if;
   continue;
  end if;
  -- Normal delivery has priority, even if it was not prepared yet.
  if exists(select 1 from public.media_watch_notifications x where x.watch_id=w.id and x.user_id=w.user_id and x.status='pending'
   and x.delivery_mode='daily_digest' and x.digest_id is null and x.submission_started_at is null
   and x.created_at>=greatest(p_since,((day_key-1)+time '08:15') at time zone 'Europe/Paris')) then continue;end if;
  select * into n from public.media_watch_notifications x where x.watch_id=w.id and x.user_id=w.user_id
   and public.notification_recovery_eligible(x.id,w.user_id,p_since,p_activation) order by x.created_at desc,x.id limit 1 for update;
  if n.id is null then continue;end if;
  insert into public.media_watch_digests(watch_id,user_id,period,recovery_since) values(w.id,w.user_id,day_key,p_activation) returning * into d;
  update public.media_watch_notifications set digest_id=d.id where id=n.id and user_id=w.user_id;
  ids:=ids||jsonb_build_array(d.id);
 end loop;
 return ids;
end $$;

create function public.claim_production_recovery_digest(p_id uuid,p_token uuid,p_owners uuid[],p_since timestamptz,p_activation timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.media_watch_digests%rowtype; result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 perform 1 from public.watches w join public.media_watch_digests x on x.watch_id=w.id and x.user_id=w.user_id where x.id=p_id for update of w;
 select * into d from public.media_watch_digests where id=p_id;
 if d.id is null or d.recovery_since is distinct from p_activation or d.period<>(clock_timestamp() at time zone 'Europe/Paris')::date
 or not coalesce(d.user_id=any(p_owners),false)
 or (clock_timestamp() at time zone 'Europe/Paris')::time<time '08:15'
 or (clock_timestamp() at time zone 'Europe/Paris')::time>=time '08:30' then return null;end if;
 if (select count(*) from public.media_watch_notifications where digest_id=d.id)<>1
 or exists(select 1 from public.media_watch_notifications n where n.digest_id=d.id and (n.watch_id<>d.watch_id or n.user_id<>d.user_id
 or not public.notification_recovery_eligible(n.id,d.user_id,p_since,p_activation,d.id))) then return null;end if;
 result:=public.claim_media_watch_digest(p_id,p_token,p_owners,true);
 if result is null then return null;end if;
 return result||jsonb_build_object('recovery',true,'detected_at',(select created_at from public.media_watch_notifications where digest_id=d.id));
end $$;

create function public.begin_production_recovery_digest(p_id uuid,p_token uuid,p_owners uuid[],p_since timestamptz,p_activation timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.media_watch_digests%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 perform 1 from public.watches w join public.media_watch_digests x on x.watch_id=w.id and x.user_id=w.user_id where x.id=p_id for update of w;
 select * into d from public.media_watch_digests where id=p_id and claim_token=p_token and status='claimed';
 if d.id is null or d.recovery_since is distinct from p_activation or not coalesce(d.user_id=any(p_owners),false)
 or d.period<>(clock_timestamp() at time zone 'Europe/Paris')::date
 or (clock_timestamp() at time zone 'Europe/Paris')::time<time '08:15'
 or (clock_timestamp() at time zone 'Europe/Paris')::time>=time '08:30'
 or (select count(*) from public.media_watch_notifications where digest_id=d.id)<>1
 or exists(select 1 from public.media_watch_notifications n where n.digest_id=d.id and (n.watch_id<>d.watch_id or n.user_id<>d.user_id
 or not public.notification_recovery_eligible(n.id,d.user_id,p_since,p_activation,d.id))) then return false;end if;
 return public.begin_media_watch_digest(p_id,p_token);
end $$;

-- Recovery membership cannot leak through legacy or exact-test claims/renders.
alter function public.claim_media_watch_digest(uuid,uuid,uuid[],boolean) rename to claim_media_watch_digest_before_recovery;
revoke all on function public.claim_media_watch_digest_before_recovery(uuid,uuid,uuid[],boolean) from public,anon,authenticated,service_role;
create function public.claim_media_watch_digest(p_id uuid,p_token uuid,p_owners uuid[],p_structured boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.media_watch_digests%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 select * into d from public.media_watch_digests where id=p_id;
 if d.recovery_since is not null then return null;end if;
 return public.claim_media_watch_digest_before_recovery(p_id,p_token,p_owners,p_structured);
end $$;
-- The explicit recovery claim uses the reviewed original claim under its stricter checks.
do $$declare f text;begin
 select pg_get_functiondef('public.claim_production_recovery_digest(uuid,uuid,uuid[],timestamptz,timestamptz)'::regprocedure) into f;
 execute replace(f,'public.claim_media_watch_digest(', 'public.claim_media_watch_digest_before_recovery(');
end $$;
do $$declare name text;begin
 foreach name in array array['notification_recovery_floor()','notification_recovery_eligible(uuid,uuid,timestamptz,timestamptz,uuid)',
 'prepare_production_recovery_digests(uuid[],timestamptz,timestamptz)','claim_production_recovery_digest(uuid,uuid,uuid[],timestamptz,timestamptz)',
 'begin_production_recovery_digest(uuid,uuid,uuid[],timestamptz,timestamptz)','claim_media_watch_digest(uuid,uuid,uuid[],boolean)'] loop
 execute 'revoke all on function public.'||name||' from public,anon,authenticated';
 execute 'grant execute on function public.'||name||' to service_role';
 end loop;
end $$;
notify pgrst,'reload schema';
commit;

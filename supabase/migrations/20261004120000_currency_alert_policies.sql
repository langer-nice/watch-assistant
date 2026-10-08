begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
-- Separate immutable events from the latest evaluated observation. RLS is the
-- same owner boundary as Watches; clients cannot insert, update or delete events.
create table public.currency_watch_events (
 watch_id uuid not null references public.watches(id) on delete cascade,
 user_id uuid not null references auth.users(id), id text not null,
 detected_at timestamptz not null, article jsonb not null, evaluation jsonb,
 primary key(watch_id,id)
);
alter table public.currency_watch_events enable row level security;
create policy currency_events_owner_select on public.currency_watch_events for select to authenticated
 using (user_id=auth.uid());
-- Supabase default privileges can include TRUNCATE, which bypasses RLS.
-- Establish the intended immutable-history permissions explicitly.
revoke all on public.currency_watch_events from public,anon,authenticated,service_role;
grant select on public.currency_watch_events to authenticated,service_role;
grant insert on public.currency_watch_events to service_role;
-- Preserve original timestamps and prose; never substitute today's rate into
-- an old event. Older event evaluations may be unavailable.
insert into public.currency_watch_events(watch_id,user_id,id,detected_at,article,evaluation)
 select w.id,w.user_id,w.last_change_item_id,w.media_last_change_detected_at,
 jsonb_build_object('title',w.last_change_title,'excerpt',w.last_change_summary,'url',w.last_change_url,'publishedAt',w.last_change_published_at),
 case when (w.currency_evaluation->>'checkedAt')::timestamptz=w.media_last_change_detected_at then w.currency_evaluation else null end
 from public.watches w where w.monitoring_source->>'type'='currency' and w.last_change_item_id is not null and w.media_last_change_detected_at is not null;
create or replace function public.valid_media_definition(source jsonb, definition jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
begin
 if source->>'type' is distinct from 'currency' then return public.valid_feed_definition(source,definition); end if;
 return coalesce(
   source = jsonb_build_object('type','currency','provider','ecb','url','https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml')
   and definition - array['inputType','request','category','currencyCriteria','currencyRevision','currencyLanguage','currencyPolicy'] = '{}'::jsonb
   and definition->>'inputType' = 'text' and definition->>'category' = 'finance'
   and jsonb_typeof(definition->'request') = 'string' and char_length(btrim(definition->>'request')) between 1 and 500
   and definition->>'currencyRevision' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and definition->>'currencyLanguage' in ('en','fr')
   and (not definition ? 'currencyPolicy' or definition->>'currencyPolicy' in ('once','crossing','daily'))
   and (definition->'currencyCriteria') - array['base','quote','operator','target'] = '{}'::jsonb
   and definition->'currencyCriteria'->>'base' in ('GBP','EUR')
   and definition->'currencyCriteria'->>'quote' in ('GBP','EUR')
   and definition->'currencyCriteria'->>'base' <> definition->'currencyCriteria'->>'quote'
   and definition->'currencyCriteria'->>'operator' = 'gte'
   and jsonb_typeof(definition->'currencyCriteria'->'target') = 'string'
   and definition->'currencyCriteria'->>'target' ~ '^[0-9]{1,12}(\.[0-9]{1,12})?$'
   and (definition->'currencyCriteria'->>'target')::numeric > 0
   and octet_length(definition::text) <= 8000, false);
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
revoke all on function public.valid_media_definition(jsonb,jsonb) from public,anon;
grant execute on function public.valid_media_definition(jsonb,jsonb) to authenticated,service_role;
create or replace function public.invalidate_media_watch_baseline() returns trigger
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
  if (new.watch_definition - array['currencyPolicy','currencyLanguage']) is distinct from (old.watch_definition - array['currencyPolicy','currencyLanguage']) or new.monitoring_source is distinct from old.monitoring_source then
   delete from public.media_watch_snapshots where watch_id = old.id;
   new.last_checked_at := null;
   new.last_check_outcome := null;
  end if;
 end if;
 return new;
end $$;
create or replace function public.complete_currency_watch_check(p_watch_id uuid, p_checked_at timestamptz, p_source_title text, p_source_url text, p_item_ids text[], p_items jsonb, p_expected_checked_at timestamptz, p_expected_items jsonb, p_outcome text, p_notification_items jsonb, p_enqueue_notifications boolean, p_expected_revision bigint, p_evaluation jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare target public.watches%rowtype; previous public.media_watch_snapshots%rowtype;
 item jsonb; event_id text; changed boolean := false; policy text; prior jsonb; condition_id text; eligible boolean; met boolean; provider_rate numeric; target_rate numeric;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Currency completion requires service role' using errcode='42501'; end if;
 select * into target from public.watches where id=p_watch_id and type='media_news' and deleted_at is null and monitoring_state='monitoring' for update;
 if target.id is null or target.media_revision is distinct from p_expected_revision then return 'skipped'; end if;
 if target.monitoring_source->>'type' is distinct from 'currency'
   or p_evaluation is null or p_checked_at is null or p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)>1
   or p_evaluation->>'base' is distinct from target.watch_definition->'currencyCriteria'->>'base'
   or p_evaluation->>'quote' is distinct from target.watch_definition->'currencyCriteria'->>'quote'
   or p_evaluation->>'target' is distinct from target.watch_definition->'currencyCriteria'->>'target'
   or p_outcome not in ('currency-met','currency-not-met')
 then raise exception 'Invalid currency evaluation' using errcode='22023'; end if;
 select * into previous from public.media_watch_snapshots where watch_id=p_watch_id;
 if previous.watch_id is null then
   if p_expected_checked_at is not null or p_expected_items is not null then return 'skipped'; end if;
 elsif previous.checked_at is distinct from p_expected_checked_at or previous.items is distinct from p_expected_items or p_checked_at < previous.checked_at then return 'skipped'; end if;
 -- Recompute the exact decision from provider precision. Browser input cannot
 -- supply state, event eligibility or an already-rounded threshold decision.
 if p_evaluation->>'provider' is distinct from 'ecb'
   or p_evaluation->>'providerRate' !~ '^[0-9]{1,12}(\.[0-9]{1,12})?$'
   or p_evaluation->>'observationDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or (p_evaluation->>'observationDate')::date > p_checked_at::date
   or (p_evaluation->>'checkedAt')::timestamptz is distinct from p_checked_at
 then raise exception 'Invalid provider observation' using errcode='22023'; end if;
 provider_rate := (p_evaluation->>'providerRate')::numeric;
 target_rate := (p_evaluation->>'target')::numeric;
 if provider_rate <= 0 then raise exception 'Invalid rate'; end if;
 if p_evaluation->>'providerBase'=p_evaluation->>'base' and p_evaluation->>'providerQuote'=p_evaluation->>'quote' then
   met := provider_rate >= target_rate;
 elsif p_evaluation->>'providerBase'=p_evaluation->>'quote' and p_evaluation->>'providerQuote'=p_evaluation->>'base' then
   met := 1 >= target_rate * provider_rate;
 else raise exception 'Invalid pair'; end if;
 if (p_evaluation->>'met')::boolean is distinct from met then raise exception 'Invalid decision'; end if;
 prior := target.currency_evaluation;
 if prior is not null and (p_evaluation->>'observationDate' < prior->>'observationDate'
    or p_checked_at < (prior->>'checkedAt')::timestamptz) then return 'skipped'; end if;
 if prior->>'observationDate'=p_evaluation->>'observationDate' and
    (prior->>'providerRate' is distinct from p_evaluation->>'providerRate'
      or prior->>'providerBase' is distinct from p_evaluation->>'providerBase'
      or prior->>'providerQuote' is distinct from p_evaluation->>'providerQuote') then return 'skipped'; end if;
 policy := coalesce(target.watch_definition->>'currencyPolicy','once');
 condition_id := 'currency:' || (target.watch_definition->>'currencyRevision') || ':' || (p_evaluation->>'base') || ':' || (p_evaluation->>'quote') || ':' || (p_evaluation->>'target');
 event_id := case when policy='once' then condition_id else condition_id || ':' || (p_evaluation->>'observationDate') end;
 eligible := case when policy='once' then
   not exists(select 1 from public.currency_watch_events where watch_id=target.id and starts_with(id,condition_id))
   and not coalesce(starts_with(target.last_change_item_id,condition_id),false)
 when policy='crossing' then prior is null or (p_evaluation->>'observationDate' > prior->>'observationDate' and prior->>'met'='false')
 else prior is null or (p_evaluation->>'observationDate' > prior->>'observationDate' and
   (p_evaluation->>'providerRate' is distinct from prior->>'providerRate' or p_evaluation->>'providerBase' is distinct from prior->>'providerBase' or p_evaluation->>'providerQuote' is distinct from prior->>'providerQuote')) end;
 if met and eligible then
   item := p_items->0;
   if item->>'id' is distinct from event_id then raise exception 'Missing currency event' using errcode='22023'; end if;
   insert into public.currency_watch_events(watch_id,user_id,id,detected_at,article,evaluation)
     values(target.id,target.user_id,event_id,p_checked_at,item,p_evaluation) on conflict do nothing;
   changed := found;
   if changed and p_enqueue_notifications then
     insert into public.media_watch_notifications(watch_id,user_id,source_article_id,watch_title,article_position,article)
     values(target.id,target.user_id,event_id,left(target.title,200),1,
       jsonb_build_object('title',item->>'title','url',item->>'url','summary',item->>'excerpt','publishedAt',item->>'publishedAt','source','ECB','currencyEvaluation',p_evaluation)) on conflict do nothing;
   end if;
 end if;
 insert into public.media_watch_snapshots(watch_id,user_id,checked_at,baseline_at,source_title,source_url,item_ids,items)
 values(target.id,target.user_id,p_checked_at,coalesce(previous.baseline_at,p_checked_at),p_source_title,p_source_url,p_item_ids,p_items)
 on conflict(watch_id) do update set checked_at=excluded.checked_at,source_title=excluded.source_title,source_url=excluded.source_url,item_ids=excluded.item_ids,items=excluded.items;
 update public.watches set currency_evaluation=p_evaluation,last_checked_at=p_checked_at,last_check_outcome=p_outcome,last_check_error_code=null,
 current_status=case when changed then 'updated' else current_status end,
 media_last_change_detected_at=case when changed then p_checked_at else media_last_change_detected_at end,
 last_change_item_id=case when changed then event_id else last_change_item_id end,
 last_change_title=case when changed then item->>'title' else last_change_title end,
 last_change_url=case when changed then item->>'url' else last_change_url end,
 last_change_summary=case when changed then item->>'excerpt' else last_change_summary end,
 last_change_published_at=case when changed then (item->>'publishedAt')::timestamptz else last_change_published_at end
 where id=target.id;
 return case when changed then 'changed' else 'unchanged' end;
end $$;
revoke all on function public.complete_currency_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,text,jsonb,boolean,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.complete_currency_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,text,jsonb,boolean,bigint,jsonb) to service_role;

commit;

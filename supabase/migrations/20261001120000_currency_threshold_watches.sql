begin;
-- Reuse the owned definition/revision protocol and outbox; currency definitions select
-- a structured adapter and never enter the article baseline evaluator.
alter table public.watches add column currency_evaluation jsonb;
grant select(currency_evaluation) on public.watches to authenticated, service_role;
alter function public.valid_media_definition(jsonb,jsonb) rename to valid_feed_definition;
create function public.valid_media_definition(source jsonb, definition jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
begin
 if source->>'type' is distinct from 'currency' then return public.valid_feed_definition(source,definition); end if;
 return coalesce(
   source = jsonb_build_object('type','currency','provider','ecb','url','https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml')
   and definition - array['inputType','request','category','currencyCriteria','currencyRevision','currencyLanguage'] = '{}'::jsonb
   and definition->>'inputType' = 'text' and definition->>'category' = 'finance'
   and jsonb_typeof(definition->'request') = 'string' and char_length(btrim(definition->>'request')) between 1 and 500
   and definition->>'currencyRevision' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and definition->>'currencyLanguage' in ('en','fr')
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
-- CHECK constraints bind function OIDs, so explicitly point at the new dispatcher.
alter table public.watches drop constraint watches_media_definition_check;
alter table public.watches add constraint watches_media_definition_check
 check (type <> 'media_news' or public.valid_media_definition(monitoring_source,watch_definition));

create function public.invalidate_currency_evaluation() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.watch_definition->'currencyCriteria' is distinct from new.watch_definition->'currencyCriteria'
    or old.watch_definition->>'currencyRevision' is distinct from new.watch_definition->>'currencyRevision' then
   new.currency_evaluation := null;
   new.last_change_item_id := null; new.last_change_title := null; new.last_change_url := null;
   new.last_change_summary := null; new.last_change_published_at := null; new.media_last_change_detected_at := null;
   new.last_check_error_code := null;
 end if;
 return new;
end $$;
create trigger watches_invalidate_currency before update on public.watches
for each row execute function public.invalidate_currency_evaluation();

create function public.complete_currency_watch_check(p_watch_id uuid, p_checked_at timestamptz, p_source_title text, p_source_url text, p_item_ids text[], p_items jsonb, p_expected_checked_at timestamptz, p_expected_items jsonb, p_outcome text, p_notification_items jsonb, p_enqueue_notifications boolean, p_expected_revision bigint, p_evaluation jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare target public.watches%rowtype; previous public.media_watch_snapshots%rowtype;
 item jsonb; event_id text; changed boolean := false;
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
 event_id := 'currency:' || (target.watch_definition->>'currencyRevision') || ':' || (p_evaluation->>'base') || ':' || (p_evaluation->>'quote') || ':' || (p_evaluation->>'target');
 if p_evaluation->>'met' = 'true' and target.last_change_item_id is distinct from event_id then
   item := p_items->0;
   if item->>'id' is distinct from event_id then raise exception 'Missing currency event' using errcode='22023'; end if;
   changed := true;
   if p_enqueue_notifications then
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
create or replace function public.fail_scheduled_media_watch_check(p_watch_id uuid,p_revision bigint,p_expected_checked_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Scheduled monitoring requires service role' using errcode='42501'; end if;
 update public.watches w set last_checked_at=case when monitoring_source->>'type'='currency' then last_checked_at else now() end,
 last_check_error_code=case when monitoring_source->>'type'='currency' then 'CURRENCY_PROVIDER_UNAVAILABLE' else 'MEDIA_CHECK_FAILED' end
 where w.id=p_watch_id and w.type='media_news' and w.media_revision=p_revision
 and (select s.checked_at from public.media_watch_snapshots s where s.watch_id=w.id) is not distinct from p_expected_checked_at;
end $$;

commit;

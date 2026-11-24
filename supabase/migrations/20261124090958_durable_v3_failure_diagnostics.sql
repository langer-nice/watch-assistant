begin;
-- Additive RPC. The existing fail RPC and historical JSON contract remain intact.
create function public.fail_v3_pilot_check_diagnostic(p_id uuid,p_token uuid,p_diagnostic jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare s public.structured_media_schedules%rowtype; d jsonb; at_time timestamptz:=clock_timestamp();
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service required' using errcode='42501';end if;
 perform 1 from public.watches where id=p_id for update;
 select * into s from public.structured_media_schedules where watch_id=p_id and lease_token=p_token for update;
 if s.watch_id is null then return;end if;
 -- Construct the allowlist again at the persistence boundary. Unknown inputs never pass through.
 d:=jsonb_build_object('watch_id',p_id,'timestamp',to_char(at_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'attempt_id',case when p_diagnostic->>'attempt_id' ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then p_diagnostic->>'attempt_id' end,
 'context_id',case when p_diagnostic->>'context_id' ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then p_diagnostic->>'context_id' end,
 'stage',case when p_diagnostic->>'stage'=any(array['WATCH_LOAD','SOURCE_ACQUISITION','EVIDENCE_NORMALIZATION','BRAIN_CALL','BRAIN_RESPONSE_VALIDATION','EVIDENCE_REF_ADMISSION','RESULT_PERSISTENCE','NOTIFICATION_ELIGIBILITY','REPORT_ELIGIBILITY']) then p_diagnostic->>'stage' else 'UNKNOWN' end,
 'error_code',case when p_diagnostic->>'error_code' ~ '^([0-9]{5}|HTTP_[45][0-9]{2})$' or p_diagnostic->>'error_code'=any(array['TIMEOUT','NETWORK_ERROR','DNS_FAILURE','UPSTREAM_ERROR','ACCESS_DENIED','SOURCE_NOT_FOUND','TOO_MANY_REDIRECTS','INVALID_REDIRECT','INVALID_SOURCE_URL','UNSUPPORTED_CONTENT_TYPE','EMPTY_RESPONSE','EMPTY_FEED','NOT_A_FEED','UNSAFE_XML','MALFORMED_XML','RESPONSE_TOO_LARGE','INVALID_RESPONSE','CURRENCY_PROVIDER_UNAVAILABLE','INVALID_CURRENCY_DATA','INVALID_CURRENCY_CRITERIA','STALE_CURRENCY_DATA','ECONNRESET','ECONNREFUSED','ENOTFOUND','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','rate_limit_exceeded','insufficient_quota','server_error','invalid_api_key']) then p_diagnostic->>'error_code' else 'V3_PILOT_CHECK_FAILED' end,
 'category',case when p_diagnostic->>'category'=any(array['Error','TypeError','SyntaxError','RangeError','AbortError','TimeoutError','CheckWatchError']) then p_diagnostic->>'category' else 'Error' end,
 'retry_scheduled',s.lease_kind is distinct from 'manual');
 perform public.fail_v3_pilot_check(p_id,p_token);
 -- Update only the failure just appended by the fenced existing transaction.
 update public.v3_pilot_watches set history=jsonb_set(history,array[(jsonb_array_length(history)-1)::text],
 (history->-1)||jsonb_build_object('diagnostic',d))
 where watch_id=p_id and history->-1->>'status'='failed';
end $$;
revoke all on function public.fail_v3_pilot_check_diagnostic(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.fail_v3_pilot_check_diagnostic(uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;

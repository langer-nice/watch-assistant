begin;
-- Typed compatibility criteria belong to the connector adapter, never to a
-- paraphrased user instruction or a second Intent call.
do $$declare f text;begin
 if to_regprocedure('public.claim_v3_pilot_checks()') is null then return;end if;
 select pg_get_functiondef('public.claim_v3_pilot_checks()'::regprocedure) into f;
 if position('p.prior_state,p.evaluation' in f)=0 then raise exception 'Unexpected pilot claim contract';end if;
 execute replace(f,'p.prior_state,p.evaluation','p.prior_state,p.evaluation,w.watch_definition->''currencyCriteria'' as criteria');
end $$;
notify pgrst,'reload schema';
commit;

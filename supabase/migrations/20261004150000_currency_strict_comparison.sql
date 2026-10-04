-- Add strict comparisons without changing existing definitions, history or grants.
begin;
do $$
declare definition text;
begin
 select pg_get_functiondef('public.valid_media_definition(jsonb,jsonb)'::regprocedure) into definition;
 if position('currencyPolicy' in definition)=0 or position('''operator'' = ''gte''' in definition)=0 then
   raise exception 'Unexpected currency validator: recurring policy migration required';
 end if;
 definition := replace(definition, '''operator'' = ''gte''', '''operator'' in (''gte'',''gt'')');
 execute definition;
 select pg_get_functiondef('public.complete_currency_watch_check(uuid,timestamptz,text,text,text[],jsonb,timestamptz,jsonb,text,jsonb,boolean,bigint,jsonb)'::regprocedure) into definition;
 if position('met := provider_rate >= target_rate;' in definition)=0
    or position('met := 1 >= target_rate * provider_rate;' in definition)=0 then
   raise exception 'Unexpected currency completion function';
 end if;
 definition := replace(definition, 'met := provider_rate >= target_rate;',
   'met := case when p_evaluation->>''operator''=''gt'' then provider_rate > target_rate else provider_rate >= target_rate end;');
 definition := replace(definition, 'met := 1 >= target_rate * provider_rate;',
   'met := case when p_evaluation->>''operator''=''gt'' then 1 > target_rate * provider_rate else 1 >= target_rate * provider_rate end;');
 definition := replace(definition, 'or p_evaluation->>''target'' is distinct',
   'or p_evaluation->>''operator'' is distinct from target.watch_definition->''currencyCriteria''->>''operator''
   or p_evaluation->>''target'' is distinct');
 execute definition;
end $$;
commit;

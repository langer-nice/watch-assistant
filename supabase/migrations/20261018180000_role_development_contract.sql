begin;
-- Extend the existing source-bound definition with separate role-resolution evidence.
create or replace function public.watch_definition_v1_schema() returns jsonb language sql immutable set search_path='' as $schema$ select $json${"type":"object","properties":{"definitionVersion":{"type":"string","enum":["watch-definition.v1"]},"inputType":{"type":"string","enum":["text"]},"request":{"type":"string","minLength":1,"maxLength":500},"category":{"type":"string","enum":["general","travel","news","property","price","events","entertainment","finance"]},"interpretation":{"type":"object","properties":{"schemaVersion":{"type":"string","enum":["interpretation.v1"]},"language":{"type":"string","enum":["en","fr","mixed","und"]},"intent":{"type":"string","enum":["ongoing_news","event","numeric_condition","change","unknown"]},"domain":{"type":"string","enum":["media_news","currency","official_company","ticket_availability","other","unknown"]},"subjects":{"type":"array","items":{"anyOf":[{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},"type":{"type":"string","enum":["person","organization","product","event","topic","currency","place","unknown"]},"label":{"type":"string","minLength":1,"maxLength":200},"canonicalCode":{"anyOf":[{"type":"string","enum":["GBP","EUR"]},{"type":"null"}]},"kind":{"type":"string","enum":["individual"]},"membership":{"type":"array","items":{"type":"object","properties":{"attribute":{"type":"string","enum":["nationality","sport","tour","country_association","industry","other"]},"operator":{"type":"string","enum":["eq","in"]},"values":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":1,"maxItems":8}},"required":["attribute","operator","values"],"additionalProperties":false},"minItems":0,"maxItems":0},"members":{"type":"array","items":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},"minItems":0,"maxItems":0},"quantifier":{"type":"null"}},"required":["id","type","label","canonicalCode","kind","membership","members","quantifier"],"additionalProperties":false},{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},"type":{"type":"string","enum":["person","organization","product","event","topic","place","unknown"]},"label":{"type":"string","minLength":1,"maxLength":200},"canonicalCode":{"type":"null"},"kind":{"type":"string","enum":["open_group"]},"membership":{"type":"array","items":{"type":"object","properties":{"attribute":{"type":"string","enum":["nationality","sport","tour","country_association","industry","other"]},"operator":{"type":"string","enum":["eq","in"]},"values":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":1,"maxItems":8}},"required":["attribute","operator","values"],"additionalProperties":false},"minItems":1,"maxItems":8},"members":{"type":"array","items":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},"minItems":0,"maxItems":16},"quantifier":{"type":"string","enum":["any","all"]}},"required":["id","type","label","canonicalCode","kind","membership","members","quantifier"],"additionalProperties":false},{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},"type":{"type":"string","enum":["person","organization","product","event","topic","place","unknown"]},"label":{"type":"string","minLength":1,"maxLength":200},"canonicalCode":{"type":"null"},"kind":{"type":"string","enum":["closed_group"]},"membership":{"type":"array","items":{"type":"object","properties":{"attribute":{"type":"string","enum":["nationality","sport","tour","country_association","industry","other"]},"operator":{"type":"string","enum":["eq","in"]},"values":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":1,"maxItems":8}},"required":["attribute","operator","values"],"additionalProperties":false},"minItems":0,"maxItems":0},"members":{"type":"array","items":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},"minItems":2,"maxItems":16},"quantifier":{"type":"string","enum":["any","all"]}},"required":["id","type","label","canonicalCode","kind","membership","members","quantifier"],"additionalProperties":false}]},"minItems":0,"maxItems":16},"conditions":{"type":"array","items":{"anyOf":[{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},"op":{"type":"string","enum":["predicate"]},"kind":{"type":"string","enum":["news_about","mentions_together","event","relationship","numeric","topic","temporal","geographic"]},"subjects":{"type":"array","items":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},"minItems":0,"maxItems":16},"value":{"anyOf":[{"type":"string","minLength":1,"maxLength":200},{"type":"null"}]},"operator":{"anyOf":[{"type":"string","enum":["gt","gte","lt","lte","eq"]},{"type":"null"}]},"amount":{"anyOf":[{"type":"string","minLength":1,"maxLength":26,"pattern":"^-?\\d{1,12}(?:\\.\\d{1,12})?$"},{"type":"null"}]},"unit":{"anyOf":[{"type":"string","minLength":1,"maxLength":80},{"type":"null"}]}},"required":["id","op","kind","subjects","value","operator","amount","unit"],"additionalProperties":false},{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},"op":{"type":"string","enum":["and","or"]},"args":{"type":"array","items":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},"minItems":2,"maxItems":16}},"required":["id","op","args"],"additionalProperties":false},{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},"op":{"type":"string","enum":["not"]},"args":{"type":"array","items":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},"minItems":1,"maxItems":1}},"required":["id","op","args"],"additionalProperties":false}]},"minItems":0,"maxItems":32},"condition":{"anyOf":[{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},{"type":"null"}]},"topics":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string","minLength":1,"maxLength":200},"role":{"type":"string","enum":["required","coverage_focus"]}},"required":["label","role"],"additionalProperties":false},"minItems":0,"maxItems":16},"temporal":{"type":"array","items":{"type":"object","properties":{"text":{"type":"string","minLength":1,"maxLength":200},"relation":{"type":"string","enum":["before","after","between","at","relative","unspecified"]},"start":{"anyOf":[{"type":"string","minLength":1,"maxLength":80},{"type":"null"}]},"end":{"anyOf":[{"type":"string","minLength":1,"maxLength":80},{"type":"null"}]},"timezone":{"anyOf":[{"type":"string","minLength":1,"maxLength":80},{"type":"null"}]}},"required":["text","relation","start","end","timezone"],"additionalProperties":false},"minItems":0,"maxItems":8},"geographic":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string","minLength":1,"maxLength":200},"appliesTo":{"type":"string","enum":["subject","event","source","content_language"]}},"required":["label","appliesTo"],"additionalProperties":false},"minItems":0,"maxItems":8},"exclusions":{"type":"array","items":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[a-z][a-z0-9_]*$"},"minItems":0,"maxItems":16},"recurrence":{"type":"string","enum":["once","crossing","per_observation","per_new_item","unspecified"]},"ambiguities":{"type":"array","items":{"type":"object","properties":{"field":{"type":"string","minLength":1,"maxLength":200},"alternatives":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":2,"maxItems":8},"question":{"type":"string","minLength":1,"maxLength":300}},"required":["field","alternatives","question"],"additionalProperties":false},"minItems":0,"maxItems":8},"unresolvedRequirements":{"type":"array","items":{"type":"object","properties":{"text":{"type":"string","minLength":1,"maxLength":200},"reason":{"type":"string","minLength":1,"maxLength":200}},"required":["text","reason"],"additionalProperties":false},"minItems":0,"maxItems":16},"evidence":{"type":"array","items":{"type":"object","properties":{"path":{"type":"string","minLength":1,"maxLength":160,"pattern":"^/(?:subjects/[0-9]+/(?:label|membership/[0-9]+)|conditions/[0-9]+|topics/[0-9]+|temporal/[0-9]+|geographic/[0-9]+|unresolvedRequirements/[0-9]+|recurrence)$"},"start":{"type":"integer","minimum":0,"maximum":499},"end":{"type":"integer","minimum":1,"maximum":500},"text":{"type":"string","minLength":1,"maxLength":500}},"required":["path","start","end","text"],"additionalProperties":false},"minItems":0,"maxItems":96}},"required":["schemaVersion","language","intent","domain","subjects","conditions","condition","topics","temporal","geographic","exclusions","recurrence","ambiguities","unresolvedRequirements","evidence"],"additionalProperties":false},"plan":{"type":"object","properties":{"schemaVersion":{"type":"string","enum":["monitoring-plan.v1"]},"interpretationVersion":{"type":"string","enum":["interpretation.v1"]},"registryVersion":{"type":"string","enum":["capabilities.v1"]},"interpretationRef":{"type":"string","minLength":1,"maxLength":64,"pattern":"^[a-f0-9]{64}$"},"status":{"type":"string","enum":["supported"]},"executable":{"type":"boolean","enum":[false]},"domain":{"type":"string","enum":["media_news","currency","official_company"]},"adapter":{"type":"string","enum":["google_news_literal_v1","ecb_reference_v1","bodacc_siren_v1"]},"criteria":{"anyOf":[{"type":"object","properties":{"kind":{"type":"string","enum":["media_literal"]},"subjects":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":1,"maxItems":8},"matchMode":{"type":"string","enum":["all"]},"topics":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":0,"maxItems":8},"exclusions":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":0,"maxItems":8},"query":{"type":"string","minLength":1,"maxLength":500},"edition":{"type":"string","enum":["GB:en"]}},"required":["kind","subjects","matchMode","topics","exclusions","query","edition"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","enum":["media_literal"]},"subjects":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":1,"maxItems":8},"matchMode":{"type":"string","enum":["all"]},"topics":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":0,"maxItems":8},"exclusions":{"type":"array","items":{"type":"string","minLength":1,"maxLength":200},"minItems":0,"maxItems":8},"query":{"type":"string","minLength":1,"maxLength":500},"edition":{"type":"string","enum":["GB:en"]},"roleResolution":{"type":"object","properties":{"officeId":{"type":"string","enum":["papacy"]},"originalRole":{"type":"string","minLength":1,"maxLength":200},"personId":{"type":"string","minLength":1,"maxLength":200},"name":{"type":"string","minLength":1,"maxLength":100},"names":{"type":"array","items":{"type":"string","minLength":1,"maxLength":100},"minItems":1,"maxItems":2},"sourceUrl":{"type":"string","minLength":1,"maxLength":200},"verifiedAt":{"type":"string","minLength":1,"maxLength":40}},"required":["officeId","originalRole","personId","name","names","sourceUrl","verifiedAt"],"additionalProperties":false}},"required":["kind","subjects","matchMode","topics","exclusions","query","edition","roleResolution"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","enum":["ecb_threshold"]},"base":{"type":"string","enum":["GBP","EUR"]},"quote":{"type":"string","enum":["GBP","EUR"]},"operator":{"type":"string","enum":["gt","gte"]},"target":{"type":"string","minLength":1,"maxLength":25,"pattern":"^\\d{1,12}(?:\\.\\d{1,12})?$"},"policy":{"type":"string","enum":["once","crossing","daily"]}},"required":["kind","base","quote","operator","target","policy"],"additionalProperties":false},{"type":"object","properties":{"kind":{"type":"string","enum":["bodacc_siren"]},"siren":{"type":"string","minLength":1,"maxLength":9,"pattern":"^\\d{9}$"},"country":{"type":"string","enum":["FR"]}},"required":["kind","siren","country"],"additionalProperties":false}]},"limitations":{"type":"array","items":{"type":"string","minLength":1,"maxLength":100},"minItems":1,"maxItems":16}},"required":["schemaVersion","interpretationVersion","registryVersion","interpretationRef","status","executable","domain","adapter","criteria","limitations"],"additionalProperties":false},"metadata":{"type":"object","properties":{"validatorVersion":{"type":"string","enum":["watch-definition-validator.v1"]},"compilerVersion":{"type":"string","enum":["watch-definition-compiler.v1"]},"planFingerprint":{"type":"string","minLength":64,"maxLength":64,"pattern":"^[a-f0-9]{64}$"}},"required":["validatorVersion","compilerVersion","planFingerprint"],"additionalProperties":false}},"required":["definitionVersion","inputType","request","category","interpretation","plan","metadata"],"additionalProperties":false}$json$::jsonb; $schema$;
create or replace function public.watch_literal_query(criteria jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare entry text; result text:=''; term text; plain boolean;
begin
 if criteria ? 'roleResolution' then
  select '('||string_agg('"'||value||'"',' OR ' order by ordinal)||') (pope OR pape OR pontiff) (health OR santé OR hospital OR hôpital OR surgery OR opération OR medical OR médical)'
  into result from jsonb_array_elements_text(criteria->'roleResolution'->'names') with ordinality x(value,ordinal);
  return result;
 end if;
 plain:=jsonb_array_length(criteria->'subjects')=1;
 for entry in select jsonb_array_elements_text(criteria->'subjects') loop
  if entry ~* '^royal caribbean (group|cruises( ltd\.?)?)$' then term:='("Royal Caribbean Cruises" OR "Royal Caribbean Group")';
  elsif plain then term:=entry;
  else term:='"'||replace(entry,'"','')||'"'; end if;
  result:=result||case when result='' then '' else ' ' end||term;
 end loop;
 for entry in select jsonb_array_elements_text(criteria->'topics') loop result:=result||' "'||translate(entry,'"\','')||'"'; end loop;
 for entry in select jsonb_array_elements_text(criteria->'exclusions') loop result:=result||' -"'||translate(entry,'"\','')||'"'; end loop;
 return result;
end $$;
create or replace function public.valid_structured_watch_definition(source jsonb, definition jsonb) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare i jsonb:=definition->'interpretation'; p jsonb:=definition->'plan'; c jsonb:=p->'criteria';
 expanded jsonb; subject jsonb; entry jsonb; node jsonb; terms jsonb; extra jsonb; key text; label text;
 ids text[]; reached text[]; expected jsonb; query text; siren text; digits text[]; checksum integer:=0; siren_index integer; digit integer;
begin
 if jsonb_typeof(source) is distinct from 'object' or octet_length(definition::text)>32768 or not public.watch_matches_schema(definition,public.watch_definition_v1_schema()) then return false; end if;
 if jsonb_array_length(i->'ambiguities')<>0 or jsonb_array_length(i->'unresolvedRequirements')<>0 or jsonb_array_length(i->'temporal')<>0
   or jsonb_array_length(i->'subjects')=0 or p->>'domain' is distinct from i->>'domain' then return false; end if;
 if p->'limitations' is distinct from (case p->>'adapter'
  when 'google_news_literal_v1' then (case when c ? 'roleResolution' then '["literal_title_excerpt_only","approved_aliases_only","first_20_feed_items","non_exhaustive_coverage","baseline_before_alerts","edition_preference_not_geography","dynamic_verified_role_holder","evidence_required_developments","conservative_event_deduplication"]'::jsonb else '["literal_title_excerpt_only","approved_aliases_only","first_20_feed_items","non_exhaustive_coverage","baseline_before_alerts","edition_preference_not_geography"]'::jsonb end)
  when 'ecb_reference_v1' then '["published_reference_rates_only","no_continuous_market_monitoring","one_observation_per_publication_date","daily_policy_requires_changed_rate"]'::jsonb
  when 'bodacc_siren_v1' then '["BODACC_not_all_company_events","first_100_notices","company_identity_requires_source_verification","baseline_before_alerts"]'::jsonb end) then return false; end if;
 select array_agg(value->>'id') into ids from jsonb_array_elements(i->'subjects');
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then return false; end if;
 for subject in select jsonb_array_elements(i->'subjects') loop
  if subject->>'kind'<>'individual' then return false; end if;
  if (i->>'domain'='media_news' and subject->>'type' not in ('person','organization','product','event','topic','place'))
    or (i->>'domain'='currency' and subject->>'type'<>'currency') or (i->>'domain'='official_company' and subject->>'type'<>'organization') then return false; end if;
  if not exists(select 1 from jsonb_array_elements(i->'conditions') n where coalesce(n->'subjects','[]') ? (subject->>'id')) then return false; end if;
  if not exists(select 1 from jsonb_array_elements(i->'evidence') e where e->>'path'='/subjects/'||((select ordinal-1 from jsonb_array_elements(i->'subjects') with ordinality s(value,ordinal) where value=subject))||'/label'
    and e->>'text'=subject->>'label') then return false; end if;
 end loop;
 for entry in select jsonb_array_elements(i->'evidence') loop
  if (i #> string_to_array(substring(entry->>'path',2),'/')) is null then return false; end if;
  if public.watch_utf16_slice(definition->>'request',(entry->>'start')::integer,(entry->>'end')::integer) is distinct from entry->>'text' then return false; end if;
 end loop;
 for key in select unnest(array['topics','geographic']) loop
  for entry in select value from jsonb_array_elements(i->key) loop
   if not exists(select 1 from jsonb_array_elements(i->'evidence') e where e->>'path'='/'||key||'/'||((select ordinal-1 from jsonb_array_elements(i->key) with ordinality s(value,ordinal) where value=entry limit 1))) then return false; end if;
  end loop;
 end loop;
 if i->>'recurrence'<>'unspecified' and not exists(select 1 from jsonb_array_elements(i->'evidence') e where e->>'path'='/recurrence'
  and e->>'text' ~* case i->>'recurrence'
   when 'once' then '\m(once|one time|une seule fois)\M' when 'crossing' then '\m(cross(es|ing)?|franchit|franchissement)\M'
   when 'per_observation' then '\m(each observation|every observation|every published rate|chaque observation|chaque publication)\M'
   when 'per_new_item' then '\m(each new article|every new article|each new item|chaque nouvel article|chaque nouvelle publication)\M' end) then return false; end if;
 select array_agg(value->>'id') into ids from jsonb_array_elements(i->'conditions');
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then return false; end if;
 for node in select jsonb_array_elements(i->'conditions') loop
  if not exists(select 1 from jsonb_array_elements(i->'evidence') e where e->>'path'='/conditions/'||((select ordinal-1 from jsonb_array_elements(i->'conditions') with ordinality s(value,ordinal) where value=node))) then return false; end if;
  if node->>'op'='predicate' then
   if node->>'kind' in ('news_about','mentions_together') and (node->'value'<>'null'::jsonb or node->'operator'<>'null'::jsonb or node->'amount'<>'null'::jsonb or node->'unit'<>'null'::jsonb
     or (node->>'kind'='news_about' and jsonb_array_length(node->'subjects')<>1) or (node->>'kind'='mentions_together' and jsonb_array_length(node->'subjects')<2)) then return false; end if;
   if jsonb_array_length(node->'subjects')=0 or (select count(distinct v) from jsonb_array_elements_text(node->'subjects') v)<>jsonb_array_length(node->'subjects') then return false; end if;
   for key in select jsonb_array_elements_text(node->'subjects') loop
    if not exists(select 1 from jsonb_array_elements(i->'subjects') s where s->>'id'=key) then return false; end if;
   end loop;
  elsif node->>'op'='or' then return false;
  else
   if (select count(distinct v) from jsonb_array_elements_text(node->'args') v)<>jsonb_array_length(node->'args') then return false; end if;
   for key in select jsonb_array_elements_text(node->'args') loop if not key=any(ids) then return false; end if; end loop;
  end if;
 end loop;
 -- All nodes must be reachable, within the same bounded graph used by the shared validator.
 with recursive walk(id,path) as (
  select value,array[value] from (select i->>'condition' value union select jsonb_array_elements_text(i->'exclusions')) roots
  union all select child.value,w.path||child.value from walk w
   join lateral (select n from jsonb_array_elements(i->'conditions') n where n->>'id'=w.id) parent on true
   join lateral jsonb_array_elements_text(coalesce(parent.n->'args','[]')) child on true
   where cardinality(w.path)<=8 and not child.value=any(w.path)
 ) select array_agg(distinct id) into reached from walk;
 if reached is null or not reached @> ids or not ids @> reached then return false; end if;
 -- Rebuild the omitted plan graph and original request; bind both fingerprints.
 expanded:=p||jsonb_build_object('originalRequest',definition->'request','subjects',i->'subjects','conditions',i->'conditions',
  'condition',i->'condition','topics',i->'topics','exclusions',i->'exclusions','geographic',i->'geographic','recurrence',i->'recurrence');
 select jsonb_agg(s||jsonb_build_object('label',btrim(regexp_replace(s->>'label','\s+',' ','g'))) order by ordinal)
  into entry from jsonb_array_elements(i->'subjects') with ordinality entries(s,ordinal);
 expanded:=jsonb_set(expanded,'{subjects}',entry);
 if p->>'interpretationRef'<>encode(sha256(convert_to(public.watch_canonical_json(i||jsonb_build_object('originalRequest',definition->'request')),'UTF8')),'hex')
  or definition->'metadata'->>'planFingerprint'<>encode(sha256(convert_to(public.watch_canonical_json(expanded),'UTF8')),'hex') then return false; end if;
 if i->>'domain'='media_news' then
  if p->>'adapter'<>'google_news_literal_v1' or c->>'kind'<>'media_literal' or jsonb_array_length(i->'geographic')<>0 or i->>'recurrence' not in ('unspecified','per_new_item') then return false; end if;
  terms:=public.watch_media_terms(i,i->>'condition'); if terms is null then return false; end if;
  for key in select jsonb_array_elements_text(i->'exclusions') loop
   extra:=public.watch_media_terms(i,key,true); if extra is null then return false; end if;
   terms:=jsonb_set(terms,'{exclusions}',(terms->'exclusions')||(extra->'exclusions'));
  end loop;
  for entry in select jsonb_array_elements(i->'topics') loop
   if entry->>'role'='required' then terms:=jsonb_set(terms,'{topics}',(terms->'topics')||jsonb_build_array(btrim(regexp_replace(entry->>'label','\s+',' ','g')))); end if;
  end loop;
  foreach key in array array['subjects','topics','exclusions'] loop
   select coalesce(jsonb_agg(to_jsonb(value) order by first_ordinal),'[]') into entry from
    (select (array_agg(value order by ordinal))[1] value,min(ordinal) first_ordinal from jsonb_array_elements_text(terms->key) with ordinality e(value,ordinal) group by lower(value)) unique_terms;
   if entry is distinct from c->key then return false; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements_text(c->'subjects') s cross join jsonb_array_elements_text(c->'exclusions') x
    where lower(s)=lower(x) or (s ~* '^royal caribbean (group|cruises( ltd\.?)?)$' and x ~* '^royal caribbean (group|cruises( ltd\.?)?)$'))
    or exists(select 1 from jsonb_array_elements_text(c->'topics') t cross join jsonb_array_elements_text(c->'exclusions') x where lower(t)=lower(x))
    or exists(select 1 from jsonb_array_elements(i->'topics') t where t->>'role'='coverage_focus' and exists(select 1 from jsonb_array_elements_text(c->'topics') x where lower(x)=lower(t->>'label'))) then return false; end if;
  if jsonb_array_length(c->'subjects')=1 and c->'subjects'->>0 ~* '^(the )?(current )?pope$|^((le|du) )?pape( actuel)?$'
   and (c->'topics' ? 'health' or c->'topics' ? 'santé') and not c ? 'roleResolution' then return false;end if;
  if c ? 'roleResolution' then
   if jsonb_array_length(c->'subjects')<>1 or jsonb_array_length(c->'topics')<>1 or jsonb_array_length(c->'exclusions')<>0
    or c->'subjects'->>0 !~* '^(the )?(current )?pope$|^((le|du) )?pape( actuel)?$'
    or c->'topics'->>0 not in ('health','santé')
    or c->'roleResolution'->>'originalRole' is distinct from c->'subjects'->>0
    or c->'roleResolution'->>'sourceUrl'<>'https://www.vatican.va/content/vatican/en.html'
    or c->'roleResolution'->>'personId' !~ '^https://www[.]vatican[.]va/content/vatican/en/holy-father/[a-z0-9-]+[.]html$'
    or c->'roleResolution'->>'name' is distinct from c->'roleResolution'->'names'->>0
    or exists(select 1 from jsonb_array_elements_text(c->'roleResolution'->'names') x where x ~ '["\\\r\n]')
    or (c->'roleResolution'->>'verifiedAt')::timestamptz is null then return false;end if;
  end if;
  query:=public.watch_literal_query(c); if query<>c->>'query' then return false;end if;
  expected:=jsonb_build_object('type','feed','query',query,'url','https://news.google.com/rss/search?q='||public.watch_form_encode(query)||'&hl=en-GB&gl=GB&ceid=GB%3Aen');
 elsif i->>'domain'='currency' then
  if p->>'adapter'<>'ecb_reference_v1' or c->>'kind'<>'ecb_threshold' or jsonb_array_length(i->'conditions')<>1
    or jsonb_array_length(i->'subjects')<>2 or jsonb_array_length(i->'geographic')<>0 or jsonb_array_length(i->'topics')<>0 or jsonb_array_length(i->'exclusions')<>0 then return false; end if;
  node:=i->'conditions'->0;
  if node->>'op'<>'predicate' or node->>'kind'<>'numeric' or node->>'value'<>'exchange_rate' or node->>'operator'<>c->>'operator'
    or jsonb_array_length(node->'subjects')<>2 or node->>'unit'<>c->>'quote'
    or trim(trailing '.' from regexp_replace((node->>'amount')::numeric::text,'(\.[0-9]*?)0+$','\1'))<>c->>'target'
    or (c->>'target')::numeric<=0 or c->>'base'=c->>'quote' then return false; end if;
  select array_agg(match[1]) into digits from regexp_matches(definition->>'request','([0-9]+(?:[.,][0-9]+)?)','g') match;
  if cardinality(digits)>2 or cardinality(digits)=2 and digits[1]<>'1' then return false; end if;
  select s into subject from jsonb_array_elements(i->'subjects') s where s->>'id'=node->'subjects'->>0;
  if subject->>'canonicalCode' is distinct from c->>'base' then return false; end if;
  select s into subject from jsonb_array_elements(i->'subjects') s where s->>'id'=node->'subjects'->>1;
  if subject->>'canonicalCode' is distinct from c->>'quote' then return false; end if;
  if i->>'recurrence' not in ('once','crossing','per_observation') or (i->>'recurrence' in ('once','crossing') and c->>'policy'<>i->>'recurrence')
    or (i->>'recurrence'='per_observation' and (c->>'policy'<>'daily' or not exists(select 1 from jsonb_array_elements(i->'evidence') e where e->>'path'='/recurrence'
      and e->>'text' ~* '(chaque|whenever|every|each)'
      and regexp_replace(e->>'text','(taux de change|exchange rate)','rate','gi') ~* '(changes?|changed|different|modifi|nouveau.*(taux|cours)|new.*(rate|publication))'
      and e->>'text' !~* '\m(unchanged|without changes?|sans changement|inchang)'))) then return false; end if;
  expected:='{"type":"currency","provider":"ecb","url":"https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"}';
 elsif i->>'domain'='official_company' then
  if p->>'adapter'<>'bodacc_siren_v1' or c->>'kind'<>'bodacc_siren' or jsonb_array_length(i->'subjects')<>1 or jsonb_array_length(i->'conditions')<>1
    or i->'conditions'->0->>'op' is distinct from 'predicate'
    or i->'subjects'->0->>'type'<>'organization' or i->'conditions'->0->>'kind'<>'event' or i->'conditions'->0->>'value'<>'official_registry_filing'
    or definition->>'request' !~* '\mBODACC\M' or i->>'recurrence' not in ('unspecified','per_new_item')
    or jsonb_array_length(i->'topics')<>0 or jsonb_array_length(i->'exclusions')<>0 then return false; end if;
  for entry in select jsonb_array_elements(i->'geographic') loop if entry->>'appliesTo'<>'source' or lower(entry->>'label') not in ('fr','france') then return false; end if; end loop;
  siren:=c->>'siren';
  select array_agg(distinct regexp_replace(match[1],'\s','','g')) into digits from regexp_matches(definition->>'request','([0-9](?:[\s  ]*[0-9])*)','g') match;
  if cardinality(digits)<>1 or digits[1]<>siren then return false; end if;
  for siren_index in 1..9 loop digit:=substring(siren,siren_index,1)::integer; if siren_index%2=0 then digit:=digit*2; end if; checksum:=checksum+digit/10+digit%10; end loop;
  if checksum%10<>0 then return false; end if;
  expected:=jsonb_build_object('type','bodacc','provider','dila','siren',siren,'title','BODACC','discovery','official-company');
 else return false; end if;
 return coalesce(source=expected,false);
exception when others then return false;
end $$;

notify pgrst,'reload schema';
commit;

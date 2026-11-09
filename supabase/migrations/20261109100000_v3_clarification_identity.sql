begin;

-- Use the stored ordered question/answer pairs for both lookup and commit.
-- Keep the existing locks, service-role authorization and legacy fingerprints.
do $migration$
declare
  definition text := pg_get_functiondef('public.create_v3_watch(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb)'::regprocedure);
  old_declaration text := 'request_fingerprint text;';
  old_fingerprint text := ' request_fingerprint := encode(sha256(convert_to(jsonb_build_array(p_kind, p_instruction)::text, ''UTF8'')), ''hex'');';
  old_id_match text := 'and p.instruction = p_instruction and p.capture_kind = p_kind';
  old_duplicate_match text := 'and p.instruction = p_instruction and w.deleted_at is null';
  old_probe text := 'if p_understanding is null and p_source is null and p_criteria is null and p_baseline is null then';
begin
  if position('request_clarifications jsonb;' in definition) > 0 then return; end if;
  if position(old_declaration in definition) = 0 or position(old_fingerprint in definition) = 0
     or position(old_id_match in definition) = 0 or position(old_duplicate_match in definition) = 0
     or position(old_probe in definition) = 0 then
    raise exception 'Unexpected V3 creation identity contract';
  end if;
  definition := replace(definition, old_declaration, old_declaration || ' request_clarifications jsonb;');
  definition := replace(definition, old_fingerprint, $identity$
 request_clarifications := coalesce(p_understanding->'clarifications', '[]'::jsonb);
 if jsonb_typeof(request_clarifications) is distinct from 'array' then
   raise exception 'Invalid V3 clarification identity';
 end if;
 request_fingerprint := encode(sha256(convert_to(
   (case when request_clarifications = '[]'::jsonb then jsonb_build_array(p_kind, p_instruction)
     else jsonb_build_array(p_kind, p_instruction, request_clarifications) end)::text, 'UTF8')), 'hex');
$identity$);
  definition := replace(definition, old_id_match, old_id_match ||
    ' and coalesce(p.understanding->''clarifications'', ''[]''::jsonb) = request_clarifications');
  definition := replace(definition, old_duplicate_match, old_duplicate_match ||
    ' and coalesce(p.understanding->''clarifications'', ''[]''::jsonb) = request_clarifications' ||
    ' and (request_clarifications = ''[]''::jsonb or p.capture_kind = p_kind)');
  definition := replace(definition, old_probe, $probe$
 if p_source is null and p_criteria is null and p_baseline is null
    and (p_understanding is null or p_understanding = jsonb_build_object('clarifications', request_clarifications)) then
$probe$);
  execute definition;
end;
$migration$;

commit;

// Presentation metadata in the existing Intent call, never a second model call.
export function watchTitleRequest(request, locale) {
 const schema=structuredClone(request.response_schema);
 schema.properties.display_title={type:['string','null'],minLength:1,maxLength:160};
 schema.required.push('display_title');
 return {...request,response_schema:schema,instructions:request.instructions+
  '\nAlso return display_title as a separate presentation label, normally 4–10 words (up to 16 when needed to distinguish the subject). Use a concise noun phrase naming the monitored subject and meaningful event/category, plus place when useful. Preserve proper nouns. Avoid request prefixes such as Tell me when, Keep me informed or Monitor, exclusion clauses, generic labels, full-sentence prose, trailing explanations and copying or truncating the request. Reuse an already concise suitable subject label when appropriate. '+
  (locale?'Write it in '+(locale==='fr'?'French':'English')+'.':'Write it in the language of the user request.')+
  ' Do not shorten or change canonical_text, references, constraints or the detailed story to fit the label. Never add this title guidance as a monitoring requirement. Return null for display_title unless READY_TO_MONITOR.'};
}
export function validateWatchTitle(value) {
 if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>160||value.split(/\s+/u).length>16||/[\r\n]/u.test(value)
  ||/^(?:tell me when|keep me (?:informed|updated)|notify me|alert me|monitor\b)/iu.test(value)
  ||/\b(?:exclude|excluding)\b/iu.test(value))throw new TypeError('Invalid Watch display title');
 return value; // Admission only: never clip, rewrite or retry a title.
}

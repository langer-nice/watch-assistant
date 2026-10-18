// Role intent stays in the user's language; external identity is separate evidence.
export const ROLE_SOURCE = 'https://www.vatican.va/content/vatican/en.html';
export const roleDevelopmentIntent = interpretation => {
 const v=interpretation,s=v?.subjects?.[0];
 const topics=[...(v?.topics||[]).filter(t=>t.role==='required').map(t=>t.label),...(v?.conditions||[]).filter(n=>n.op==='predicate'&&n.kind==='topic').map(n=>n.value)];
 return v?.domain==='media_news' && v.intent==='ongoing_news' && v.subjects.length===1
  && s.kind==='individual' && s.type==='person'
  && /^(?:the\s+)?(?:current\s+)?pope$|^(?:(?:le|du)\s+)?pape(?:\s+actuel)?$/iu.test(s.label.trim())
  && topics.length>0 && topics.every(topic=>/^(?:health|santé)$/iu.test(topic))
  && !v.ambiguities.length && !v.exclusions.length && !v.temporal.length && !v.geographic.length
  ? {officeId:'papacy',originalRole:s.label,topic:'health'} : null;
};
export const validRoleResolution = (r,role) => Boolean(r && r.officeId==='papacy' && r.originalRole===role
 && r.sourceUrl===ROLE_SOURCE && /^https:\/\/www\.vatican\.va\/content\/vatican\/en\/holy-father\/[a-z0-9-]+\.html$/.test(r.personId)
 && typeof r.name==='string' && /^[\p{L} .'-]+[IVXLCDM]*$/u.test(r.name) && r.name.length<100
 && Array.isArray(r.names) && r.names.length>=1 && r.names.length<=2 && r.names[0]===r.name
 && r.names.every(n=>typeof n==='string'&&n.length>0&&n.length<100&&!/["\\\r\n]/u.test(n))
 && typeof r.verifiedAt==='string' && /^\d{4}-\d\d-\d\dT/.test(r.verifiedAt) && Number.isFinite(Date.parse(r.verifiedAt)));
export const roleDevelopmentQuery = r => `(${r.names.map(n=>'"'+n+'"').join(' OR ')}) (pope OR pape OR pontiff) (health OR santé OR hospital OR hôpital OR surgery OR opération OR medical OR médical)`;

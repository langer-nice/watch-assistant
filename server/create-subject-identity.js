// Server-owned dependency: lookup must return independently verified records.
// No provider/network, model IDs, alias catalog or subject-specific rules here.
const fold=s=>s.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
const text=s=>typeof s==='string'&&s.length>0&&s.length<=500&&s.trim()===s;
export function resolveCreateSubjectIdentity(mention,{verifiedLookup}={}){
  if(!text(mention))throw Object.assign(Error('Invalid subject identity'),{code:'INVALID_CREATE_SEMANTIC_FRAME',reason:'identity_input'});
  const exact={key:`named_entity:${fold(mention)}`,label:mention,status:'EXACT',referenceVersion:null};
  if(!verifiedLookup)return exact;
  const records=verifiedLookup(mention);
  if(!Array.isArray(records))throw Object.assign(Error('Invalid identity reference'),{code:'INVALID_CREATE_SEMANTIC_FRAME',reason:'identity_reference'});
  const matches=records.filter(r=>text(r?.key)&&text(r.label)&&text(r.referenceVersion)
    &&Array.isArray(r.mentions)&&r.mentions.some(s=>text(s)&&fold(s)===fold(mention))
    &&typeof r.sourceUrl==='string'&&/^https:\/\//u.test(r.sourceUrl));
  if(matches.length!==records.length)throw Object.assign(Error('Invalid identity reference'),{code:'INVALID_CREATE_SEMANTIC_FRAME',reason:'identity_reference'});
  const keys=new Set(matches.map(r=>r.key));
  if(keys.size>1)return {...exact,status:'AMBIGUOUS'};
  if(!matches.length)return {...exact,status:'UNRESOLVED'};
  if(matches.some(r=>r.label!==matches[0].label))return {...exact,status:'AMBIGUOUS'};
  const r=[...matches].sort((a,b)=>`${a.referenceVersion}\n${a.sourceUrl}`.localeCompare(`${b.referenceVersion}\n${b.sourceUrl}`,'en'))[0];
  return {key:r.key,label:r.label,status:'RESOLVED',referenceVersion:r.referenceVersion,sourceUrl:r.sourceUrl};
}

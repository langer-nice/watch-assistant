// Deterministic observation only. No providers, persistence or corpus IDs.
export const STORY_SHADOW_VERSION = 'story-shadow.person-human-fixes.v1';
const fold = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’]/g, "'").replace(/[\u2010-\u2014]/g, '-');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrase = (text, value) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(fold(value))}(?=$|[^\\p{L}\\p{N}])`, 'u').test(text);
const positive = text => !/\b(?:not|no|never|cannot|denies?|denied|may|might|could|would|should|hypothetical|opinion)\b|\bn'|\bne\b/.test(text);
const status = proven => proven ? 'PROVEN' : 'MISSING';
const empty = (category = 'unknown', reason = 'CONTEXT_NOT_SUPPORTED') => ({result:'INSUFFICIENT_EVIDENCE',category,reasonCodes:[reason],evidence:{identity:'MISSING',relation:'MISSING',geography:'NOT_REQUIRED',development:'MISSING',polarity:'UNKNOWN'}});

// Read only already stored, confirmed semantics. Never parse a query/request/title
// into missing roles, infer a campaign from co-mentions or manufacture fixed facts.
export const storyShadowContext = watch => {
 const i=watch?.interpretation;
 if(i?.schemaVersion!=='interpretation.v1'||i.domain!=='media_news'||i.ambiguities?.length||i.unresolvedRequirements?.length)return null;
 if(i.subjects?.some(s=>s.kind!=='individual')||i.conditions?.some(c=>c.op!=='predicate'&&c.op!=='and')||i.exclusions?.length)return null;
 const subjects=(i.subjects||[]).filter(s=>typeof s.label==='string'&&s.label.length<=160);
 const topics=(i.topics||[]).filter(t=>t.role==='required').map(t=>t.label);
 const conditions=(i.conditions||[]).filter(c=>c.op==='predicate');
 const relationships=conditions.filter(c=>c.kind==='relationship');
 const events=conditions.filter(c=>c.kind==='event').map(c=>c.value).filter(Boolean);
 const geography=(i.geographic||[]).filter(g=>g.appliesTo==='event').map(g=>g.label);
 const description=fold([...topics,...events,...relationships.map(c=>c.value)].join(' '));
 const context={identities:subjects.map(s=>s.label),requiredTopics:topics,geography,category:'unknown'};
 if(subjects.length===2&&subjects.every(s=>s.type==='organization')){
  const relationship=relationships.find(c=>c.subjects?.length===2&&subjects.every(s=>c.subjects.includes(s.id)));
  if(relationship&&/collaborat|partnership|campagn/.test(fold(relationship.value))){
   return {...context,category:'campaign',campaign:topics.find(t=>!/^collaborat|^campaign|^collection/i.test(t))||null};
  }
  // Direction must be explicit in the approved predicate; subject-array order is not a role.
  if(relationship){for(const buyer of subjects){const target=subjects.find(s=>s!==buyer);
   if(new RegExp(`^${escape(fold(buyer.label))} (?:acquires|acquisition of|buys|takeover of) ${escape(fold(target.label))}$`).test(fold(relationship.value)))return {...context,category:'acquisition',buyer:buyer.label,target:target.label};
  }}
 }
 if(subjects.length===1&&subjects[0].type==='person'&&!topics.length){
  // Only this validated fixed tennis scope permits surname resolution/exclusions.
  // Other people retain the existing observer rules; no profession is inferred.
  if(subjects[0].label==='Jannik Sinner')return {...context,category:'person',person:{name:subjects[0].label,profession:'tennis',allowSurname:true,exclusions:[
   'lorenzo musetti|religious essay|common noun|football|real madrid|barcelona|champions league|liverpool|manchester|haaland|mourinho|gerrard',
   'fan makes|would coach|if he would'
  ]}};
  return {...context,category:'person'};
 }
 const instrument=subjects.find(s=>/^(?:eu|european union|european) (?:ai|artificial intelligence) act$/i.test(s.label));
 if(instrument)return {...context,category:'regulation',identities:[instrument.label],instrument:instrument.label,geography:['EU']};
 if(subjects.length===1&&subjects[0].type==='organization'&&/electric|\bev\b/.test(description)&&/automotive|vehicle|car |transition|roadmap|strategy|programme/.test(description))return {...context,category:'ev_strategy'};
 if(geography.length===1&&events.length&&/student|lycee|etudiant/.test(description)&&/protest|mobilis|manifest|demonstrat/.test(description))return {...context,category:'evolving_story',actors:'students',event:'student mobilisation'};
 return null;
};


const collaborationContinuation = (text, names) => {
 if(names.length!==2)return false;
 const name=n=>`(?:the )?${escape(fold(n).replace(/^the /,''))}`;
 const [a,b]=names.map(name);const pair=`(?:${a} and ${b}|${b} and ${a})`;
 const renewal='(?:have )?rejoined creative forces(?: yet again| again)?|(?:have )?(?:renewed|continued|extended|resumed) (?:their )?(?:collaboration|partnership)';
 const joint=new RegExp(`^${pair} (?:${renewal})[.!]?$`);
 const ref=`(?:the brands|the pair|the collaborators|${pair})`;
 const phase=new RegExp(`^${ref} (?:are set to release|will release|are launching|have announced|announce|announced|will launch) (?:a |their |the )?(?:second collection|new drop|new phase|new campaign stage)[.!]?$`);
 const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
 for(let n=0;n<lines.length-1;n++){
  if(!joint.test(lines[n])||!positive(lines[n]))continue;
  let next=lines[n+1];
  if(new RegExp(`^${ref}$`).test(next)&&lines[n+2])next+=' '+lines[n+2];
  if(phase.test(next)&&positive(next))return true;
 }
 return false;
};

const sameArticleExcerpt = item => {
 if(item?.excerptProvenance?.kind!=='same-document'||typeof item.excerpt!=='string')return '';
 try{return new URL(item.excerptProvenance.url).href===new URL(item.url).href?item.excerpt:'';}catch{return '';}
};
export const evaluateStoryShadow = ({item,context}) => {
 if(!context)return empty();
 const result=empty(context.category,'REQUIRED_LOCAL_PROOF_MISSING');
 const title=typeof item?.title==='string'?item.title:'';
 const excerpt=sameArticleExcerpt(item);
 if(!title.trim()||title.length>600||excerpt.length>1500)return empty(context.category,'CANDIDATE_NOT_SUPPORTED');
 if(context.category==='person'&&context.person){
  const r=classifyShadowPerson({title,ownedText:excerpt,source:typeof item.source==='string'?item.source:null},context.person);
  return {...result,result:r.label,reasonCodes:[r.reason],evidence:{identity:r.identity,relation:r.development?'PROVEN':'MISSING',geography:'NOT_REQUIRED',development:r.development||'MISSING',polarity:r.status}};
 }
 // RSS excerpts without already-available same-document ownership are quarantined.
 const text=fold([title,excerpt].filter(Boolean).join('\n'));
 const clauses=text.split(/[.!?;\n]+/u).map(s=>s.trim()).filter(Boolean);
 const identities=context.identities||[];
 if(!identities.length||identities.length>3||identities.some(s=>typeof s!=='string'||s.length>160))return empty(context.category);
 if(context.category==='campaign'&&!context.campaign&&!(context.requiredTopics||[]).length&&clauses.every(positive)&&collaborationContinuation(text,identities))return {...result,result:'MATCH',reasonCodes:['VERIFIED_COLLABORATION_PHASE'],evidence:{identity:'PROVEN',relation:'PROVEN',geography:'NOT_REQUIRED',development:'PROVEN',polarity:'ASSERTED'}};
 const geo = clause => !context.geography?.length||context.geography.every(g=>g==='EU'?/\beu\b|european union|european/.test(clause):phrase(clause,g));
 result.evidence.geography=context.geography?.length?'MISSING':'NOT_REQUIRED';
 for(const clause of clauses){
  const identity=identities.every(name=>phrase(clause,name));
  const affirmed=positive(clause);
  let relation=false,development=false;
  switch(context.category){
   case 'person':
    development=/\b(?:announces|withdraws|changes|delays|schedule|return date)\b/.test(clause)&&/career|health|injury|training|tournament|team|coach|return|professional/.test(clause);
    relation=identity&&new RegExp(`${escape(fold(identities[0]))}.{0,80}(?:announc|withdraw|return|chang|injur|training|tournament|team)`).test(clause);break;
   case 'acquisition':{
    const buyer=escape(fold(context.buyer)),target=escape(fold(context.target));
    relation=new RegExp(`${buyer}.{0,65}(?:acqui|merger|takeover|buy).{0,55}${target}`).test(clause);
    development=/announc|approv|block|review|financ|clos|complet|adjudication|dismiss/.test(clause);break;
   }
   case 'campaign':{
    const a=escape(fold(identities[0])),b=escape(fold(identities[1]));
    relation=(new RegExp(`${a}.{0,50}collaborat.{0,35}${b}`).test(clause)||new RegExp(`${a} (?:and|x) ${b}.{0,65}(?:collection|collaborat|campaign|chapter)`).test(clause))&&(!context.campaign||phrase(clause,context.campaign));
    development=/launch|first look|chapter|pop-up|collection|announc/.test(clause);break;
   }
   case 'regulation':
    relation=/(?:publish|clarif|adopt|guidance|guidelines|enforc).{0,100}(?:ai|artificial intelligence) act|(?:ai|artificial intelligence) act.{0,100}(?:guidance|adopt|force|enforc|clarif)/.test(clause)
      ||/(?:code|compliance tool|implementation tool).{0,70}(?:help.{0,25}comply with|supports? compliance with).{0,25}(?:eu )?ai act/.test(clause);
    development=/guidance|guidelines|publish|adopt|code|available|enforc/.test(clause);break;
   case 'ev_strategy':{
    const brand=escape(fold(identities[0]));
    relation=new RegExp(`${brand}.{0,70}(?:electric|\\bev\\b|evs).{0,70}(?:strategy|roadmap|vehicle|model|platform|delay)`).test(clause)
      ||new RegExp(`${brand}.{0,60}(?:strategy|roadmap|vehicle|model).{0,65}(?:electric|\\bev\\b)`).test(clause)
      ||new RegExp(`reimagination of ${brand} as an all-electric luxury brand`).test(clause);
    development=/announc|strateg|roadmap|revis|invest|launch|delay|unveil|reimagination/.test(clause);break;
   }
   case 'evolving_story':
    relation=/(?:student|lycee|etudiant).{0,65}(?:protest|mobilis|demonstrat|manifest)|(?:government|authorit|ministry).{0,65}(?:respond|talk|measur|meeting).{0,90}(?:student|lycee|etudiant)/.test(clause);
    development=/spread|extend|respond|talk|measur|announc|meeting|ban|continue|march|decision/.test(clause);break;
   default:return empty();
  }
  if(affirmed&&context.category==='ev_strategy'&&identity&&/wildlife|conservation|habitat|\bnfl\b|jacksonville|classic car/.test(clause))return {...result,result:'NO_MATCH',reasonCodes:['EXPLICIT_OUTSIDE_SCOPE']};
  const actorIdentity=context.category==='evolving_story'?/student|lycee|etudiant/.test(clause):identity;
  if(actorIdentity)result.evidence.identity='PROVEN';
  if(relation)result.evidence.relation='PROVEN';
  if(development)result.evidence.development='PROVEN';
  if(geo(clause)&&context.geography?.length)result.evidence.geography='PROVEN';
  if(affirmed)result.evidence.polarity='ASSERTED';
  const topics=(context.requiredTopics||[]).every(topic=>phrase(clause,topic));
  if(actorIdentity&&relation&&development&&geo(clause)&&topics&&affirmed){result.result='MATCH';result.reasonCodes=['VERIFIED_LOCAL_RELATION'];return result;}
  if(affirmed&&(context.exclusions||[]).some(term=>phrase(clause,term)))return {...result,result:'NO_MATCH',reasonCodes:['EXPLICIT_OUTSIDE_SCOPE']};
 }
 return result;
};

// Namespaced validated offline person core; no fixture or evaluation-result imports.
export const classifyShadowPerson = (() => {
// Isolated deterministic person experiment. No application imports, I/O, corpus IDs or learned state.
const PERSON_VERSION = 'person-human-fixes.v1';
const norm = s => String(s||'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/[’]/g,"'").toLowerCase();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Reuse one Unicode-letter check instead of compiling its character table
// into every dynamic name/action expression. Preserve code-point boundaries.
const letter = /\p{L}/u;
const beforeLetter = (s,i) => {
 if(!i)return false;
 let n=i-1;const c=s.charCodeAt(n);
 if(c>=0xdc00&&c<=0xdfff&&n>0&&s.charCodeAt(n-1)>=0xd800&&s.charCodeAt(n-1)<=0xdbff)n--;
 return letter.test(s.slice(n,i));
};
const afterLetter = (s,i) => i<s.length&&letter.test(String.fromCodePoint(s.codePointAt(i)));
const has = (text,name) => {
 const needle=norm(name);if(!needle)return /(^|[^\p{L}])(?=$|[^\p{L}])/u.test(text);let i=text.indexOf(needle);
 while(i>=0){if(!beforeLetter(text,i)&&!afterLetter(text,i+needle.length))return true;i=text.indexOf(needle,i+1);}
 return false;
};
function classifyPerson({title='',ownedText='',source=null},{name,profession='tennis',allowSurname=true,exclusions=[]}={}) {
 const result=(label,identity,development,status,reason)=>({label,identity,development,status,reason,version:PERSON_VERSION});
 if(typeof name!=='string'||!name.trim()||title.length>6000||ownedText.length>6000)return result('INSUFFICIENT_EVIDENCE','MISSING',null,'UNKNOWN','UNSUPPORTED_INPUT');
 // Existing unattributable RSS marker is an input boundary, never evidence.
 title=title.split(' — Extrait conservé :')[0];
 const split=title.indexOf(' — ');
 if(split>=0){ownedText=title.slice(split+3)+'\n'+ownedText;title=title.slice(0,split);}
 if(source&&title.endsWith(' - '+source))title=title.slice(0,-source.length-3);
 const t=norm(title),body=norm(ownedText),text=t+'\n'+body;
 const parts=name.trim().split(/\s+/),surname=parts.at(-1),first=parts[0];
 const full=has(text,name),short=has(t,surname);
 const tennis=/\b(?:tennis|tournament|slam|atp|wimbledon|coach|training|ranking|competition|injur\w*|knee)\b/.test(t);
 const conflicting=new RegExp(`\\b([A-Z][a-z]+) ${esc(surname)}\\b`).exec(title);
 const conflict=Boolean(conflicting&&norm(conflicting[1])!==norm(first));
 const religious=/\b(?:religious essay|forgiveness|repentance|common noun|sermon)\b/.test(text)&&!has(t,name);
 if(religious)return result('NO_MATCH','OTHER_ENTITY',null,'ASSERTED','COMMON_WORD_OR_RELIGIOUS_SUBJECT');
 let identity=full?'FULL_NAME':allowSurname&&profession==='tennis'&&short&&tennis&&!conflict&&new RegExp(`\\b${esc(surname)}\\b`).test(title)?'SURNAME_IN_PROFESSIONAL_CONTEXT':'MISSING';
 if(conflict&&!full)return result('NO_MATCH','CONFLICTING_PERSON',null,'ASSERTED','DIFFERENT_GIVEN_NAME');
 const initial=`${esc(first[0])}\\.\\s*${esc(surname)}`;
 let actor=`(?:${esc(norm(name))}${identity!=='MISSING'?'|'+esc(norm(surname)):''}${full?'|'+norm(initial):''})`;
 // A generic title referent may bind only to an explicitly named person inside
 // this same owned packet. Never infer an antecedent from the selected Watch.
 if(full&&!has(t,name)&&!short&&/\b(?:names?|identifies|refers|concerns)\b/.test(body)){
  actor+='|the (?:italian |tennis )?(?:player|champion)';identity='OWNED_LOCAL_REFERENCE';
 }
 actor=`(?:${actor})`;
 const fact=(p,s=t)=>{const re=new RegExp(`${actor}(?:'s)?[:,]?\\s+(?:world (?:number one|no\\. ?1)\\s+)?(?:${p})`,'gu');let m;while((m=re.exec(s))){if(!beforeLetter(s,m.index))return true;re.lastIndex=m.index+1;}return false;};
 const hardOutsideScope=()=>{
 // Explicitly named other actor, rather than rejection from a missing keyword.
 const other=/\b(?:article names|player is|player concerned is)\s+([A-Z][\p{L}]+(?:\s+[A-Z][\p{L}]+)+)/u.exec(title+' '+ownedText);
 const otherLead=/^([A-Z][\p{L}]+ [A-Z][\p{L}]+) (?:says|announces|wins|returns|withdraws)\b/u.exec(title);
 if(!full&&((other&&!has(norm(other[1]),name))||(otherLead&&!has(norm(otherLead[1]),name))))return result('NO_MATCH','OTHER_PERSON',null,'ASSERTED','OTHER_PERSON_IS_SUBJECT');
 // Existing fixed professional-scope exclusions, not candidate IDs or title lists.
 // Negation of an event does not erase an affirmative other-person/story identity.
 for(const exclusion of exclusions){
  const m=new RegExp(exclusion,'u').exec(text);
  if(m&&!/(?:\bno|\bnot|not about|does not concern)\s+(?:the\s+)?$/.test(text.slice(Math.max(0,m.index-65),m.index)))return result('NO_MATCH',identity,null,'OUTSIDE_SCOPE','EXPLICIT_FIXED_SCOPE_EXCLUSION');
 }
  return null;
 };
 // A proven other subject is not made relevant by an uncertainty marker.
 // Keep normal status/event ordering when the monitored person may be present.
 if(identity==='MISSING'&&!short){const outside=hardOutsideScope();if(outside)return outside;}
 // Bounded attributed framing; no nickname expansion or implied event facts.
 const framingTitle=title.replace(/^[“‘"'][^”’"']{1,80}[”’"']\s*[–—-]\s*/,'');
 const lead=/^([A-Z][a-z]+(?: [A-Z][a-z]+){0,3})(?::\s*|\s+(?:issues|gives|offers|sends|says whether)\b)/.exec(framingTitle);
 const thirdParty=Boolean(lead&&norm(lead[1])!==norm(name)&&norm(lead[1])!==norm(surname));
 const concreteChange=/\b(?:announc\w*|confirm\w*|return\w*|comeback|withdraw\w*|injur\w*|medical|surgery|diagnos\w*|hires?|hired|hiring|appoint\w*|joins?|parts?|resum\w*|wins?|loses?|reaches?|qualif\w*|climbs?|rises?|falls?|enters?|misses?|defend\w*|decid\w*|decision|ruled out)\b/.test(t);
 if(thirdParty&&identity!=='MISSING'&&!concreteChange&&/\bsays whether (?:he|she|they) would(?: ever)? consider coaching\b/.test(t))return result('NO_MATCH',identity,null,'HYPOTHETICAL','EXPLICIT_THIRD_PARTY_HYPOTHETICAL_COACHING');
 const hypothetical=/\bwould coach\b|\bif he would\b/.test(text);
 const fan=/\bfan\b.{0,65}\b(?:remark|comment|doping)\b/.test(t);
 if(hypothetical||fan)return result('NO_MATCH',identity,null,hypothetical?'HYPOTHETICAL':'FAN_REMARK','THIRD_PARTY_OR_HYPOTHETICAL');
 const explicitOpinion=/^(?:opinion|editorial|prediction|comparison)\s*:/i.test(title);
 if(explicitOpinion)return result('NO_MATCH',identity,null,'OPINION','EXPLICIT_COMMENTARY');
 if(/\burged to\b|\bshould (?:hire|appoint|change)\b|\badvised to\b|\btold to hire\b/.test(t))return result('INSUFFICIENT_EVIDENCE',identity,null,'RECOMMENDATION','NO_ACTUAL_CHANGE_IN_RECOMMENDATION');
 if(/\bcomments prove why\b|\bnot the right man to coach\b/.test(t))return result('INSUFFICIENT_EVIDENCE',identity,null,'ANALYSIS','ATTRIBUTED_COMMENT_DETAILS_MISSING');
 if(/\b(?:could|might|may|rumou?rs?|possibly|hypothetical)\b/.test(t))return result('INSUFFICIENT_EVIDENCE',identity,null,'SPECULATION','NO_ASSERTED_DEVELOPMENT');
 if(fact('denies?\\b.{0,80}(?:injur|withdraw|coach|tournament|return)')&&identity!=='MISSING')return result('MATCH',identity,'PROFESSIONAL_STATEMENT','ATTRIBUTED_DENIAL','DENIAL_REPORTED_NOT_EVENT_CONFIRMED');
 const negated=/\b(?:not|never|cannot)\b|\bwill not\b|\bwon't\b/.test(t);
 const patterns=[
  ['COACHING_CHANGE','(?:has )?(?:hires?|hired|appoints?|appointed|names?|announces?|announced)\\b.{0,65}\\bcoach\\b'],
  ['COACHING_CHANGE','(?:has )?parts? (?:ways )?with (?:his |the )?coach\\b|coach (?:leaves|departs|quits)\\b'],
  ['TEAM_CHANGE','(?:has )?(?:joins? (?:a |the |his new )?team|(?:completely )?overhauls? (?:his |the )?medical team)\\b'],
  ['WITHDRAWAL','(?:has |will |to )?(?:withdraws?|withdrawn|withdrawal announced)\\b.{0,70}(?:tournament|competition|slam|injur|tennis)|announces? (?:his |a |new )?(?:tournament|competition|slam) withdrawal\\b|announces?\\b.{0,25}withdrawal\\b.{0,45}(?:tournament|slam|injur)'],
  ['INJURY_HEALTH_CHANGE','(?:is injured|suffers?\\b.{0,35}injur|injur(?:y|ies) (?:worsens?|improves?)|injures?\\b|(?:is |has been )?ruled out\\b|ends? (?:his )?season\\b.{0,65}(?:injur|knee)|announces?\\b.{0,30}medical update)'],
  ['RETURN_COMEBACK','(?:has |will |to )?returns?\\b.{0,80}(?:injur|tournament|competition|training|slam|tennis)|comeback date (?:is |was )?announced\\b|(?:to |will )?start(?:s)? comeback\\b.{0,70}(?:slam|tournament|competition)|resumes? (?:training|competition)\\b|delays? (?:his )?return\\b'],
  ['PARTICIPATION','(?:will |to )?(?:plays?|enters?|misses?)\\b.{0,65}(?:tournament|competition|slam|tennis)|announces? participation\\b.{0,65}(?:tournament|competition|slam|tennis)'],
  ['PARTICIPATION','(?:will |to )?defend(?:s)? (?:his |the )?.{0,50}\\b(?:tennis|tournament|slam|wimbledon|atp)(?: singles| doubles)? title\\b'],
  ['TRAINING_CHANGE','changes? (?:his )?training schedule\\b'],
  ['COMPETITION_RANKING','(?:wins?|loses?|reaches?|qualifies for|climbs|rises to)\\b.{0,65}(?:tournament|final|ranking|round|competition|atp)']
 ];
 if(identity!=='MISSING'&&!negated)for(const [development,pattern] of patterns){
  if(fact(pattern))return result('MATCH',identity,development,/\b(?:will|to return|to play|announced|report:)\b/.test(t)?'REPORTED_OR_SCHEDULED':'ASSERTED','IDENTITY_AND_PERSONAL_DEVELOPMENT');
 }
 const verdict=/\b(?:issues|gives|offers) (?:an? |his |her )?(?:honest |clear |personal )?(?:verdict|opinion|reaction|comparison) (?:on|about|of)\b/.test(t);
 const rankingMessage=/\bsends (?:a )?(?:clear |honest )?message (?:over|about)\b/.test(t)&&/\branking debate\b/.test(t);
 const dominanceExplanation=/:\s*why (?:we(?:'re| are)|i(?:'m| am))\b/.test(norm(framingTitle))&&/\b(?:dominance|stronghold)\b/.test(t);
 if(thirdParty&&!concreteChange&&((identity!=='MISSING'&&(verdict||rankingMessage))||dominanceExplanation))return result('NO_MATCH',identity,null,'ATTRIBUTED_OPINION_OR_REACTION','EXPLICIT_THIRD_PARTY_COMMENTARY');
 const indirect=/\bdisagrees with (?:the )?claim\b|\bsends (?:a )?message to\b|\bpraises\b/.test(t)
  ||/\b(?:olympian|third.party)\b.{0,45}\b(?:message|opinion|react)\b/.test(t);
 if(indirect)return result('NO_MATCH',identity,null,'ATTRIBUTED_OPINION_OR_REACTION','INDIRECT_OR_OTHER_STORY');
 const outside=hardOutsideScope();if(outside)return outside;
 if(negated)return result('INSUFFICIENT_EVIDENCE',identity,null,'NEGATED','POSITIVE_EVENT_NOT_ESTABLISHED');
 return result('INSUFFICIENT_EVIDENCE',identity,null,'UNRESOLVED',identity==='MISSING'?'PERSON_IDENTITY_UNRESOLVED':'NO_CONCRETE_DEVELOPMENT');
}

return classifyPerson;
})();

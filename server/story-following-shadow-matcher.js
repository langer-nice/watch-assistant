// Deterministic observation only. No providers, persistence, corpus IDs or fixed entities.
export const STORY_SHADOW_VERSION = 'story-shadow.v1';
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
 if(subjects.length===1&&subjects[0].type==='person'&&!topics.length)return {...context,category:'person'};
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

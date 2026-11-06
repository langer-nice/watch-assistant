import {googleNewsSource} from '../src/js/media-provider-query.js';
import {mediaArticleIdentityKeys} from './media-article-identity.js';
import {markV3Stage} from './v3-scheduled-diagnostics.js';

export const NEWS_QUERY_BUDGET=Object.freeze({queries:2,perQuery:20,finalItems:20});
export const MULTI_ENTITY_NEWS_QUERY_BUDGET=Object.freeze({...NEWS_QUERY_BUDGET,entities:4,queries:8});
const fold=s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const quote=s=>'"'+s.replace(/["\\]/g,' ').replace(/\s+/g,' ').trim()+'"';
const stop=new Set(fold('keep me updated informed tell notify alert watch monitor follow track please any new news information updates developments important major concerning regarding about when whenever if and or the a an in on of to for with at as is are be do does has have will may might even before after official confirmation credible reports future upcoming changes informez informez-moi tiens tiens-moi tenez tenez-moi informe informee informe-moi previens previens-moi surveille suivre suivi toute toutes tous tout des de du la le les un une sur au aux en et ou moi me mes mon nouvelles nouveaux nouvelle nouveau informations actualite actualites evolutions changements importants importantes important importante majeurs majeures grands grandes concernant propos sujet quand lorsque si annonces').split(' '));
for(const word of ['let','know','latest','anything','something','everything','someone','somebody','happening','this','that','they','them','it','developpements','developpement','grand','majeur','rester','tenir','not','excluding','except','without','sans','sauf','hors','pas'])stop.add(word);
// Bounded literal lexical equivalents, not inferred topics or domain dispatch.
// Only concepts actually present in verified Intent may select an entry.
const lexicon=[
 {en:'social movements',fr:'mouvements sociaux',ja:'社会運動'},
 {en:'protests',fr:'manifestations',ja:'抗議',aliases:['protest','demonstrations','demonstration','manifestation']},
 {en:'strikes',fr:'grèves',ja:'ストライキ',aliases:['strike','grève']},
 {en:'elections',fr:'élections',ja:'選挙',aliases:['election','élection']},
 {en:'summits',fr:'sommets',ja:'首脳会議',aliases:['summit','sommet']},
 {en:'referendums',fr:'référendums',ja:'国民投票',aliases:['referendum','référendum']},
 {en:'legislation',fr:'législation',ja:'立法'},
 {en:'concerts',fr:'concerts',ja:'コンサート',aliases:['concert']},
 {en:'tour dates',fr:'dates de tournée',ja:'ツアー日程',aliases:['tour','tours','tournee','tournées']},
 {en:'products',fr:'produits',ja:'製品',aliases:['product','produit']},
 {en:'launches',fr:'lancements',ja:'発売',aliases:['launch','lancement']},
 {en:'transfers',fr:'transferts',ja:'移籍',aliases:['transfer','transfert']},
 {en:'injuries',fr:'blessures',ja:'負傷',aliases:['injury','blessure']},
];
const literalTopic=label=>lexicon.some(entry=>[entry.en,entry.fr,entry.ja,...(entry.aliases||[])].some(word=>fold(word)===fold(label)));
const editions={FR:{language:'fr',hl:'fr',gl:'FR'},GB:{language:'en',hl:'en-GB',gl:'GB'},US:{language:'en',hl:'en-US',gl:'US'},JP:{language:'ja',hl:'ja',gl:'JP'}};
const international={language:'en',hl:'en-GB',gl:'GB'};
let regions;
const regionNames=()=>{
 if(regions)return regions;
 regions=new Map();
 const displays=['en','fr','ja'].map(language=>new Intl.DisplayNames([language],{type:'region'}));
 const codes=['150','EU'];
 for(let a=65;a<=90;a++)for(let b=65;b<=90;b++)codes.push(String.fromCharCode(a,b));
 for(const code of codes){
  if(new Intl.Locale('und-'+code).region!==code)continue; // Canonicalize obsolete aliases, e.g. FX → FR.
  for(const display of displays){const name=display.of(code);if(name&&name!==code)regions.set(fold(name),{code,name:displays[0].of(code)});}
 }
 return regions;
};
const words=s=>(fold(s).match(/[\p{L}\p{N}]+/gu)||[]).filter(w=>w.length>1&&!stop.has(w));
const strip=(text,label)=>text.replace(new RegExp('(?<![\\p{L}\\p{N}])'+escape(fold(label))+'(?![\\p{L}\\p{N}])','gu'),' ');
// Conservative acquisition opt-in: an explicit simple OR list, never an OR
// elsewhere in the event or a mixed AND/OR expression. Brain retains the text.
const explicitOrSubjects=(canonical,subjects)=>{
 if(subjects.length<2)return false;
 const positions=subjects.map(label=>{
  const match=new RegExp('(?<![\\p{L}\\p{N}])'+escape(fold(label))+'(?![\\p{L}\\p{N}])','u').exec(canonical);
  return match&&{start:match.index,end:match.index+match[0].length};
 });
 if(positions.some(p=>!p))return false;
 positions.sort((a,b)=>a.start-b.start);
 const gaps=positions.slice(1).map((p,i)=>canonical.slice(positions[i].end,p.start));
 return gaps.every(g=>/^\s*(?:,|(?:,\s*)?(?:or|ou))\s*$/.test(g))&&gaps.some(g=>/\b(?:or|ou)\b/.test(g));
};
const releaseTerms={en:['launch','release','announce','unveil'],fr:['lancement','sortie','annonce','devoilement'],ja:['発売','発表']};
const releasePattern=/\b(?:bring(?:s|ing)?\s+out|brought\s+out|launch(?:es|ed|ing)?|releas(?:e|es|ed|ing)|announc(?:e|es|ed|ing)|unveil(?:s|ed|ing)?|lanc(?:e|ent|er|ement|ements)|sort(?:ent|ir|ie|ies)|annonc(?:e|ent|er))\b/gu;
export function planIntentNewsQueries(row,source,{multiEntityOnly=false}={}){
 if(!googleNewsSource(source?.url))return null;
 const u=row.understanding, intent=u?.intent;
 // Explicit resources retain their exact acquisition contract.
 if(u?.resource?.exact_url||intent?.references?.some(r=>r.exact_url))return null;
 if(u?.decision?.status!=='READY_TO_MONITOR'||!intent?.canonical_text)throw Object.assign(Error('News query requires verified Intent'),{code:'SOURCE_QUERY_LIMITED'});
 const negatives=(intent.explicit_constraints||[]).filter(c=>/exclu|negative/i.test(c.kind)).flatMap(c=>[c.text,c.value]).filter(Boolean);
 const refs=[...new Set((intent.references||[]).map(r=>r.label).filter(s=>typeof s==='string'&&s.trim()))]
  .filter(label=>!negatives.some(text=>fold(text).includes(fold(label))));
 const names=regionNames();
 const geos=new Map();
 for(const label of refs){const geo=names.get(fold(label));if(geo)geos.set(geo.code,geo);}
 const canonical=fold(intent.canonical_text);
 // A preposition makes a text-only location explicit; never infer an entity's home country.
 for(const [alias,geo] of names)if(new RegExp('(?:^| )(?:in|en|au|aux|within|across|throughout) '+escape(alias)+'(?:$|[^\\p{L}\\p{N}])','u').test(canonical))geos.set(geo.code,geo);
 let remaining=fold([intent.canonical_text,...(intent.explicit_constraints||[]).filter(c=>!/exclu|negative/i.test(c.kind)).map(c=>c.text),...refs].join(' '));
 for(const label of negatives)remaining=strip(remaining,label);
 for(const [alias,geo] of names)if(geos.has(geo.code))remaining=strip(remaining,alias);
 const subjects=refs.filter(label=>!names.has(fold(label))&&!literalTopic(label)&&words(label).length);
 const orList=explicitOrSubjects(canonical,subjects);
 if(multiEntityOnly&&!orList)return null; // Preserve single-entity creation acquisition.
 const entityQueries=orList&&subjects.length<=MULTI_ENTITY_NEWS_QUERY_BUDGET.entities;
 const entityCoverageLimited=orList&&!entityQueries;
 const budget=entityQueries?MULTI_ENTITY_NEWS_QUERY_BUDGET:NEWS_QUERY_BUDGET;
 for(const label of subjects)remaining=strip(remaining,label);
 const focusedRelease=orList&&releasePattern.test(remaining);
 releasePattern.lastIndex=0;
 if(focusedRelease)remaining=remaining.replace(releasePattern,' ');
 const focusedOpen=orList&&/\b(?:open|opens|opening|opened)\b/.test(remaining);
 if(focusedOpen)remaining=remaining.replace(/\b(?:open|opens|opening|opened)\b/gu,' ');
 const concepts=[];
 for(const entry of lexicon){
  const before=remaining;
  for(const label of [entry.en,entry.fr,entry.ja,...(entry.aliases||[])])remaining=strip(remaining,label);
  if(before!==remaining)concepts.push(entry);
 }
 const remainingWords=[...new Set(words(remaining))];
 const residual=remainingWords.filter(w=>!/^[0-9]+$/.test(w)).slice(0,6);
 const numericContext=remainingWords.filter(w=>/^[0-9]+$/.test(w)).slice(0,2);
 if(!subjects.length&&!concepts.length&&!residual.length)throw Object.assign(Error('No meaningful news subject'),{code:'SOURCE_QUERY_LIMITED'});
 const geography=[...geos.values()];
 const local=geography.length===1?editions[geography[0].code]:null;
 const selected=[local||international,international].filter((e,i,a)=>a.findIndex(x=>x.hl===e.hl&&x.gl===e.gl)===i).slice(0,NEWS_QUERY_BUDGET.queries);
 const querySubjects=entityQueries?subjects.map(label=>[label]):[subjects];
 const queries=querySubjects.flatMap(group=>selected.map(edition=>{
  const productRelease=focusedRelease&&concepts.some(c=>c.en==='products');
  const topics=[...concepts.filter(c=>!productRelease||c.en!=='products').map(c=>c[edition.language]||c.en),...(orList?[]:residual)];
  const alternatives=focusedRelease?[...(productRelease?[{en:'new products',fr:'nouveaux produits',ja:'新製品'}[edition.language]]:[]),...releaseTerms[edition.language]]:focusedOpen?{en:['open','announce','launch'],fr:['ouverture','annonce','lancement'],ja:['開設','発表']}[edition.language]:[];
  const any=terms=>terms.length>1?'('+terms.map(quote).join(' OR ')+')':terms.map(quote).join('');
  const topic=orList?[any(alternatives),...topics.map(quote),...(residual.length?[quote(residual.join(' '))]:[])].filter(Boolean).join(' '):any(topics);
  const display=new Intl.DisplayNames([edition.language],{type:'region'});
  const places=geography.map(g=>quote(display.of(g.code)));
  const geo=places.length>1?'('+places.join(' OR ')+')':places.join('');
  const numbers=numericContext.length>1?'('+numericContext.map(quote).join(' OR ')+')':numericContext.map(quote).join('');
  const subject=group.length>1?'('+group.map(quote).join(' OR ')+')':group.map(quote).join('');
  const query=[subject,topic,geo,numbers].filter(Boolean).join(' ');
  if(!query||query.length>1000)throw Object.assign(Error('News query exceeds budget'),{code:'SOURCE_QUERY_LIMITED'});
  const url=new URL('https://news.google.com/rss/search');
  url.search=new URLSearchParams({q:query,hl:edition.hl,gl:edition.gl,ceid:edition.gl+':'+edition.language});
  return {query,url:url.href,language:edition.language,country:edition.gl,...(entityQueries?{entity:group[0]}:{})};
 }));
 return {queries,geography:geography.map(g=>g.code),translationLimited:residual.length>0,
  localEditionSupported:Boolean(local),budget,entityQueries,entityCoverageLimited};
}

export async function acquireIntentNews(row,source,{feed,multiEntityOnly=false}){
 const plan=planIntentNewsQueries(row,source,{multiEntityOnly});
 if(!plan)return feed(source.url);
 const responses=(await Promise.allSettled(plan.queries.map(q=>feed(q.url)))).map((r,i)=>({...r,query:plan.queries[i]}));
 const storyFollowup = row.engine === 'wa-v3-evidence-refs.v1' && row.baseline_at
   && row.understanding?.story_seed?.original_url;
 const accepted = responses.filter(r => r.status === 'fulfilled' && Array.isArray(r.value?.items)
   && (storyFollowup ? r.value.items.some(item => item?.title || item?.excerpt) : r.value.items.length));
 if(!accepted.length){
  const validEmpty = response => response.status === 'rejected'
    && response.reason?.code === 'EMPTY_FEED' && response.reason.validEmptyGoogleSearch === true;
  if (storyFollowup && responses.length && responses.every(validEmpty)) return null;
  const failure = (storyFollowup && responses.find(r => r.status === 'rejected' && !validEmpty(r))
    || responses.find(r => r.status === 'rejected'))?.reason;
  if(!failure)markV3Stage('EVIDENCE_NORMALIZATION');
  throw failure||Object.assign(Error('The feed is empty.'),{code:'EMPTY_FEED'});
 }
 let queues=accepted.map(r=>r.value.items.slice(0,plan.budget.perQuery));
 if(plan.entityQueries){
  // Interleave editions within each entity, then give each entity one turn.
  queues=[...new Set(accepted.map(r=>r.query.entity))].map(entity=>{
   const feeds=accepted.filter(r=>r.query.entity===entity).map(r=>r.value.items.slice(0,plan.budget.perQuery));
   return Array.from({length:plan.budget.perQuery},(_,i)=>feeds.map(f=>f[i]).filter(Boolean)).flat();
  });
 }
 const seen=new Set(),publishers=new Map(),items=[];
 // Fair query turns and soft publisher diversity; never semantic story merging.
 while(items.length<NEWS_QUERY_BUDGET.finalItems&&queues.some(q=>q.length))for(const queue of queues){
  if(!queue.length||items.length>=NEWS_QUERY_BUDGET.finalItems)continue;
  do {
  const publisher=item=>item.sourceUrl||item.source||'';
  const min=Math.min(...queue.map(item=>publishers.get(publisher(item))||0));
  const index=queue.findIndex(item=>(publishers.get(publisher(item))||0)===min);
  const item=queue.splice(index,1)[0];
  const keys=mediaArticleIdentityKeys(item).map(key=>key.startsWith('id:')?key+':'+publisher(item):key);
  if(keys.some(key=>seen.has(key)))continue;
  keys.forEach(key=>seen.add(key));items.push(item);publishers.set(publisher(item),(publishers.get(publisher(item))||0)+1);
  break;
  }while(plan.entityQueries&&queue.length); // Duplicates must not consume an entity's turn.
 }
 const languages=accepted.map(r=>r.query.language);
 return {source:{title:'Google News ('+(plan.entityQueries?[...new Set(languages)]:languages).join(' + ')+')',url:accepted[0].query.url},
  checkedAt:accepted.map(r=>r.value.checkedAt).filter(Boolean).sort().at(-1),items,
  coverage:{queries:plan.queries,candidates:accepted.reduce((n,r)=>n+Math.min(r.value.items.length,NEWS_QUERY_BUDGET.perQuery),0),
   partial:accepted.length!==responses.length,translationLimited:plan.translationLimited,entityCoverageLimited:plan.entityCoverageLimited}};
}

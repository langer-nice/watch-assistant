import {createHash} from 'node:crypto';
import {matchFeedItemToStory} from '../src/js/watch-monitoring.js';

const normalized=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const escapePattern=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const sourceText=a=>[a.title,a.summary??a.excerpt].filter(Boolean).join('\n');
const safeUrl=raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const relevant=(quote,story)=>matchFeedItemToStory({title:'',excerpt:quote},story.storyProfile).matched;
// Deliberately bounded event frames. No generated prose, translation service,
// invented actors/dates, inferred custody or model calls. Unknown events fall back.
const personFrames=[
 {kind:'arrest',fr:'a été interpellé',frPerson:'a été interpellée',en:'was arrested',verb:'interpellé[e]?|arrêté[e]?|arrested'},
 {kind:'release',fr:'a été remis en liberté',frPerson:'a été remise en liberté',en:'was released',verb:'remis[e]? en liberté|released'},
];
const namedFrames=[
 {kind:'reopen',fr:'a rouvert',en:'has reopened',verb:'a rouvert|a été rouvert[e]?|(?:has |was )?reopened'},
 {kind:'close',fr:'a fermé',en:'has closed',verb:'a fermé|a été fermé[e]?|(?:has |was )?closed'},
 {kind:'resign',fr:'a démissionné',en:'has resigned',verb:'a démissionné|(?:has )?resigned'},
];
const uncertainty=/\b(?:not|never|no|could|might|may|would|will|allegedly|reportedly|if|whether|pourrait|pourraient|serait|seraient|aurait|auraient|devrait|devraient|peut|peuvent|pas|jamais|si|éventuel|éventuelle|possible|hypothèse|dément|démenti|rumeur|promet|prévoit|déjà|again|sera|seront|allait|voulaient|voulait|veut|souhaite|wanted|wants|want|planned|planning|avoid|avoided|escaped)\b/iu;
const sameActor=(a,b)=>a===b||(['person','suspect'].includes(a)&&['person','suspect'].includes(b));
const explicitDay=s=>/\b\d{4}-\d{2}-\d{2}\b/u.exec(s)?.[0]||null;
const denied=(text,index,quote)=>/den(?:y|ies|ied)|dément|rumeur|rumou?r|non confirm|unconfirmed|fausse/iu.test(text.slice(Math.max(0,index-75),index)+quote);
function events(article,story){
 const text=sourceText(article),events=[];
 // Person frames require the story link in the SAME exact evidence span.
 for(const f of personFrames){
  const pattern=new RegExp(`(?:\\b(?:un|une|a|one)\\s+(?:homme|femme|suspecte?|personne|man|woman|suspect|person))[^.!?\\n]{0,320}?\\b(?:${f.verb})`,'giu');
  for(const m of text.matchAll(pattern)){
   let quote=m[0];
   const tail=text.slice(m.index+quote.length).split(/[.!?\n]/u)[0].slice(0,200);
   if(relevant(quote,story))quote+=/^\s+(?:en|à|in)\s+[\p{Lu}][\p{L}’'-]+(?:\s+[\p{Lu}][\p{L}’'-]+){0,2}/u.exec(tail)?.[0]||'';
   else quote+=tail;
   if(denied(text,m.index,quote)||!relevant(quote,story)||uncertainty.test(quote)||/(?:être|being|to be)\s+(?:arrêté|interpellé|arrested|released)/iu.test(quote)||/^[^.!?\n]*\?/u.test(text.slice(m.index)))continue;
   // A suspect is labelled as such only when the source explicitly says so.
   const suspect=/suspect|soupçonn|présumé/iu.test(quote),actor=suspect?'suspect':'person';
   events.push({kind:f.kind,actor,quote,fr:`${suspect?'Un suspect':'Une personne'} ${suspect?f.fr:f.frPerson}.`,en:`${suspect?'A suspect':'A person'} ${f.en}.`,day:explicitDay(quote)});
  }
 }
 // Names remain in their original language; the finite action vocabulary is
 // translated without adding circumstances, motives or an event date.
 for(const c of story.storyProfile.concepts||[]){
  if(!['person','organization','work','product_service'].includes(c.type)||typeof c.label!=='string'||c.label.length<3)continue;
  for(const f of namedFrames){
   if((f.kind==='resign')!==(c.type==='person'))continue;
   const pattern=new RegExp(`${escapePattern(c.label)}[^.!?\\n]{0,100}?\\b(?:${f.verb})\\b`,'giu');
   for(const m of text.matchAll(pattern)){
    const quote=m[0];if(denied(text,m.index,quote)||uncertainty.test(quote)||!relevant(quote,story))continue;
    events.push({kind:f.kind,actor:normalized(c.label),quote,fr:`${c.label} ${f.fr}.`,en:`${c.label} ${f.en}.`,day:explicitDay(quote)});
   }
  }
 }
 return events.filter((e,i)=>events.findIndex(other=>other.kind===e.kind&&other.actor===e.actor&&other.day===e.day)===i);
}
export function extractStoryDigestDevelopments({story,articles,knownArticles=[]}){
 if(story?.inputType!=='url'||!story.storyProfile||!Array.isArray(articles)||!Array.isArray(knownArticles)||knownArticles.length>120)return [];
 const known=knownArticles.flatMap(a=>events(a,story));
 const groups=new Map();
 for(const item of articles){
  if(!item?.article||!safeUrl(item.article.url))continue;
  for(const event of events(item.article,story)){
   // Same actor/action already known is not a new event merely because another
   // publisher reports it. Without a distinct explicit event identity, fall back.
   if(known.some(k=>k.kind===event.kind&&sameActor(k.actor,event.actor)&&(!k.day||!event.day||k.day===event.day)))continue;
   const quoteKey=normalized(event.quote),key=createHash('sha256').update(event.kind+'\0'+event.actor+'\0'+quoteKey).digest('hex');
   if(!groups.has(key))groups.set(key,{...event,key,sources:[]});
   const group=groups.get(key);if(!group.sources.some(a=>a.url===item.article.url))group.sources.push({...item.article,id:item.id,quote:event.quote});
  }
 }
 const values=[...groups.values()];
 // Different anonymous reports could describe different people/events. Do not
 // merge them or announce the same apparent development twice without proof.
 return values.filter(g=>!values.some(other=>other!==g&&other.kind===g.kind&&sameActor(other.actor,g.actor)&&(!g.day||!other.day||g.day===other.day))).slice(0,6);
}
export async function loadStoryDigestDevelopments({client,claimed,deadline=Date.now()+30000,extractor=extractStoryDigestDevelopments}){
 if(deadline-Date.now()<1500)return [];
 try{
  const {data:w,error}=await client.from('watches').select('watch_definition').eq('id',claimed.watch_id).eq('user_id',claimed.user_id).is('deleted_at',null).maybeSingle();
  const story=w?.watch_definition;if(error||story?.inputType!=='url'||!story.storyProfile)return [];
  const [snap,history]=await Promise.all([
   client.from('media_watch_snapshots').select('initial_items').eq('watch_id',claimed.watch_id).eq('user_id',claimed.user_id).maybeSingle(),
   client.from('media_watch_notifications').select('article').eq('watch_id',claimed.watch_id).eq('user_id',claimed.user_id).eq('status','sent').order('sent_at',{ascending:false}).range(0,100),
  ]);
  if(snap.error||history.error||!snap.data||!Array.isArray(history.data)||history.data.length>100)return [];
  const initial=snap.data.initial_items;if(!Array.isArray(initial))return [];
  return extractor({story,articles:claimed.articles,knownArticles:[...initial,...history.data.map(n=>n.article)]});
 }catch{return [];}
}

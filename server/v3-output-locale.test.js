import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateV3Source,runV3WatchCheck} from './v3-pilot.js';
import {normalizeV3OutputLocale,resolveV3OutputLocale,v3OutputLocaleInstruction} from './v3-output-locale.js';
import {hasUnconfirmedQualification} from './v3-brain/judgment.mjs';
import {renderMediaWatchEmail} from './media-watch-email.js';
import {renderMediaWatchDigest} from './media-watch-digest.js';

const id='11111111-1111-4111-8111-111111111111',owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const row={id,user_id:owner,token:'fixture-lease',engine:'wa-v3-evidence-refs.v1',baseline_at:'2026-11-01T00:00:00Z',prior_state:{entries:[{id:'prior',fact:'Original prior fact',alerted:false}]},understanding:{intent:{canonical_text:'Keep me updated on important developments.',references:[{label:'Radio France',source_ref:'raw_input'}],explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR'}}};
const source={type:'feed',url:'https://source.example.test/feed'};
const prose={fr:'Radio France rapporte que plus de 300 personnes ont été emprisonnées depuis le 17 octobre. Manchester City, Taylor Swift et Apple restent des noms propres.',en:'Radio France reports that more than 300 people have been imprisoned since October 17. Manchester City, Taylor Swift and Apple remain proper names.'};
const article=(lang,i=0)=>({id:'original-'+lang+i,title:lang==='fr'?'Plus de 300 personnes emprisonnées depuis le 17 octobre':'More than 300 people imprisoned since October 17',excerpt:lang==='fr'?'Radio France rapporte ce bilan.':'Radio France reports this total.',source:'Radio France',sourceUrl:'https://www.radiofrance.fr/',url:'https://article.example.test/'+lang+i,publishedAt:'2026-11-03T09:00:00Z'});
const feed=items=>({source:{title:'Original source',url:source.url},checkedAt:'2026-11-03T13:00:00Z',items});
const output=(req,locale,status='CONFIRMED')=>({action:'ALERT',evidence_status:status,reason:prose[locale]+(status==='STRONG_UNCONFIRMED'?(locale==='fr'?' Ces informations sont non confirmées.':' These reports remain unconfirmed.') : ''),novelty_summary:locale==='fr'?'Un nouveau bilan distinct.':'A distinct new total.',condition_check:{required_state:'An important new development',observed_state:'A new report',condition_satisfied:true},evidence_refs:req.input.evidence.segments.filter(s=>s.role!=='PROVENANCE').map(s=>s.id),provenance_refs:req.input.evidence.segments.filter(s=>s.role==='PROVENANCE').map(s=>s.id)});
for(const [locale,languages] of [['fr',['fr']],['fr',['en']],['en',['fr']],['fr',['fr','en']],['en',['fr','en']]])test(locale+' output with '+languages.join('+')+' sources preserves original evidence and metadata',async()=>{
 const original=feed(languages.map(article)),before=structuredClone(original),prior=structuredClone(row);let calls=0;
 const result=await evaluateV3Source(row,source,{outputLocale:locale,feed:async()=>original,model:async req=>{
  calls++;assert(req.instructions.includes(v3OutputLocaleInstruction(locale)));assert.equal(req.input.intent.canonical_text,row.understanding.intent.canonical_text);
  for(const a of original.items)assert(req.input.evidence.segments.some(s=>s.text.includes(a.title)));
  return output(req,locale);
 }});
 assert.equal(calls,1);assert.equal(result.article.summary,prose[locale]);assert.equal(result.article.title,prose[locale].slice(0,300));assert.equal(result.article.url,original.items[0].url);assert.equal(result.article.source,'Radio France');assert.equal(result.article.publishedAt,original.items[0].publishedAt);
 assert.deepEqual(original,before);assert.deepEqual(row,prior);assert.equal(result.judgment.action,'ALERT');assert.equal(result.judgment.evidence_status,'CONFIRMED');assert.deepEqual(result.judgment.condition_check,{required_state:'An important new development',observed_state:'A new report',condition_satisfied:true});assert.equal(result.judgment.novelty_summary,locale==='fr'?'Un nouveau bilan distinct.':'A distinct new total.');
 for(const name of ['Radio France','Manchester City','Taylor Swift','Apple','300','17'])assert(result.article.summary.includes(name));
 for(const basis of result.judgment.evidence_basis){const raw=basis.field==='content'?result.evidence.content:result.evidence[basis.field];assert.equal(raw.slice(basis.start,basis.end),basis.text);}
});
test('French uncertainty qualification retains the same explicit requirement and enum',async()=>{
 for(const reason of ['Informations non confirmées.','Une information non confirmée.','Ce bilan n’est pas encore officiellement confirmé.','Confirmation officielle attendue.'])assert(hasUnconfirmedQualification(reason));
 for(const reason of ['Ce bilan est confirmé.','STRONG_UNCONFIRMED','Des informations crédibles.'])assert(!hasUnconfirmedQualification(reason));
 const result=await evaluateV3Source(row,source,{outputLocale:'fr',feed:async()=>feed([article('fr')]),model:async req=>output(req,'fr','STRONG_UNCONFIRMED')});assert.equal(result.judgment.evidence_status,'STRONG_UNCONFIRMED');assert.match(result.article.summary,/non confirmées/);
 await assert.rejects(evaluateV3Source(row,source,{outputLocale:'fr',feed:async()=>feed([article('fr')]),model:async req=>({...output(req,'fr','STRONG_UNCONFIRMED'),reason:'Une information crédible.'})}),/explicit qualification/);
});
test('output locale does not admit invalid refs or an unsatisfied condition',async()=>{
 for(const change of [{evidence_refs:['invented']},{condition_check:{required_state:'Complete state',observed_state:'Partial state',condition_satisfied:false}}])await assert.rejects(evaluateV3Source(row,source,{outputLocale:'fr',feed:async()=>feed([article('en')]),model:async req=>({...output(req,'fr'),...change})}));
});
test('manual locale wins immediately; scheduled resolves existing owner profile; unsupported/error fallback is English',async()=>{
 const calls=[],client={rpc:async(name,p)=>{calls.push({name,p});return {data:'fr'};}};
 assert.equal(await resolveV3OutputLocale({client,ownerId:owner,requested:'en'}),'en');assert.equal(calls.length,0);
 assert.equal(await resolveV3OutputLocale({client,ownerId:owner}),'fr');assert.deepEqual(calls,[{name:'get_media_watch_notification_locale',p:{p_user_id:owner}}]);
 for(const value of ['de',null,'fr-FR'])assert.equal(normalizeV3OutputLocale(value),'en');
 assert.equal(await resolveV3OutputLocale({client:{rpc:async()=>{throw Error('Unavailable');}},ownerId:owner}),'en');
});
test('shared core persists localized prose once, preserving original source and historical input',async()=>{
 const before=structuredClone(row),saved=[];let models=0,sources=0;
 const client={rpc:async(name,p)=>{if(name==='get_media_watch_notification_locale')return {data:'fr'};assert.equal(name,'finish_v3_pilot_check');saved.push(p);return {data:true};}};
 const r=await runV3WatchCheck({...row,source},{client,model:async req=>{models++;return output(req,'fr');},feed:async()=>{sources++;return feed([article('en')]);}});
 assert.equal(models,1);assert.equal(sources,1);assert.equal(saved.length,1);assert.equal(saved[0].p_result.article.summary,prose.fr);assert.deepEqual(saved[0].p_result.items,[article('en')]);assert.deepEqual(row,before);assert.equal(r.article.url,article('en').url);
});
test('email/digest reuse persisted localized prose without translating original source links',()=>{
 const a={title:prose.fr.slice(0,300),summary:prose.fr,url:article('en').url,source:'Radio France',publishedAt:article('en').publishedAt};
 const email=renderMediaWatchEmail({locale:'fr',watchId:id,watchTitle:'Original Watch',article:a,baseUrl:'https://app.example.test'});assert(email.text.includes(prose.fr));assert(email.text.includes(a.url));assert(email.text.includes('Radio France'));
 const digest=renderMediaWatchDigest({locale:'fr',watchId:id,watchTitle:'Original Watch',period:'2026-11-03',articles:[{id:'one',article:a}],baseUrl:'https://app.example.test',includeSourceSummaries:true});assert(digest.text.includes(a.title));assert(digest.text.includes(a.url));
});

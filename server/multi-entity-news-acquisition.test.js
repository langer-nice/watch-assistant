import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {planIntentNewsQueries,acquireIntentNews,MULTI_ENTITY_NEWS_QUERY_BUDGET} from './intent-news-acquisition.js';
import {evaluateV3Source,feedEvidence} from './v3-pilot.js';

const instruction='Notify me when Gucci or Prada bring out new products.';
const source={type:'feed',url:'https://news.google.com/rss/search?q=%22Gucci%22+OR+%22Prada%22&hl=en-GB&gl=GB&ceid=GB%3Aen'};
const row=(text=instruction,refs=['Gucci','Prada'])=>({id:'11111111-1111-4111-8111-111111111111',baseline_at:'2026-11-04T10:40:00Z',prior_state:{entries:[]},understanding:{decision:{status:'READY_TO_MONITOR'},intent:{canonical_text:text,references:refs.map(label=>({label,source_ref:'raw_input'})),explicit_constraints:[],unresolved_ambiguities:[]}}});
const item=(brand,n)=>({id:brand+n,title:brand+' launches a new product '+n,excerpt:brand+' releases a new product '+n,url:'https://example.test/'+brand+'/'+n,source:brand+' official',sourceUrl:'https://'+brand.toLowerCase()+'.example.test',publishedAt:'2026-11-05T08:00:00Z'});
const items=(brand,n)=>Array.from({length:n},(_,i)=>item(brand,i));
const response=(url,items)=>({source:{title:'Offline fixture',url},items,checkedAt:'2026-11-05T09:00:00Z'});
const feed=(g,p)=>async url=>response(url,new URL(url).searchParams.get('q').startsWith('"Gucci"')?g:p);
const judgment=req=>({action:'ALERT',evidence_status:'CONFIRMED',reason:'A supplied new product launch.',novelty_summary:null,condition_check:null,evidence_refs:req.input.evidence.segments.filter(s=>s.field==='content').map(s=>s.id),provenance_refs:[]});

test('two independent focused product queries preserve stored OR Intent without bring/out noise',()=>{
 const w=row(),before=structuredClone(w),plan=planIntentNewsQueries(w,source);
 assert.deepEqual(plan.queries.map(q=>q.query),['"Gucci" ("new products" OR "launch" OR "release" OR "announce" OR "unveil")','"Prada" ("new products" OR "launch" OR "release" OR "announce" OR "unveil")']);
 assert.equal(plan.entityQueries,true);assert.equal(plan.entityCoverageLimited,false);assert.deepEqual(w,before);
 for(const q of plan.queries){assert(!/"bring"|"out"/.test(q.query));assert.equal(q.language,'en');}
});
for(const [dominant,counts] of [['Gucci',[20,5]],['Prada',[5,20]]])test(dominant+' cannot starve the other entity',async()=>{
 const r=await acquireIntentNews(row(),source,{feed:feed(items('Gucci',counts[0]),items('Prada',counts[1]))});
 assert.equal(r.items.length,20);assert.equal(r.items.filter(i=>i.id.startsWith(dominant)).length,15);assert.equal(r.items.filter(i=>!i.id.startsWith(dominant)).length,5);
 assert.equal(r.coverage.candidates,25);
});
for(const [name,g,p] of [['Gucci only',items('Gucci',3),[]],['Prada only',[],items('Prada',3)],['both',items('Gucci',3),items('Prada',3)]])test(name+' evidence reaches unchanged Brain once, with no joint-event prerequisite',async()=>{
 const w=row();let calls=0,requests=0,brain;
 const r=await evaluateV3Source(w,source,{feed:async url=>{requests++;return feed(g,p)(url);},model:async req=>{calls++;brain=req;return judgment(req);}});
 assert.equal(calls,1);assert.equal(requests,2);assert.equal(brain.input.intent.canonical_text,instruction);assert.deepEqual(brain.input.intent.references,w.understanding.intent.references);
 for(const i of [...g,...p])assert(r.evidence.content.includes(i.title));assert.equal(r.judgment.action,'ALERT');assert(r.article);
});
for(const brand of ['Gucci','Prada'])test(brand+' acquisition has an event-focused clause rather than brand-only/general-news terms',()=>{
 const q=planIntentNewsQueries(row(),source).queries.find(q=>q.entity===brand).query;
 assert(q.includes('new products'));assert(q.includes('"launch"'));assert(!q.includes('"bring"'));assert(!q.includes('"out"'));
 // Provider ranking and Brain relevance remain responsible for actual off-topic results.
 assert.notEqual(q,'"'+brand+'"');
});
test('duplicate URLs/GUIDs across queries deduplicate without merging independent launches or publishers',async()=>{
 const shared=item('Gucci',0),translated={...shared,id:'translated',title:'Une nouveauté',url:shared.url+'?utm_source=fr'};
 const r=await acquireIntentNews(row(),source,{feed:feed([shared,item('Gucci',1)],[translated,item('Prada',1)])});
 assert.equal(r.items.length,3);assert(r.items.some(i=>i.id==='Gucci1'));assert(r.items.some(i=>i.id==='Prada1'));
 const independent={...shared,url:'https://independent.example.test/story',sourceUrl:'https://independent.example.test'};
 const corroboration=await acquireIntentNews(row(),source,{feed:feed([shared],[independent])});assert.equal(corroboration.items.length,2);
});
test('duplicates do not consume entity turns and hide a later unique result within its fetched budget',async()=>{
 const common=items('Gucci',19),prada=item('Prada',0);
 const r=await acquireIntentNews(row(),source,{feed:feed(items('Gucci',20),[...common,prada])});
 assert.equal(r.items.length,20);assert(r.items.some(i=>i.id==='Prada0'));
});
for(const [text,refs,topic] of [
 ['Notify me when Apple or Samsung announce new phones.',['Apple','Samsung'],'"phones"'],
 ['Tell me when Nike or Adidas launch new running shoes.',['Nike','Adidas'],'"running shoes"'],
 ['Keep me updated if EasyJet or British Airways open Christmas flights.',['EasyJet','British Airways'],'"christmas flights"'],
])test('generic entity splitting: '+refs.join('/'),()=>{
 const plan=planIntentNewsQueries(row(text,refs),source);assert.equal(plan.queries.length,2);
 for(const q of plan.queries){assert(q.query.startsWith('"'+q.entity+'" '));assert(q.query.includes(topic));assert(!q.query.includes('Gucci'));}
});
test('3/4 entities get individual queries; overflow retains every subject with an explicit bounded limitation',()=>{
 for(const n of [3,4,5,20]){
  const refs=Array.from({length:n},(_,i)=>'Brand'+i),text='Notify me when '+refs.slice(0,-1).join(', ')+' or '+refs.at(-1)+' launch products in France.';
  const plan=planIntentNewsQueries(row(text,refs.concat('France')),source);
  assert(plan.queries.length<=8);assert.equal(plan.entityQueries,n<=4);assert.equal(plan.entityCoverageLimited,n>4);
  assert.equal(plan.queries.length,n<=4?n*2:2);
  for(const ref of refs)assert(plan.queries.some(q=>q.query.includes('"'+ref+'"')));
 }
 assert.equal(MULTI_ENTITY_NEWS_QUERY_BUDGET.entities,4);assert.equal(MULTI_ENTITY_NEWS_QUERY_BUDGET.queries,8);
});
test('single entity, AND subjects, event-only OR and explicit resource acquisition remain unchanged',async()=>{
 assert.equal(planIntentNewsQueries(row('Keep me updated on Apple products.',['Apple']),source).queries[0].query,'"Apple" "products"');
 for(const text of ['Notify me when Gucci and Prada launch products.','Notify me when Gucci and Prada launch products or announce profits.'])assert.equal(planIntentNewsQueries(row(text),source).entityQueries,false);
 const explicit=row();explicit.understanding.resource={exact_url:source.url,source_ref:'raw_input'};let calls=0;
 await acquireIntentNews(explicit,source,{feed:async url=>{calls++;assert.equal(url,source.url);return response(url,items('Gucci',1));}});assert.equal(calls,1);
 assert.equal(planIntentNewsQueries(row(),{type:'currency',url:'https://example.test/ecb'}),null);
});
test('baseline uses the same split queries, includes both brands and makes zero Brain calls',async()=>{
 const w=row();w.baseline_at=null;let requests=0;
 const r=await evaluateV3Source(w,source,{feed:async url=>{requests++;return feed(items('Gucci',20),items('Prada',5))(url);},model:()=>assert.fail('Baseline must not call Brain')});
 assert.equal(requests,2);assert.equal(r.items.length,20);assert(r.items.some(i=>i.id.startsWith('Gucci')));assert(r.items.some(i=>i.id.startsWith('Prada')));assert.equal(r.judgment,null);assert.equal(r.article,null);
});
test('local/international editions compose per entity regardless of instruction language; final cap stays 20',async()=>{
 const en=row('Notify me when Gucci or Prada launch new products in France.',['Gucci','Prada','France']);
 const fr=row('Préviens-moi quand Gucci ou Prada lancent de nouveaux produits en France.',['Gucci','Prada','France']);
 const plan=planIntentNewsQueries(en,source);assert.equal(plan.queries.length,4);assert.deepEqual(plan.queries,planIntentNewsQueries(fr,source).queries);
 for(const entity of ['Gucci','Prada'])assert.deepEqual(plan.queries.filter(q=>q.entity===entity).map(q=>q.language),['fr','en']);
 const r=await acquireIntentNews(en,source,{feed:async url=>{const u=new URL(url),brand=u.searchParams.get('q').includes('Gucci')?'Gucci':'Prada';return response(url,items(brand,20));}});
 assert.equal(r.items.length,20);assert(r.items.some(i=>i.id.startsWith('Prada')));assert(r.items.some(i=>i.id.startsWith('Gucci')));
});
test('one entity provider failure is partial, no retries or model expansion',async()=>{
 let requests=0;const r=await acquireIntentNews(row(),source,{feed:async url=>{requests++;if(new URL(url).searchParams.get('q').startsWith('"Gucci"'))throw Error('Offline failure');return response(url,items('Prada',3));}});
 assert.equal(requests,2);assert.equal(r.items.length,3);assert.equal(r.coverage.partial,true);assert.equal(r.source.title,'Google News (en)');
});
test('fixed-size fixture measures provider and Brain-input cost without a new model call',async()=>{
 let requests=0,models=0,wire;const all=items('Gucci',20);
 const r=await evaluateV3Source(row(),source,{feed:async url=>{requests++;return feed(all,items('Prada',5))(url);},model:async req=>{models++;wire=req;return judgment(req);}});
 const old=feedEvidence(response(source.url,all));
 await writeFile('/private/tmp/wa-multi-entity-news-cost.json',JSON.stringify({providerRequestsBefore:1,providerRequestsAfter:requests,BrainCallsBefore:1,BrainCallsAfter:models,itemsBefore:20,itemsAfter:r.items.length,oldEvidenceChars:old.content.length,newEvidenceChars:r.evidence.content.length,evidenceIncreasePercent:100*(r.evidence.content.length/old.content.length-1),newBrainWireChars:JSON.stringify(wire).length},null,2));
 assert.equal(requests,2);assert.equal(models,1);assert.equal(r.items.length,20);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {planIntentNewsQueries,acquireIntentNews,NEWS_QUERY_BUDGET} from './intent-news-acquisition.js';
import {evaluateV3Source,feedEvidence} from './v3-pilot.js';
import {prepareReferenceJudgment,INSTRUCTIONS} from './v3-brain-lab/evidence-ref-candidate/candidate.mjs';
import {toBrainInput} from './v3-brain-lab/end-to-end-mini/adapter.mjs';

const source={type:'feed',url:'https://news.google.com/rss/search?q=%22France%22&hl=en-GB&gl=GB&ceid=GB%3Aen'};
const en='Keep me updated on important new developments concerning protests, strikes and major social movements in France.';
const fr='Tiens-moi informé des nouveaux développements importants concernant les manifestations, les grèves et les grands mouvements sociaux en France.';
const row=(text,refs)=>({id:'11111111-1111-4111-8111-111111111111',engine:'wa-v3-evidence-refs.v1',instruction:text,baseline_at:'2026-11-01T00:00:00Z',prior_state:{entries:[]},understanding:{
 decision:{status:'READY_TO_MONITOR'},intent:{canonical_text:text,references:refs.map(label=>({label,source_ref:'raw_input'})),explicit_constraints:[{kind:'condition',text:'important new developments',source_ref:'raw_input'}],unresolved_ambiguities:[]}}});
const item=(id,{publisher='Outlet '+id,title='Development '+id,url='https://example.test/'+id}={})=>({id,title,url,source:publisher,sourceUrl:'https://'+publisher.replace(/\W/g,'').toLowerCase()+'.test/',excerpt:title,publishedAt:'2026-11-03T10:00:00Z'});
const response=items=>({source:{title:'Fixture',url:'https://example.test/feed'},checkedAt:'2026-11-03T13:00:00Z',items});
const judgment=req=>({action:'NO_ALERT',evidence_status:'CONFIRMED',reason:'No new material development.',condition_check:null,novelty_summary:null,
 evidence_refs:req.input.evidence.segments.filter(s=>s.role!=='PROVENANCE').map(s=>s.id),provenance_refs:req.input.evidence.segments.filter(s=>s.role==='PROVENANCE').map(s=>s.id)});

test('English France Watch generates focused French-local and English queries',()=>{
 const p=planIntentNewsQueries(row(en,['France']),source);
 assert.deepEqual(p.geography,['FR']);assert.equal(p.queries.length,2);assert.deepEqual(p.queries.map(q=>q.language),['fr','en']);
 assert.match(p.queries[0].query,/manifestations/);assert.match(p.queries[0].query,/grèves/);assert.match(p.queries[0].query,/mouvements sociaux/);
 assert.match(p.queries[1].query,/protests/);assert.match(p.queries[1].query,/strikes/);assert.match(p.queries[1].query,/social movements/);
 for(const q of p.queries){assert.notEqual(q.query,'"France"');assert.match(q.query,/France/);assert(q.query.length<=1000);}
 assert.equal(new URL(p.queries[0].url).searchParams.get('ceid'),'FR:fr');assert.equal(new URL(p.queries[1].url).searchParams.get('ceid'),'GB:en');
});
test('French and English equivalent intents produce equivalent source coverage',()=>{
 assert.deepEqual(planIntentNewsQueries(row(fr,['France']),source).queries,planIntentNewsQueries(row(en,['France']),source).queries);
 const w=row(en,['France']);w.instruction=fr;assert.deepEqual(planIntentNewsQueries(w,source).queries,planIntentNewsQueries(row(en,['France']),source).queries);
});
test('topic references stay alternatives rather than becoming mandatory entity anchors',()=>{
 assert.deepEqual(planIntentNewsQueries(row(en,['France','protests','strikes','social movements']),source).queries,planIntentNewsQueries(row(fr,['France','manifestations','grèves','mouvements sociaux']),source).queries);
 const q=planIntentNewsQueries(row(en,['France','protests','strikes']),source).queries[1].query;assert.match(q,/OR/);assert.equal(q.indexOf('"protests"'),q.lastIndexOf('"protests"'));
});
test('explicitly excluded reference is not promoted to a required search subject',()=>{
 const w=row('Keep me updated on Apple products excluding iPhone.',['Apple','iPhone']);w.understanding.intent.explicit_constraints=[{kind:'exclusion',text:'iPhone',source_ref:'raw_input'}];
 const before=structuredClone(w);const q=planIntentNewsQueries(w,source).queries[0].query;assert.match(q,/Apple/);assert.match(q,/products/);assert(!q.includes('iPhone'));assert.deepEqual(w,before);
});
test('multiple subject references retain OR acquisition breadth; Brain keeps the original relation',()=>{
 const w=row('Keep me updated on AsterCo or BorealCo.',['AsterCo','BorealCo']);assert.deepEqual(planIntentNewsQueries(w,source).queries.map(q=>q.query),['"AsterCo"','"BorealCo"']);
});
test('French Manchester City Watch retains English coverage without a club-specific rule',()=>{
 const p=planIntentNewsQueries(row('Tiens-moi informé des transferts et blessures concernant Manchester City.',['Manchester City']),source);
 assert.equal(p.queries.length,1);assert.equal(p.queries[0].language,'en');assert.match(p.queries[0].query,/Manchester City/);assert.match(p.queries[0].query,/transfers/);assert.match(p.queries[0].query,/injuries/);
});
test('French Apple Watch retains entity focus and official direct feed is untouched',async()=>{
 const w=row('Tiens-moi informé des nouveaux produits Apple.',['Apple']);const p=planIntentNewsQueries(w,source);assert.equal(p.queries[0].language,'en');assert.match(p.queries[0].query,/Apple/);assert.match(p.queries[0].query,/products/);
 const official={type:'feed',url:'https://official.example.test/rss'};let urls=[];await acquireIntentNews(w,official,{feed:async url=>{urls.push(url);return response([item('official')]);}});assert.deepEqual(urls,[official.url]);
});
test('global artist concert/year/geography terms stay focused, without invented local language',()=>{
 const p=planIntentNewsQueries(row('Tell me when there are credible new reports that Metallica may announce concerts or tour dates in Europe for 2027, even before official confirmation.',['Metallica','Europe']),source);
 assert.equal(p.queries.length,1);assert.equal(p.queries[0].language,'en');for(const term of ['Metallica','Europe','concerts','tour dates','2027'])assert(p.queries[0].query.includes(term));
 assert(!p.queries[0].query.includes('protests'));assert(!p.queries[0].query.includes('strikes'));
});
test('entity-only Watch remains entity-only and never gets arbitrary geographic expansion',()=>{
 const p=planIntentNewsQueries(row('Keep me updated on Jannik Sinner.',['Jannik Sinner']),source);assert.equal(p.queries.length,1);assert.equal(p.queries[0].query,'"Jannik Sinner"');assert.deepEqual(p.geography,[]);
});
test('Japan uses local geography naming and bounded supported literal equivalents',()=>{
 const p=planIntentNewsQueries(row('Keep me updated on elections in Japan.',['Japan']),source);assert.equal(p.queries.length,2);assert.match(p.queries[0].query,/日本/);assert.match(p.queries[0].query,/選挙/);assert.equal(p.queries[0].language,'ja');assert.match(p.queries[1].query,/Japan/);
});
test('missing geography retains subject; geography-only fallback fails safely',()=>{
 assert.match(planIntentNewsQueries(row('Keep me informed of elections.',['elections']),source).queries[0].query,/elections/);
 for(const text of ['Keep me updated on important new developments in France.','Keep me updated in France in 2027.','Keep me updated on anything in France.'])assert.throws(()=>planIntentNewsQueries(row(text,['France']),source),{code:'SOURCE_QUERY_LIMITED'});
});
test('explicit resource and currency capabilities bypass query planning',()=>{
 const w=row(en,['France']);w.understanding.resource={exact_url:source.url,source_ref:'raw_input'};assert.equal(planIntentNewsQueries(w,source),null);
 assert.equal(planIntentNewsQueries(row('GBP/EUR above 1.17',['GBP/EUR']),{type:'currency',url:'https://example.test/rate'}),null);
});
test('merge deduplicates common identity/tracking URLs; independent corroboration and distinct developments survive',async()=>{
 const common=item('shared',{publisher:'Same outlet'}),translation={...common,title:'Même développement traduit'};
 const corroboration=item('independent',{publisher:'Independent outlet',title:'Same event independently reported'});
 const distinct=item('distinct',{publisher:'Same outlet',title:'A separate material development'});
 const result=await acquireIntentNews(row(en,['France']),source,{feed:async url=>new URL(url).searchParams.get('hl')==='fr'?response([common,distinct]):response([translation,corroboration])});
 assert.equal(result.items.length,3);assert.deepEqual(new Set(result.items.map(i=>i.id)),new Set(['shared','independent','distinct']));
 const a=item('a',{publisher:'One',url:'https://publisher.test/story?utm_source=x'}),b=item('b',{publisher:'One',url:'https://publisher.test/story?utm_source=y'});
 const tracked=await acquireIntentNews(row(en,['France']),source,{feed:async url=>response([new URL(url).searchParams.get('hl')==='fr'?a:b])});assert.equal(tracked.items.length,1);
});
test('different-language URLs are retained without speculative semantic deduplication',async()=>{
 const result=await acquireIntentNews(row(en,['France']),source,{feed:async url=>response([item(new URL(url).searchParams.get('hl'))])});assert.equal(result.items.length,2);
});
test('query/candidate/result budgets and soft publisher diversity are bounded',async()=>{
 let requests=0;const result=await acquireIntentNews(row(en,['France']),source,{feed:async url=>{requests++;const lang=new URL(url).searchParams.get('hl');return response(Array.from({length:100},(_,i)=>item(lang+i,{publisher:i<15?'Repeated '+lang:'Diverse '+lang+i})));}});
 assert.equal(requests,2);assert.equal(result.coverage.candidates,40);assert.equal(result.items.length,20);assert(result.items.some(i=>i.source.startsWith('Diverse fr')));assert(result.items.some(i=>i.source.startsWith('Diverse en')));
 assert.equal(NEWS_QUERY_BUDGET.finalItems,20);assert.equal(NEWS_QUERY_BUDGET.queries,2);
});
test('one failed edition is not retried; successful provenance is truthful',async()=>{
 let requests=0;const result=await acquireIntentNews(row(en,['France']),source,{feed:async url=>{requests++;if(new URL(url).searchParams.get('hl')==='fr')throw Error('Unavailable');return response([item('en')]);}});
 assert.equal(requests,2);assert.equal(result.coverage.partial,true);assert.equal(result.source.title,'Google News (en)');assert.equal(new URL(result.source.url).searchParams.get('hl'),'en-GB');
});
test('all acquisition failures propagate once without geographic fallback or model call',async()=>{
 let requests=0;await assert.rejects(acquireIntentNews(row(en,['France']),source,{feed:async()=>{requests++;throw Object.assign(Error('Fixture unavailable'),{code:'UPSTREAM_ERROR'});}}),{code:'UPSTREAM_ERROR'});assert.equal(requests,2);
});
test('representative local disruption/injury/mobilisation reach existing Brain once; intent unchanged and cost measured',async()=>{
 const w=row(en,['France']),before=structuredClone(w),local=[
  item('scale',{publisher:'Local A',title:'51 établissements universitaires perturbés'}),
  item('injuries',{publisher:'Local B',title:'Enquête sur les blessures graves subies par des manifestants'}),
  item('mobilisation',{publisher:'Local C',title:'Mobilisation nationale du 5 novembre et nouveaux blocages'}),
 ];
 const noise=Array.from({length:20},(_,i)=>item('noise'+i,{title:'Country headline '+i}));
 let providers=0,brains=0,request;
 const result=await evaluateV3Source(w,source,{feed:async url=>{providers++;return response(new URL(url).searchParams.get('hl')==='fr'?local:noise);},model:async req=>{brains++;request=req;return judgment(req);}});
 assert.equal(providers,2);assert.equal(brains,1);assert.deepEqual(w,before);assert.equal(request.input.intent.canonical_text,en);
 for(const item of local)assert(result.evidence.content.includes(item.title));assert.equal(result.items.length,20);
 const oldEvidence=feedEvidence(response(noise));
 const oldPrepared=prepareReferenceJudgment(toBrainInput(w.understanding,oldEvidence,{entries:[{id:'pilot-baseline:'+w.id,fact:'Monitoring baseline established at '+w.baseline_at,date:w.baseline_at,alerted:false}]}));
 const oldWire={instructions:INSTRUCTIONS,input:oldPrepared.input,response_schema:oldPrepared.response_schema};
 const metrics={providerRequestsBefore:1,providerRequestsAfter:providers,modelCallsBefore:1,modelCallsAfter:brains,articlesBefore:20,articlesAfter:result.items.length,evidenceCharsBefore:oldEvidence.content.length,evidenceCharsAfter:result.evidence.content.length,approxEvidenceTokensBefore:Math.ceil(oldEvidence.content.length/4),approxEvidenceTokensAfter:Math.ceil(result.evidence.content.length/4),oldBrainWireChars:JSON.stringify(oldWire).length,newBrainWireChars:JSON.stringify(request).length,queries:planIntentNewsQueries(w,source).queries};
 await writeFile('/private/tmp/wa-intent-news-cost.json',JSON.stringify(metrics,null,2));
});
test('creation baseline acquisition remains one original request and zero Brain calls',async()=>{
 const w=row(en,['France']);w.baseline_at=null;let urls=[];
 const r=await evaluateV3Source(w,source,{feed:async url=>{urls.push(url);return response([item('baseline')]);},model:()=>assert.fail('No baseline model')});
 assert.deepEqual(urls,[source.url]);assert.equal(r.judgment,null);
});
test('GBP/EUR connector and exact condition remain untouched',async()=>{
 const w=row('Tell me when GBP/EUR goes above 1.17.',['GBP/EUR']);w.criteria={base:'GBP',quote:'EUR',operator:'gt',target:'1.17'};let currencies=0,brains=0;
 const r=await evaluateV3Source(w,{type:'currency',provider:'ecb',url:'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'},{feed:()=>assert.fail('No news requests'),currency:async req=>{currencies++;assert.equal(req,'GBP > 1.17 EUR');return {criteria:w.criteria,observation:{base:'GBP',quote:'EUR',rate:'1.18',date:'2026-11-03'},checkedAt:'2026-11-03T13:00:00Z'};},model:async req=>{brains++;return judgment(req);}});
 assert.equal(currencies,1);assert.equal(brains,1);assert.equal(r.evaluation.met,true);
});

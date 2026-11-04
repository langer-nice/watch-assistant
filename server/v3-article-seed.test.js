import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolveV3UrlCapture} from './v3-article-seed.js';
import {extractPageMetadata,fetchPageMetadata} from './url-watch-api.js';
import {createV3WatchHandler} from './v3-creation.js';
import {evaluateV3Source} from './v3-pilot.js';

const url='https://example.test/nice/shop-manager-assault-police-witness-appeal-20261022';
const html='<html lang="fr"><head><title>Shop manager assaulted in Nice: police seek witnesses</title><meta property="og:type" content="article"><meta property="og:site_name" content="Public news"><meta name="description" content="Police seek witnesses after an assault on a shop manager outside his store in Nice on 22 October."><meta property="article:published_time" content="2026-10-22T12:28:26+02:00"><link rel="canonical" href="'+url+'"></head><body>Subscribe to continue</body></html>';
const page=extractPageMetadata(html,url);
const capture={id:'capture',kind:'URL',raw_input:url,context:[{id:'resource',kind:'page',text:'',url}]};
const nonFeed=()=>{throw Object.assign(Error('HTML'),{code:'UNSUPPORTED_CONTENT_TYPE'});};
const ready=()=>({intent:{canonical_text:'Follow future developments in the 22 October assault on a shop manager in Nice and the police witness appeal.',references:[{label:'shop manager assault',source_ref:'article'},{label:'Nice',source_ref:'article'}],explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'Specific story identified.'}});
const env={V3_PILOT_ENABLED:'true',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'master',VERCEL_PROJECT_ID:'prj_vcrNNAlGsLrL6hjGlrwWFIdFbBFF',SUPABASE_URL:'https://cztpitujsnzhhenedwjn.supabase.co',STRUCTURED_PRODUCTION_ENABLED:'true',STRUCTURED_WATCH_BACKEND_ENABLED:'true',STRUCTURED_WATCH_CREATION_ENABLED:'true',STRUCTURED_MEDIA_SCHEDULED_ENABLED:'true'};
function harness({metadata=page,feed=nonFeed,output=ready(),locale='en'}={}){
 let saved,models=0,pages=0,request;
 const client={from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})})}),rpc:async(name,p)=>{if(name==='get_media_watch_notification_locale'){assert.equal(p.p_user_id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');return {data:locale};}saved=p;return {data:p.p_id};}};
 const handler=createV3WatchHandler({env,authenticate:async()=>({user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}}),serviceClient:client,feed,pageMetadata:async()=>{pages++;return metadata;},model:async r=>{models++;request=r;return output;}});
 return {async run(){let result;const res={setHeader(){},end(s){result={http:this.statusCode,...JSON.parse(s)};}};await handler({method:'POST',body:{instruction:url,captureKind:'URL',watchId:randomUUID()}},res);return result;},get saved(){return saved;},get models(){return models;},get pages(){return pages;},get request(){return request;}};
}
test('HTML article uses the existing PAGE_CONTEXT story path and preserves identity without body access',async()=>{
 const h=harness(),r=await h.run();assert.equal(r.status,'READY_TO_MONITOR');assert.equal(h.models,1);assert.equal(h.pages,1);
 assert.equal(h.request.input.capture.kind,'PAGE_CONTEXT');assert.match(h.request.input.capture.raw_input,/specific underlying event or story/);
 assert.equal(h.request.input.capture.context[0].kind,'story_seed');assert.equal(h.request.input.capture.context[0].url,undefined);assert(!JSON.stringify(h.request.input.capture).includes(url));
 const seed=h.saved.p_understanding.story_seed;assert.equal(seed.original_url,url);assert.equal(seed.canonical_url,url);assert.equal(seed.title,page.title);assert.equal(seed.publisher,'Public news');assert.equal(seed.published_at,page.publishedAt);
 assert.equal(h.saved.p_kind,'URL');assert.equal(h.saved.p_instruction,url);assert(!h.saved.p_understanding.resource);assert(h.saved.p_source.url.startsWith('https://news.google.com/rss/search'));
 assert.equal(page.articleText,'');assert.equal(page.contentAccessLimited,true);assert(!h.request.input.capture.context[0].text.includes('Subscribe to continue'));
});
for(const type of ['RSS','Atom'])test(type+' feed keeps exact URL capture/source and reuses its single initial fetch',async()=>{
 let feeds=0;const fixture={source:{title:type,url},items:[{id:'feed-item',title:'Existing news',excerpt:'Existing factual news',url:'https://example.test/news'}]};
 const h=harness({feed:async()=>{feeds++;return fixture;},output:{intent:{canonical_text:'Follow meaningful changes to this feed.',references:[],explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'Exact feed.'}}});
 assert.equal((await h.run()).status,'READY_TO_MONITOR');assert.equal(feeds,1);assert.equal(h.models,1);assert.equal(h.pages,0);assert.equal(h.request.input.capture.kind,'URL');assert.equal(h.saved.p_source.url,url);assert.equal(h.saved.p_understanding.resource.exact_url,url);
});
test('metadata-only public article is sufficient; canonical is identity, never a fetch target',async()=>{
 const metadata={...page,canonicalUrl:'https://canonical.example.test/story',articleText:''};let urls=[];
 const r=await resolveV3UrlCapture(capture,{feed:nonFeed,pageMetadata:async u=>{urls.push(u);return metadata;}});
 assert(r.seed);assert.deepEqual(urls,[url]);assert.equal(r.seed.canonical_url,metadata.canonicalUrl);assert.equal(r.capture.kind,'PAGE_CONTEXT');
});
for(const type of ['homepage','generic_webpage','news_section'])test(type+' does not create a specific story',async()=>{
 const h=harness({metadata:{...page,pageType:type}});const r=await h.run();assert.equal(r.status,'UNSUPPORTED_FOR_NOW');assert.match(r.reason,/article identity/);assert(!/RSS/.test(r.reason));assert.equal(h.models,0);assert.equal(h.saved,undefined);
});
test('private/access-denied page stops without page read/model/write or bypass',async()=>{
 let pages=0;const r=await resolveV3UrlCapture(capture,{feed:async()=>{throw Object.assign(Error('403'),{code:'ACCESS_DENIED'});},pageMetadata:()=>{pages++;assert.fail();}});
 assert.equal(r.decision.status,'UNSUPPORTED_FOR_NOW');assert.equal(pages,0);
});
test('HTTP error or public metadata access challenge is not treated as an article seed',async()=>{
 for(const metadata of [{...page,titleSource:'url_slug'},{...page,title:'Sign in to continue'}]){const h=harness({metadata});assert.equal((await h.run()).status,'UNSUPPORTED_FOR_NOW');assert.equal(h.saved,undefined);}
 const r=await resolveV3UrlCapture(capture,{feed:nonFeed,pageMetadata:async()=>{throw Error('HTTP 403');}});assert.equal(r.decision.status,'UNSUPPORTED_FOR_NOW');
});
test('invalid/private URL syntax cannot enter page/model paths',async()=>{
 for(const input of ['not a url','file:///etc/passwd','https://user:pass@example.test/article','http://example.test/article']){const r=await resolveV3UrlCapture({...capture,raw_input:input},{feed:()=>assert.fail('No invalid URL request')});assert.equal(r.decision.status,'UNSUPPORTED_FOR_NOW');}
 // DNS/private-address and redirect enforcement stays in the existing public readers.
});
test('feed/network and malformed XML failures retain their original error',async()=>{
 for(const code of ['UPSTREAM_ERROR','FEED_PARSE_ERROR','INVALID_SOURCE_URL'])await assert.rejects(resolveV3UrlCapture(capture,{feed:async()=>{throw Object.assign(Error(code),{code});},pageMetadata:()=>assert.fail()}),e=>e.code===code);
});
test('malformed RSS keeps its existing unsupported response; network failures remain service errors',async()=>{
 const malformed=harness({feed:async()=>{throw Object.assign(Error('XML'),{code:'FEED_PARSE_ERROR'});}});
 const r=await malformed.run();assert.equal(r.http,200);assert.equal(r.status,'UNSUPPORTED_FOR_NOW');assert.match(r.reason,/RSS\/Atom/);assert.equal(malformed.pages,0);
 const unavailable=harness({feed:async()=>{throw Object.assign(Error('Network'),{code:'UPSTREAM_ERROR'});}});assert.equal((await unavailable.run()).http,503);assert.equal(unavailable.pages,0);
});
test('seed baseline contains seed and no judgment/alert or extra model call',async()=>{
 const h=harness();await h.run();const b=h.saved.p_baseline;assert.equal(b.items.length,1);assert.equal(b.items[0].url,url);assert.equal(b.judgment,null);assert.equal(b.article,null);assert.equal(h.models,1);assert(b.evidence.content.includes(page.title));
});
test('future same-story evidence uses normal news/Brain; unrelated same-publisher/location fixture is not auto-alerted',async()=>{
 const h=harness();await h.run();const saved=h.saved;
 const row={id:saved.p_id,engine:'wa-v3-evidence-refs.v1',understanding:saved.p_understanding,source:saved.p_source,baseline_at:'2026-11-04T10:00:00Z',prior_state:{entries:[{id:saved.p_baseline.items[0].id,fact:page.title+' '+page.description,alerted:false}]}};
 for(const [action,title] of [['ALERT','Police arrest suspect in the shop manager assault in Nice'],['NO_ALERT','Police investigate an unrelated burglary in Nice'],['NO_ALERT','Public news reports unrelated technology earnings']]){
  let calls=0;const r=await evaluateV3Source(row,row.source,{outputLocale:'fr',feed:async u=>{assert(u.startsWith('https://news.google.com/'));assert.notEqual(u,url);return {source:{title:'Public news',url:u},items:[{id:title,title,excerpt:title,url:'https://example.test/new',source:'Public news'}]};},model:async req=>{calls++;assert.equal(req.input.intent.canonical_text,ready().intent.canonical_text);assert(req.input.prior_state.entries.some(e=>e.fact.includes(page.title)));assert.match(req.instructions,/French|français/i);return {action,evidence_status:'CONFIRMED',reason:action==='ALERT'?'Un nouveau développement concerne cette agression.':'Cette autre actualité est sans rapport.',condition_check:null,novelty_summary:null,evidence_refs:req.input.evidence.segments.filter(s=>s.field==='content').map(s=>s.id),provenance_refs:[]};}});
  assert.equal(calls,1);assert.equal(r.judgment.action,action);assert.equal(Boolean(r.article),action==='ALERT');
 }
 // These are deterministic transport/admission fixtures, not live model-semantic proof.
});
test('invented exact URL is still rejected by unchanged grounding, never silently removed',async()=>{
 const output=ready();output.intent.references.push({label:'seed',source_ref:'article',exact_url:url});const h=harness({output});const r=await h.run();assert.equal(r.http,503);assert.equal(h.saved,undefined);
});
test('French article Intent uses the existing owner locale without turning presentation into monitoring scope',async()=>{
 const output=ready();output.intent.canonical_text='Suivre les suites de cette agression et de l’enquête de police.';
 const h=harness({locale:'fr',output});assert.equal((await h.run()).status,'READY_TO_MONITOR');assert.match(h.request.input.capture.raw_input,/^Suis/);assert.match(h.request.instructions,/Write canonical_text and user-facing decision prose in French/);assert.match(h.request.instructions,/do not add it.*as monitored conditions/);assert(!h.request.input.capture.raw_input.includes('français'));assert.equal(h.models,1);
});
test('existing public metadata fetcher keeps private/redirect validation',async()=>{
 let requested=0;await assert.rejects(fetchPageMetadata(url,async()=>{requested++;return new Response(null,{status:302,headers:{location:'https://private.example.test/secret'}});},{validateUrl:async u=>{if(u.includes('private'))throw Error('Blocked');return new URL(u);}}),/Blocked/);assert.equal(requested,1);
});

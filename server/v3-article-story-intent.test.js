import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveV3UrlCapture,articleStoryIntentInstructions} from './v3-article-seed.js';
import {understandCapture,INSTRUCTIONS} from './v3-intent/understand.mjs';
import {v3Capability} from './v3-creation.js';
const url='https://reference.example.test/article-20261022';
const capture={kind:'URL',raw_input:url,context:[{id:'resource',kind:'page',text:'',url}]};
const ready=(text,labels)=>({intent:{canonical_text:text,references:labels.map(label=>({label,source_ref:'article'})),explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'The concrete story is identified.'}});
const prepare=(title,description,locale='en')=>resolveV3UrlCapture(capture,{feed:async()=>{throw Object.assign(Error('HTML'),{code:'UNSUPPORTED_CONTENT_TYPE'});},pageMetadata:async()=>({pageType:'article',title,description,canonicalUrl:url,siteName:'Reference publisher',publishedAt:'2026-10-22T12:00:00Z',titleSource:'open_graph_title',openGraphType:'article'}),storyLocale:async()=>locale});
for(const [name,title,description,summary,labels] of [
 ['Le Figaro-like assault','Micromania manager assaulted in Nice; police appeal for witnesses','The manager was attacked while defending a vandalised store. Police are looking for the attacker.','Follow important developments in the assault on the Micromania manager in Nice and the police search for the attacker.',['Micromania manager assault','police search for attacker','Nice']],
 ['court case','AsterCo appeals a patent ruling','The appeal concerns a disputed battery patent.','Follow developments in AsterCo’s appeal of the battery patent ruling.',['AsterCo','battery patent appeal']],
 ['product announcement','Vertex announces a new tablet','The new tablet will be released next month.','Follow developments concerning Vertex’s newly announced tablet and its release.',['Vertex','new tablet release']],
 ['sports story','Rovers defender undergoes surgery after match injury','The club will give recovery updates.','Follow developments in the Rovers defender’s injury, surgery and recovery.',['Rovers defender injury','surgery and recovery']],
 ['company dispute','Atlas sues Beacon over merger financing','The companies dispute obligations in a specific merger agreement.','Follow developments in the Atlas–Beacon merger financing dispute.',['Atlas','Beacon','merger financing dispute']],
 ['political event','Mayor resigns during an ethics inquiry','The council is investigating the allegations and choosing a successor.','Follow developments in the mayor’s resignation, ethics inquiry and succession.',['mayor resignation','ethics inquiry','succession']],
])test(name+' derives an eligible story in one existing Intent call with no resource locator',async()=>{
 const p=await prepare(title,description);let calls=0;
 const u=await understandCapture(p.capture,[],{model:async req=>{calls++;assert.equal(req.instructions,INSTRUCTIONS);const c=req.input.capture.context[0];assert.equal(c.kind,'story_seed');assert.equal(c.url,undefined);assert.equal(JSON.parse(c.text).title,title);assert(!JSON.stringify(req.input).includes(url));return ready(summary,labels);}});
 assert.equal(calls,1);assert.equal(u.intent.canonical_text,summary);assert.equal(u.intent.explicit_constraints.length,0);assert(!u.resource);assert(u.intent.references.every(r=>!r.exact_url));assert.equal(p.seed.original_url,url);assert.equal(p.seed.canonical_url,url);
 const capability=v3Capability(p.capture,u);assert(capability.source.url.startsWith('https://news.google.com/rss/search'));assert.notEqual(capability.source.url,url);
 const baseline=await p.baselineFeed(capability.source.url);assert.equal(baseline.items.length,1);assert.equal(baseline.items[0].url,url);
});
test('weak metadata may clarify without inventing an event or broad publisher Watch',async()=>{
 const p=await prepare('Latest update','');const out={intent:{canonical_text:'Follow the story referred to by the article.',references:[],explicit_constraints:[],unresolved_ambiguities:['The metadata does not identify an event.']},decision:{status:'NEEDS_CLARIFICATION',reason:'A concrete event is missing.',clarification_question:'Which story should be followed?'}};
 const u=await understandCapture(p.capture,[],{model:async()=>out});assert.equal(u.decision.status,'NEEDS_CLARIFICATION');assert.equal(u.intent.references.length,0);
});
test('explicit page-change request retains exact_resource under the unchanged global Intent contract',async()=>{
 const text='Tell me when this exact page changes.';
 const p={kind:'PAGE_CONTEXT',raw_input:text,context:[{id:'page',kind:'page',text:'Public page',url}]};
 const out={intent:{canonical_text:text,references:[{label:'Exact page',source_ref:'page',exact_url:url}],explicit_constraints:[{kind:'exact_resource',text:url,value:url,source_ref:'page'}],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'The exact resource is identified.'}};
 const u=await understandCapture(p,[],{model:async req=>{assert.equal(req.instructions,INSTRUCTIONS);return out;}});assert.deepEqual(u.intent,out.intent);
});
test('RSS keeps URL resource semantics and does not read story locale or use article prompt',async()=>{
 const r=await resolveV3UrlCapture(capture,{feed:async()=>({items:[]}),storyLocale:()=>assert.fail('No article locale for feed')});assert.equal(r.capture.kind,'URL');assert(!r.seed);
 const out={intent:{canonical_text:'Follow this feed.',references:[],explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'Exact feed.'}};
 const u=await understandCapture(r.capture,[],{model:async req=>{assert.equal(req.instructions,INSTRUCTIONS);return out;}});assert.equal(u.resource.exact_url,url);
});
test('article-only output instructions keep locale separate from monitoring requirements',()=>{
 assert.match(articleStoryIntentInstructions('fr'),/French/);assert.match(articleStoryIntentInstructions('en'),/English/);
 assert.match(articleStoryIntentInstructions('fr'),/Output language is presentation only/);assert.match(articleStoryIntentInstructions('fr'),/not necessarily the event date/);
});

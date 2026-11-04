import test from 'node:test';
import assert from 'node:assert/strict';
import {articleStoryTitleRequest,validateArticleStoryTitle} from './v3-article-seed.js';
import {OUTPUT_SCHEMA} from './v3-intent/schema.mjs';
import {understandCapture,INSTRUCTIONS} from './v3-intent/understand.mjs';
const cases=[
 ['Le Figaro-like incident','Micromania manager assaulted in Nice: police launch a witness appeal to find the attacker','Follow important developments in the assault on the Micromania manager in Nice and the police search for the attacker.','Agression du gérant Micromania à Nice','fr'],
 ['court case','AsterCo appeals a lengthy patent ruling after the latest hearings in Paris','Follow the AsterCo battery patent appeal in Paris, including the next hearing and ruling.','AsterCo patent appeal in Paris','en'],
 ['product announcement','Apple unveils the new MacBook Nova and details a future launch and availability schedule','Follow developments in the announced MacBook Nova launch and its availability.','Apple MacBook Nova launch','en'],
 ['sports story','Rovers defender Alex Rivera undergoes surgery after a severe injury during the final','Follow Alex Rivera’s injury, surgery and recovery after the Rovers final.','Alex Rivera’s injury and recovery','en'],
 ['short title','Atlas–Beacon merger dispute','Follow developments in the Atlas–Beacon merger financing dispute.','Atlas–Beacon merger dispute','en'],
 ['ambiguous case identity','Two similarly named Atlas patent disputes are proceeding in different jurisdictions','Follow the Atlas battery patent appeal in Oslo, distinct from the earlier Bergen sensor dispute.','Atlas battery patent appeal in Oslo, distinct from the Bergen sensor dispute','en'],
 ['political story','Mayor Jordan resigns while the council investigates financing allegations and appoints a successor','Follow the inquiry into Mayor Jordan’s campaign financing and the succession process.','Mayor Jordan financing inquiry','en'],
 ['business story','Northstar disputes Bluebird’s financing obligations under a proposed regional merger','Follow the Northstar–Bluebird merger financing dispute.','Northstar–Bluebird merger financing dispute','en'],
];
for(const [name,headline,canonical,title,locale] of cases)test(name+' has a separate concise title without changing detailed Intent or source metadata',async()=>{
 const capture={kind:'PAGE_CONTEXT',raw_input:'Follow this underlying story.',context:[{id:'article',kind:'story_seed',text:JSON.stringify({title:headline,description:canonical,publisher:'Public source'})}]};
 const semantic={intent:{canonical_text:canonical,references:[{label:name,source_ref:'article'}],explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'Specific story identified.'}};
 let savedTitle,calls=0;
 const result=await understandCapture(capture,[],{model:async request=>{
  calls++;const before=structuredClone(request.response_schema),wire=articleStoryTitleRequest(request,locale);
  assert.deepEqual(request.response_schema,before);assert.deepEqual(wire.response_schema.properties.intent,OUTPUT_SCHEMA.properties.intent);assert.deepEqual(wire.response_schema.properties.decision,OUTPUT_SCHEMA.properties.decision);
  assert.match(wire.instructions,locale==='fr'?/French/:/English/);assert.match(wire.instructions,/Do not shorten or change canonical_text/);assert.equal(request.instructions,INSTRUCTIONS);
  const output={...structuredClone(semantic),display_title:title};const {display_title,...base}=output;savedTitle=validateArticleStoryTitle(display_title);return base;
 }});
 assert.equal(calls,1);assert.deepEqual(result.intent,semantic.intent);assert.equal(savedTitle,title);assert(savedTitle.split(/\s+/u).length<=16);assert.equal(JSON.parse(capture.context[0].text).title,headline);
 if(name==='short title')assert.equal(savedTitle,headline);else assert.notEqual(savedTitle,headline);
 assert(!Object.hasOwn(result.intent,'display_title'));
});
test('invalid generated titles are rejected rather than clipped or silently rewritten',()=>{
 for(const value of [null,undefined,'','   ',' leading','trailing ','a'.repeat(161),'word '.repeat(16)+'word','Two\nlines'])assert.throws(()=>validateArticleStoryTitle(value),/Invalid article display title/);
 assert.equal(validateArticleStoryTitle('Apple MacBook Nova launch'),'Apple MacBook Nova launch');
});
test('clarification wire can return a null display title without changing the semantic schema',()=>{
 const wire=articleStoryTitleRequest({instructions:INSTRUCTIONS,response_schema:OUTPUT_SCHEMA},'en');assert.deepEqual(wire.response_schema.properties.display_title.type,['string','null']);assert(wire.response_schema.required.includes('display_title'));assert.match(wire.instructions,/Return null.*unless READY_TO_MONITOR/);
});

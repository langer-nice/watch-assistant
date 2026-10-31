import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createCapture} from './capture.mjs';import {understandCapture,INSTRUCTIONS} from './understand.mjs';import {fixtures} from './fixtures.mjs';
const url='https://example.com/jobs?city=Nice#roles';
const output=(canonical,label,source_ref='raw_input')=>({intent:{canonical_text:canonical,references:[{label,source_ref}],explicit_constraints:[],unresolved_ambiguities:[]},decision:{status:'READY_TO_MONITOR',reason:'Subject and broad scope identified.'}});
for(const name of ['Metallica','Manchester City','Gucci','Microsoft','Apple','NORTHSTAR','Northstar Research Institute','Player X','Nice','Product X'])test('ordinary subject remains reference: '+name,async()=>{
 const text='Keep me updated on new developments concerning '+name+'.',capture=createCapture({kind:'FREE_TEXT',raw_input:text});const raw=output(text,name),before=structuredClone(raw);let calls=0;
 const r=await understandCapture(capture,[],{model:async req=>{calls++;assert.ok(req.instructions.includes('Ordinary FREE_TEXT entity mentions are not exact_resource'));return raw;}});assert.equal(calls,1);assert.deepEqual(raw,before);assert.equal(r.intent.canonical_text,text);assert.equal(r.intent.references[0].label,name);assert.ok(!r.intent.explicit_constraints.some(c=>c.kind==='exact_resource'));assert.equal(r.decision.status,'READY_TO_MONITOR');
});
test('proper-noun precision/capitalization does not bypass unchanged resource guard',async()=>{
 for(const value of ['Metallica','Manchester City','Gucci','Microsoft','Apple','NORTHSTAR','DOC-123']){
  const capture=createCapture({kind:'FREE_TEXT',raw_input:'Follow '+value+'.'});const raw=output(capture.raw_input,value);raw.intent.explicit_constraints=[{kind:'exact_resource',text:value,source_ref:'raw_input',value}];
  await assert.rejects(understandCapture(capture,[],{model:async()=>raw}),/Exact resource differs from source URL/);
 }
});
test('exact URL query/fragment remains Capture-owned with matching metadata',async()=>{
 const capture=createCapture({kind:'URL',raw_input:'Monitor this page for meaningful changes.',context:[{id:'resource',kind:'page',text:'Job listings page.',url}]});const raw=output('Monitor this page for meaningful changes.','Page','resource');raw.intent.references[0].exact_url=url;raw.intent.explicit_constraints=[{kind:'exact_resource',text:url,source_ref:'resource',value:url}];
 const r=await understandCapture(capture,[],{model:async()=>raw});assert.equal(r.resource.exact_url,url);assert.equal(r.intent.references[0].exact_url,url);assert.equal(r.intent.explicit_constraints[0].text,url);
});
test('URL identity remains server-owned when model omits resource duplicates',async()=>{
 const capture=createCapture({kind:'URL',raw_input:'Monitor this page.',context:[{id:'resource',kind:'page',text:'',url}]});const r=await understandCapture(capture,[],{model:async()=>({intent:{canonical_text:'Monitor this page.'},decision:{status:'READY_TO_MONITOR',reason:'Resource identified.'}})});assert.equal(r.resource.exact_url,url);assert.ok(Object.isFrozen(r.resource));
});
test('malformed URL Capture rejects before model call',async()=>{let calls=0;await assert.rejects(understandCapture(createCapture({kind:'URL',raw_input:'Follow this page.',context:[{id:'resource',kind:'page',text:'',url:'not-a-url'}]}),[],{model:async()=>{calls++;}}),/valid absolute/);assert.equal(calls,0);});
test('existing exact-resource URL fixture unchanged',async()=>{const f=fixtures.find(f=>f.id==='T13'),r=await understandCapture(f.capture,[],{model:async()=>structuredClone(f.output)});assert.equal(r.resource.exact_url,f.capture.context[0].url);assert.equal(r.decision.status,'READY_TO_MONITOR');});
test('E10 actual historical exact URL output remains admitted',async()=>{const rows=JSON.parse(fs.readFileSync(new URL('../v3-brain-lab/end-to-end-mini/results/ledger.json',import.meta.url)));const cases=JSON.parse(fs.readFileSync(new URL('../v3-brain-lab/end-to-end-mini/manifest.json',import.meta.url)));const r=await understandCapture(cases.find(c=>c.id==='E10').capture,[],{model:async()=>structuredClone(rows.find(r=>r.id==='E10').intent.raw)});assert.equal(r.resource.exact_url,url);assert.equal(r.decision.status,'READY_TO_MONITOR');});
test('historical T4 malformed output still rejects without reclassification',async()=>{const rows=JSON.parse(fs.readFileSync(new URL('../v3-brain-lab/targeted-e2e-rerun/results/ledger.json',import.meta.url))),cases=JSON.parse(fs.readFileSync(new URL('../v3-brain-lab/targeted-e2e-rerun/manifest.json',import.meta.url)));const raw=structuredClone(rows.find(r=>r.id==='T4').intent.raw),before=structuredClone(raw);await assert.rejects(understandCapture(cases.find(c=>c.id==='T4').capture,[],{model:async()=>raw}),/Exact resource differs/);assert.deepEqual(raw,before);});
test('reference typing adds only two generic instruction lines',()=>{
 assert.ok(INSTRUCTIONS.includes('Represent subjects and entities in references using label and source_ref.'));
 assert.ok(INSTRUCTIONS.includes('Theoretical entity ambiguity'));
 const newLines=INSTRUCTIONS.split('\n').filter(l=>l.startsWith('Represent subjects and entities')||l.startsWith('Use exact_resource only for an explicitly'));
 assert.equal(newLines.length,2);for(const entity of ['Metallica','Manchester City','Gucci','Microsoft','Apple'])assert.ok(newLines.every(l=>!l.includes(entity)));
});

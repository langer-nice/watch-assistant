import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFile} from 'node:fs/promises';
import {createWatchCreationPresentation,watchCreationCopy,markWatchCreationTransition,isWatchCreationTransition} from './watch-creation-presentation.js';
import {configureStructuredWatchCreation,initStructuredWatchCreation} from './structured-watch-creation.js';
const markup='<form><textarea id="input"></textarea><button type="button" id="note">Add note</button><div id="actions"><button type="submit" id="newWatchSubmit"><span>➤</span><span id="newWatchSubmitLabel">Create Watch</span></button></div><p id="watchError" aria-live="polite"></p></form>';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const listen=(node,event,callback,options)=>node?.addEventListener(event,callback,options);
const tick=()=>new Promise(r=>setImmediate(r));
for(const state of ['success','error','clarify','unsupported'])test(`real V3 controller presentation: ${state}, exact request and no duplicate/retry`,async t=>{
 const oldDoc=globalThis.document,oldWin=globalThis.window;
 const {document}=parseHTML(markup);globalThis.document=document;globalThis.window={location:{href:''}};
 t.after(()=>{globalThis.document=oldDoc;globalThis.window=oldWin;configureStructuredWatchCreation(null);});
 const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 configureStructuredWatchCreation({getState:()=>({status:'authenticated',session:{user:{id:owner},access_token:'fixture-only'}})});
 const form=document.querySelector('form'),input=document.querySelector('textarea'),button=document.querySelector('#newWatchSubmit'),label=document.querySelector('#newWatchSubmitLabel'),status=document.querySelector('#watchError');
 input.value='Keep me updated on important developments concerning Blackburn Rovers football club';
 let release;const held=new Promise(r=>release=r);const calls=[];
 const c=initStructuredWatchCreation({form,input,error:status,getLanguage:()=> 'en',listen,uuid:()=>id,fetchImpl:async(path,req)=>{
  calls.push({path,body:req.body?JSON.parse(req.body):null});
  if(path==='/api/structured-watches')return Response.json({enabled:true,v3Create:true});
  await held;
  return state==='error'?Response.json({code:'V3_CREATION_UNAVAILABLE'},{status:503}):Response.json({status:state==='success'?'READY_TO_MONITOR':state==='clarify'?'NEEDS_CLARIFICATION':'UNSUPPORTED_FOR_NOW',id:state==='success'?id:undefined,clarification_question:'Which club?',reason:'Connector unavailable.'});
 }});
 assert.equal(label.textContent,'Create Watch');assert.equal(button.querySelector('.watch-creation-spinner'),null);
 const work=c.runV3(input.value,'en');while(calls.length<2)await tick();
 assert.equal(button.disabled,true);assert.equal(button.getAttribute('aria-busy'),'true');assert.equal(form.getAttribute('aria-busy'),'true');
 assert.equal(label.textContent,'Creating Watch…');assert.equal(button.querySelector('.watch-creation-spinner').hidden,false);
 assert.equal(input.readOnly,true);assert.equal(document.querySelector('#note').disabled,true);assert.match(input.value,/Blackburn Rovers/);
 assert.equal(status.previousElementSibling,button);assert.equal(status.textContent,'Creating your Watch…');assert.equal(status.getAttribute('role'),'status');assert.equal(status.getAttribute('aria-live'),'polite');
 const second=new document.defaultView.Event('submit',{bubbles:true,cancelable:true});form.dispatchEvent(second);assert.equal(second.defaultPrevented,true);
 await c.runV3(input.value,'en');assert.equal(calls.length,2);
 assert.deepEqual(calls[1],{path:'/api/v3-pilot',body:{instruction:input.value,watchId:id,captureKind:'FREE_TEXT'}});
 release();await work;
 assert.match(input.value,/Blackburn Rovers/);
 if(state==='success'){assert.equal(window.location.href,'watch-detail.html?id='+id);assert.equal(button.disabled,true);assert.equal(label.textContent,'Creating Watch…');}
 else{assert.equal(window.location.href,'');assert.equal(button.disabled,false);assert.equal(input.readOnly,false);assert.equal(label.textContent,'Create Watch');assert.equal(button.querySelector('.watch-creation-spinner').hidden,true);assert.equal(form.getAttribute('aria-busy'),null);assert.match(status.textContent,state==='error'?/Creation could not be confirmed/:state==='clarify'?/Which club/:/cannot be monitored/);}
 assert.equal(calls.length,2);
});

test('presentation preserves pre-disabled controls and restores keyboard focus on error',()=>{
 const {document}=parseHTML(markup),form=document.querySelector('form'),button=document.querySelector('#newWatchSubmit'),note=document.querySelector('#note');note.disabled=true;
 Object.defineProperty(document,'activeElement',{value:button,writable:true});let focused=0;button.focus=()=>focused++;
 const ui=createWatchCreationPresentation({form,status:document.querySelector('p'),getLanguage:()=> 'fr',listen});
 ui.start();assert.equal(document.querySelector('#newWatchSubmitLabel').textContent,'Création de la Watch…');
 ui.finish();assert.equal(note.disabled,true);assert.equal(button.disabled,false);assert.equal(focused,1);
});

test('account/editor invalidation cannot restore scrubbed controls',()=>{
 const {document}=parseHTML(markup),form=document.querySelector('form'),button=document.querySelector('#newWatchSubmit');let current=true;
 const ui=createWatchCreationPresentation({form,status:document.querySelector('p'),getLanguage:()=> 'en',listen,isCurrent:()=>current});
 ui.start();current=false;ui.finish();assert.equal(button.disabled,true);
});

const state=(extra={})=>({active:false,uncertain:false,loading:false,waiting:false,failed:false,...extra});
for(const [name,availability,found,expected] of [
 ['initial idle list',state(),false,true],['existing hydration',state({active:true,loading:true,uncertain:true}),false,true],
 ['loaded Watch',state({active:true}),true,false],['genuine absence after hydration',state({active:true}),false,false],
 ['load error',state({active:true,failed:true,uncertain:true}),false,false],
])test(`creation detail transition: ${name}`,()=>{
 const s=storage();markWatchCreationTransition('new',{storage:s,now:100});
 assert.equal(isWatchCreationTransition({id:'new',found,availability,storage:s,now:101}),expected);
 if(!expected)assert.equal(s.getItem('watchAssistant.creationTransition'),undefined);
});
test('handoff is limited to matching ID and passive expiry; unavailable session storage is optional',()=>{
 const s=storage();markWatchCreationTransition('new',{storage:s,now:100});
 assert.equal(isWatchCreationTransition({id:'old',found:false,availability:state(),storage:s,now:101}),false);
 assert.equal(isWatchCreationTransition({id:'new',found:false,availability:state(),storage:s,now:120101}),false);
 const bad={setItem(){throw Error('blocked');},getItem(){throw Error('blocked');}};
 assert.doesNotThrow(()=>markWatchCreationTransition('new',{storage:bad}));assert.equal(isWatchCreationTransition({id:'new',found:false,availability:state(),storage:bad}),false);
});
test('loading CSS remains scoped, fits narrow button and respects reduced motion',async()=>{
 const css=await readFile(new URL('../scss/pages/_new-watch.scss',import.meta.url),'utf8');
 assert.match(css,/\.watch-form\.is-creating \.watch-composer__submit/);assert.match(css,/\.watch-creation-spinner[\s\S]*?flex: 0 0 auto/);
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);assert.match(css,/\.watch-form \.watch-creation-status[\s\S]*?overflow-wrap: anywhere/);
 const module=await readFile(new URL('./watch-creation-presentation.js',import.meta.url),'utf8');assert.doesNotMatch(module,/\bfetch\s*\(|setTimeout\s*\(|setInterval\s*\(/);
 assert.equal(watchCreationCopy('en').button,'Creating Watch…');
});

test('optional rendering failure cannot throw into the creation controller',()=>{
 const {document}=parseHTML(markup),form=document.querySelector('form');
 document.querySelector('#newWatchSubmit').prepend=()=>{throw Error('Optional spinner render failed');};
 const ui=createWatchCreationPresentation({form,status:document.querySelector('p'),getLanguage:()=> 'en',listen});
 assert.doesNotThrow(()=>ui.start());assert.doesNotThrow(()=>ui.navigating('new'));assert.doesNotThrow(()=>ui.finish());
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {configureInterfaceLocaleSync} from './interface-locale-sync.js';
test('existing UI locale profile sync is owner-bound, coalesced, ordered and has no Watch writes',async()=>{
 let state={status:'anonymous'},locale='fr',changed;const calls=[],events=new EventTarget();
 const auth={getState:()=>state,subscribe:fn=>{changed=fn;return()=>{changed=null;};}};
 const client={from:table=>({update:body=>({eq:async(key,id)=>{calls.push({table,body,key,id});return {error:null};}})})};
 const sync=configureInterfaceLocaleSync({client,auth,getLocale:()=>locale,events});await sync.sync();assert.equal(calls.length,0);
 state={status:'authenticated',session:{user:{id:'owner-a'}}};changed();await sync.sync();assert.deepEqual(calls,[{table:'profiles',body:{locale:'fr'},key:'id',id:'owner-a'}]);
 await sync.sync();assert.equal(calls.length,1);
 locale='en';events.dispatchEvent(new Event('i18n:languageChanged'));await sync.sync();assert.equal(calls.at(-1).body.locale,'en');
 locale='fr';events.dispatchEvent(new Event('i18n:languageChanged'));locale='en';events.dispatchEvent(new Event('i18n:languageChanged'));await sync.sync();assert.equal(calls.at(-1).body.locale,'en');
 locale='fr';changed();state={status:'authenticated',session:{user:{id:'owner-b'}}};changed();await sync.sync();assert.equal(calls.at(-1).id,'owner-b');
 const n=calls.length;sync.destroy();locale='en';events.dispatchEvent(new Event('i18n:languageChanged'));await sync.sync();assert.equal(calls.length,n);
});
test('an in-flight locale write cannot finish after a newer write; failed sync may retry',async()=>{
 let locale='fr',release,entered,fail=true;const writes=[],started=new Promise(r=>{entered=r;});
 const auth={getState:()=>({status:'authenticated',session:{user:{id:'owner'}}}),subscribe:()=>()=>{}};
 const client={from:()=>({update:body=>({eq:async()=>{
  if(writes.length===0){writes.push(body.locale);await new Promise(r=>{release=r;entered();});return {error:{code:'NETWORK'}};}
  writes.push(body.locale);return {error:fail?(fail=false,{code:'NETWORK'}):null};
 }})})};
 const sync=configureInterfaceLocaleSync({client,auth,getLocale:()=>locale});await started;
 locale='en';const pending=sync.sync();assert.deepEqual(writes,['fr']);release();await pending;
 assert.deepEqual(writes,['fr','en']);await sync.sync();assert.deepEqual(writes,['fr','en','en']);sync.destroy();
});

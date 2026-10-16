import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML,Event} from 'linkedom';
import {initStructuredEmailPreference} from './structured-email-preference.js';
import {createClient} from '@supabase/supabase-js';
const id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const fixture=async(locale='en',rpc,authenticated=true)=>{
 const copy=JSON.parse(await readFile(new URL('../locales/'+locale+'.json',import.meta.url),'utf8'));
 const {document}=parseHTML('<div id="email-notifications" hidden><label><input type="checkbox"><span data-email-label></span></label><p data-email-hint></p><p role="status"></p></div>');
 const root=document.querySelector('div'),calls=[],listeners=new Set();let state=authenticated?{status:'authenticated',session:{user:{id:'synthetic-owner'}}}:{status:'anonymous',session:null};let saved=false;
 const client={rpc:(name,p)=>{calls.push([name,p]);return {then(resolve,reject){return Promise.resolve().then(()=>rpc?rpc(name,p):{data:name.startsWith('get_')?saved:(saved=p.p_enabled)}).then(resolve,reject);}};}};
 const auth={getState:()=>state,subscribe:fn=>(listeners.add(fn),()=>listeners.delete(fn))};
 const control=initStructuredEmailPreference({root,client,auth,location:{search:'?id='+id},t:key=>key.split('.').reduce((v,k)=>v[k],copy)});
 await tick();return{root,input:root.querySelector('input'),calls,control,changeOwner(){state={status:'anonymous'};listeners.forEach(fn=>fn());}};
};
for(const locale of ['en','fr'])test('affirmative preference and independent monitoring labels '+locale,async()=>{const f=await fixture(locale);assert.equal(f.input.checked,false);assert.equal(f.root.hidden,false);assert(f.root.textContent.includes(locale==='fr'?'surveillance reste indépendante':'Monitoring stays independent'));f.input.checked=true;f.input.dispatchEvent(new Event('change'));await tick();assert.equal(f.calls.at(-1)[0],'set_structured_media_email_preference');assert.deepEqual(f.calls.at(-1)[1],{p_watch_id:id,p_enabled:true});f.input.checked=false;f.input.dispatchEvent(new Event('change'));await tick();assert.equal(f.calls.at(-1)[1].p_enabled,false);assert(!f.calls.some(([name])=>name.includes('monitoring')));f.control.destroy();});
test('sign-out scrubs consent and disables cross-account UI',async()=>{const f=await fixture();f.input.checked=true;f.changeOwner();await tick();assert.equal(f.root.hidden,true);assert.equal(f.input.checked,false);assert.equal(f.input.disabled,true);});
test('missing/ambiguous preference stays hidden and disabled',async()=>{for(const data of [null,'true',{}]){const f=await fixture('en',async()=>({data}));assert(f.root.hidden);assert(f.input.disabled);}});
test('failed save restores confirmed value and displays safe translated error',async()=>{const f=await fixture('fr',async name=>name.startsWith('get_')?{data:false}:{error:{message:'PRIVATE'}});f.input.checked=true;f.input.dispatchEvent(new Event('change'));await tick();assert.equal(f.input.checked,false);assert(f.root.textContent.includes('Impossible'));assert(!f.root.textContent.includes('PRIVATE'));});
test('actual Supabase RPC builder without catch supports owner load/save/reload with email delivery disabled',async()=>{
 let consent=false;const requests=[];
 const client=createClient('https://offline.supabase.co','offline-placeholder',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{
  requests.push(String(url));assert(String(url).startsWith('https://offline.supabase.co/rest/v1/rpc/'));assert(!String(url).includes('monitoring'));
  if(String(url).endsWith('/set_structured_media_email_preference'))consent=JSON.parse(options.body).p_enabled;
  return new Response(JSON.stringify(consent),{status:200,headers:{'Content-Type':'application/json'}});
 }}});
 assert.equal(typeof client.rpc('get_structured_media_email_preference',{p_watch_id:id}).catch,'undefined');
 const call=(name,p)=>client.rpc(name,p);
 const f=await fixture('fr',call);assert.equal(f.root.hidden,false);assert.equal(f.input.checked,false);
 f.input.checked=true;f.input.dispatchEvent(new Event('change'));await tick();assert.equal(consent,true);assert(f.root.textContent.includes('activées'));f.control.destroy();
 const reloaded=await fixture('en',call);assert.equal(reloaded.input.checked,true);assert.equal(reloaded.root.hidden,false);reloaded.control.destroy();assert.equal(requests.length,3);
});
test('rejected RPC thenable fails closed without unhandled errors or secret disclosure',async()=>{const f=await fixture('en',()=>Promise.reject(Error('PRIVATE')));assert(f.root.hidden);assert(f.input.disabled);assert(!f.root.textContent.includes('PRIVATE'));});
test('unauthenticated viewer never loads or offers a writable preference',async()=>{const f=await fixture('en',undefined,false);assert.equal(f.calls.length,0);assert(f.root.hidden);assert(f.input.disabled);});
test('owner authorization rejection leaves the setting inaccessible rather than writable',async()=>{const f=await fixture('en',()=>({error:{code:'42501',message:'PRIVATE'}}));assert(f.root.hidden);assert(f.input.disabled);assert(!f.root.textContent.includes('PRIVATE'));});

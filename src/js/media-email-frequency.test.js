import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {parseHTML,Event} from 'linkedom';
import {PGlite} from '@electric-sql/pglite';
import {initStructuredEmailPreference} from './structured-email-preference.js';
import {definitions} from '../../server/test-support/watch-definition-fixtures.js';
import {structuredMonitoringSource} from './watch-definition.js';
import {fingerprint} from '../../server/structured-watch-authorization.js';
const id='cccccccc-cccc-4ccc-8ccc-cccccccccccc',owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const settled=async f=>{for(let i=0;i<100&&f.input.disabled;i++)await new Promise(r=>setTimeout(r,1));assert.equal(f.input.disabled,false,'preference request completed');};
const html=await readFile(new URL('../../watch-detail.html',import.meta.url),'utf8');
const copies=Object.fromEntries(await Promise.all(['en','fr'].map(async l=>[l,JSON.parse(await readFile(new URL('../locales/'+l+'.json',import.meta.url),'utf8'))])));
async function fixture({locale='en',initial={mode:'daily_digest',enabled:false,version:'daily-digest.v1'},rpc,authenticated=true,gate=true,watchId=id}={}){
 const {document}=parseHTML(html),root=document.querySelector('#email-notifications'),input=root.querySelector('input'),frequency=root.querySelector('select');
 const calls=[],listeners=new Set();let saved={...initial},language=locale,state=authenticated?{status:'authenticated',session:{user:{id:owner}}}:{status:'anonymous'};
 const client={rpc:(name,p)=>{calls.push([name,p]);return{then(resolve,reject){return Promise.resolve().then(()=>rpc?rpc(name,p):{data:name.startsWith('get_')?{...saved}:(saved={mode:p.p_mode,enabled:p.p_enabled,version:'daily-digest.v1'})}).then(resolve,reject);}};}};
 const auth={getState:()=>state,subscribe:fn=>(listeners.add(fn),()=>listeners.delete(fn))};
 const control=initStructuredEmailPreference({root,client,auth,location:{search:'?id='+watchId},t:k=>k.split('.').reduce((v,key)=>v[key],copies[language]),digestEnabled:gate});
 await tick();
 return{root,input,frequency,calls,control,changeFrequency:async mode=>{for(const o of frequency.options)o.selected=false;[...frequency.options].find(o=>o.value===mode).selected=true;frequency.dispatchEvent(new Event('change'));await tick();},consent:async checked=>{input.checked=checked;input.dispatchEvent(new Event('change'));await tick();},signOut(){state={status:'anonymous'};listeners.forEach(f=>f());},switchOwner(){state={status:'authenticated',session:{user:{id:other}}};listeners.forEach(f=>f());},translate(l){language=l;control.render();}};
}
for(const locale of ['en','fr'])test('shared frequency labels, explicit consent, persist and reload '+locale,async()=>{
 let saved={mode:'daily_digest',enabled:false,version:'daily-digest.v1'};
 const rpc=(n,p)=>({data:n.startsWith('get_')?{...saved}:(saved={mode:p.p_mode,enabled:p.p_enabled,version:'daily-digest.v1'})});
 const f=await fixture({locale,rpc});assert(!f.root.hidden);assert.equal(f.input.checked,false);assert.equal(f.frequency.value,'daily_digest');assert(f.root.textContent.includes(copies[locale].detail.emailOff));assert.equal(f.frequency.getAttribute('aria-label'),copies[locale].detail.emailFrequency);assert.equal(f.frequency.options.length,3);
 await f.changeFrequency('immediate');assert.equal(saved.enabled,false);assert.equal(saved.mode,'immediate');await f.consent(true);assert.equal(saved.enabled,true);await f.changeFrequency('daily_digest');assert.equal(saved.enabled,true);assert.equal(saved.mode,'daily_digest');f.control.destroy();
 const reload=await fixture({locale,rpc});assert(reload.input.checked);assert.equal(reload.frequency.value,'daily_digest');await reload.changeFrequency('off');assert.equal(saved.enabled,false);assert.equal(saved.mode,'off');assert(!reload.input.checked);await reload.changeFrequency('daily_digest');assert.equal(saved.enabled,false);await reload.consent(true);assert.equal(saved.enabled,true);assert(!reload.calls.some(([n])=>/monitor|claim|send/.test(n)));reload.control.destroy();
});
test('existing legacy/Structured immediate policy displays unchanged and no write on mount/language change',async()=>{
 const f=await fixture({initial:{mode:'immediate',enabled:true,version:'legacy'}});assert.equal(f.frequency.value,'immediate');assert.equal(f.input.checked,true);f.translate('fr');assert.equal(f.frequency.options[1].textContent,copies.fr.detail.emailFrequencyDaily);assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'get_media_watch_email_policy');
});
test('explicit consent from Off uses daily default; never silently enables via mode change',async()=>{
 const f=await fixture({initial:{mode:'off',enabled:false,version:'daily-digest.v1'}});await f.consent(true);assert.deepEqual(f.calls.at(-1),['set_media_watch_email_policy',{p_watch_id:id,p_mode:'daily_digest',p_enabled:true}]);assert.equal(f.frequency.value,'daily_digest');await f.consent(false);assert.equal(f.frequency.value,'daily_digest');assert.equal(f.calls.at(-1)[1].p_enabled,false);
});
for(const data of [null,true,{}, {mode:'daily_digest',enabled:'true',version:'daily-digest.v1'}, {mode:'other',enabled:true,version:'daily-digest.v1'},{mode:'off',enabled:true,version:'daily-digest.v1'},{mode:'daily_digest',enabled:true,version:'unknown'}])test('missing migration/unsupported or non-Media policy fails closed '+JSON.stringify(data),async()=>{
 const f=await fixture({rpc:()=>({data})});assert(f.root.hidden);assert(f.input.disabled);assert(f.frequency.disabled);assert.equal(f.calls.length,1);
});
test('read rejection/anonymous viewer cannot edit; no fallback write to old consent API',async()=>{
 const a=await fixture({authenticated:false});assert.equal(a.calls.length,0);assert(a.root.hidden);
 const f=await fixture({rpc:()=>({error:{code:'42501',message:'PRIVATE'}})});assert(f.root.hidden);assert(f.frequency.disabled);assert(!f.root.textContent.includes('PRIVATE'));assert.equal(f.calls.length,1);
});
for(const response of [{error:{code:'42501',message:'PRIVATE'}},{data:{mode:'off',enabled:false,version:'daily-digest.v1'}}])test('failed or contradictory save restores both persisted controls '+JSON.stringify(response),async()=>{
 const f=await fixture({rpc:n=>n.startsWith('get_')?{data:{mode:'daily_digest',enabled:false,version:'daily-digest.v1'}}:response});await f.consent(true);assert.equal(f.input.checked,false);assert.equal(f.frequency.value,'daily_digest');assert(f.root.textContent.includes(copies.en.detail.emailSaveFailed));assert(!f.root.textContent.includes('PRIVATE'));assert(!f.frequency.disabled);
});
test('a rejected thenable never exposes details or leaves enabled controls',async()=>{
 const f=await fixture({rpc:()=>Promise.reject(Error('PRIVATE'))});assert(f.root.hidden);assert(f.frequency.disabled);assert(!f.root.textContent.includes('PRIVATE'));
});
test('sign-out during save scrubs DOM and ignores late response',async()=>{
 let finish;const f=await fixture({rpc:n=>n.startsWith('get_')?{data:{mode:'daily_digest',enabled:false,version:'daily-digest.v1'}}:new Promise(r=>finish=r)});
 void f.consent(true);await tick();assert(f.input.disabled);assert(f.frequency.disabled);f.signOut();finish({data:{mode:'daily_digest',enabled:true,version:'daily-digest.v1'}});await tick();assert(f.root.hidden);assert(!f.input.checked);assert(f.input.disabled);assert(f.frequency.disabled);
});
test('owner change during load cannot publish previous owner preference',async()=>{
 const resolvers=[];const f=await fixture({rpc:()=>new Promise(r=>resolvers.push(r))});f.switchOwner();await tick();resolvers[0]({data:{mode:'immediate',enabled:true,version:'legacy'}});await tick();assert(f.root.hidden);resolvers[1]({data:null});await tick();assert(f.root.hidden);
});
test('disabled browser gate preserves old Structured boolean contract and hides frequency',async()=>{
 const f=await fixture({gate:false,rpc:(n,p)=>({data:n.startsWith('get_')?false:p.p_enabled})});assert(!f.root.hidden);assert(f.root.querySelector('[data-email-frequency-control]').hidden);await f.consent(true);assert.equal(f.calls.at(-1)[0],'set_structured_media_email_preference');assert.deepEqual(f.calls.at(-1)[1],{p_watch_id:id,p_enabled:true});
});
test('destroy removes writes, hides frequency and clears consent',async()=>{
 const f=await fixture();const before=f.calls.length;f.control.destroy();await f.changeFrequency('immediate');await f.consent(true);assert.equal(f.calls.length,before);assert(f.root.hidden);assert(f.frequency.disabled);
});
test('shared UI persists against actual owner-bound SQL for legacy and Structured; cross-owner denied',async()=>{
 const db=new PGlite(),fetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('No network');
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;`);
  const dir=new URL('../../supabase/migrations/',import.meta.url);for(const file of(await readdir(dir)).sort().filter(f=>f.endsWith('.sql')))await db.exec((await readFile(new URL(file,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));
  await db.query("insert into auth.users values($1,'owner@example.test'),($2,'other@example.test')",[owner,other]);
  const sql=(role,user,query,args)=>db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,user]);return tx.query(query,args);});
  const legacy='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await sql('authenticated',owner,"select public.persist_media_watch_with_digest($1,'Legacy',$2,$3,'paused',0,$4,false)",[legacy,{type:'feed',url:'https://news.google.com/rss/search?q=Jannik%20Sinner',query:'Jannik Sinner'},{inputType:'text',category:'news',request:'Jannik Sinner',mediaMention:{subjects:['Jannik Sinner'],matchMode:'all'}},'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee']);
  const definition=definitions()[0],source=structuredMonitoringSource(definition.plan.criteria);
  await sql('service_role',owner,"select public.persist_structured_watch_with_digest($1,$2,'create',$3,0,'Structured',$4,$5,$6,$7)",[owner,id,'ffffffff-ffff-4fff-8fff-ffffffffffff',source,definition,fingerprint(definition),fingerprint({title:'Structured',definition,source})]);
  const rpc=async(name,p)=>{try{const pairs=Object.entries(p),r=await sql('authenticated',owner,'select public.'+name+'('+pairs.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') result',pairs.map(([,v])=>v));return{data:r.rows[0].result};}catch(e){return{error:{code:e.code}};}};
  // SQL I/O takes more than an event-loop tick; await refresh/save explicitly.
  for(const watchId of [legacy,id]){
   const f=await fixture({watchId,rpc});await f.control.refresh();assert(!f.root.hidden);assert(!f.input.checked);assert.equal(f.frequency.value,'daily_digest');
   await f.consent(true);await settled(f);assert(f.input.checked);assert(!f.input.disabled);await f.control.refresh();assert(f.input.checked);
   await f.changeFrequency('immediate');await settled(f);await f.control.refresh();assert.equal(f.frequency.value,'immediate');assert(f.input.checked);
   await f.changeFrequency('off');await settled(f);await f.control.refresh();assert.equal(f.frequency.value,'off');assert(!f.input.checked);
   assert.equal((await db.query('select monitoring_state from public.watches where id=$1',[watchId])).rows[0].monitoring_state,'paused');f.control.destroy();
   await assert.rejects(sql('authenticated',other,'select public.set_media_watch_email_policy($1,$2,true)',[watchId,'daily_digest']),{code:'42501'});
  }
  assert.equal((await db.query('select count(*)::int n from public.media_watch_notifications')).rows[0].n,0);
 }finally{globalThis.fetch=fetch;await db.close();}
});

// Feedback keeps semantic state so a language change never reuses old display text.
for (const locale of ['fr','en']) test('saved feedback retranslates immediately from '+locale,async()=>{
 const otherLocale=locale==='fr'?'en':'fr', f=await fixture({locale});
 const status=()=>f.root.querySelector('[role="status"]').textContent;
 assert.equal(status(),'');
 await f.changeFrequency('immediate');assert.equal(status(),copies[locale].detail.emailOff);
 const calls=f.calls.length;f.translate(otherLocale);
 assert.equal(status(),copies[otherLocale].detail.emailOff);assert.equal(f.calls.length,calls);
 assert.equal(f.input.checked,false);assert.equal(f.frequency.value,'immediate');
 await f.consent(true);assert.equal(status(),copies[otherLocale].detail.emailOn);
 f.translate(locale);assert.equal(status(),copies[locale].detail.emailOn);
 f.control.destroy();assert.equal(status(),'');
});
for (const locale of ['fr','en']) test('failed feedback retranslates safely from '+locale,async()=>{
 const otherLocale=locale==='fr'?'en':'fr';
 const f=await fixture({locale,rpc:n=>n.startsWith('get_')?{data:{mode:'daily_digest',enabled:false,version:'daily-digest.v1'}}:{error:{message:'PRIVATE'}}});
 await f.changeFrequency('immediate');const status=f.root.querySelector('[role="status"]');
 assert.equal(status.textContent,copies[locale].detail.emailSaveFailed);f.translate(otherLocale);
 assert.equal(status.textContent,copies[otherLocale].detail.emailSaveFailed);
 assert.equal(f.input.checked,false);assert.equal(f.frequency.value,'daily_digest');assert(!f.root.textContent.includes('PRIVATE'));f.control.destroy();
});
test('pending feedback stays empty across language changes until confirmed persistence',async()=>{
 let finish;const f=await fixture({locale:'fr',rpc:n=>n.startsWith('get_')?{data:{mode:'daily_digest',enabled:false,version:'daily-digest.v1'}}:new Promise(r=>finish=r)});
 const status=f.root.querySelector('[role="status"]');await f.changeFrequency('immediate');
 assert(f.frequency.disabled);assert.equal(status.textContent,'');f.translate('en');assert.equal(status.textContent,'');
 finish({data:{mode:'immediate',enabled:false,version:'daily-digest.v1'}});await tick();
 assert.equal(status.textContent,copies.en.detail.emailOff);assert(!f.frequency.disabled);f.control.destroy();
});
test('refresh, owner switch and new Watch clear semantic feedback, including late saves',async()=>{
 const f=await fixture();const status=f.root.querySelector('[role="status"]');await f.changeFrequency('off');assert(status.textContent);
 await f.control.refresh();f.translate('fr');assert.equal(status.textContent,'');
 await f.changeFrequency('immediate');f.switchOwner();await tick();f.translate('en');assert.equal(status.textContent,'');
 f.control.destroy();const next=await fixture({watchId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'});assert.equal(next.root.querySelector('[role="status"]').textContent,'');next.control.destroy();
 let finish;const pending=await fixture({rpc:n=>n.startsWith('get_')?{data:{mode:'daily_digest',enabled:false,version:'daily-digest.v1'}}:new Promise(r=>finish=r)});
 await pending.changeFrequency('off');pending.switchOwner();await tick();finish({data:{mode:'off',enabled:false,version:'daily-digest.v1'}});await tick();pending.translate('fr');assert.equal(pending.root.querySelector('[role="status"]').textContent,'');pending.control.destroy();
});
test('disabled frequency gate retranslates boolean save feedback without changing its contract',async()=>{
 const f=await fixture({gate:false,locale:'fr',rpc:(n,p)=>({data:n.startsWith('get_')?false:p.p_enabled})});await f.consent(true);
 f.translate('en');assert.equal(f.root.querySelector('[role="status"]').textContent,copies.en.detail.emailOn);assert.equal(f.calls.at(-1)[0],'set_structured_media_email_preference');f.control.destroy();
});

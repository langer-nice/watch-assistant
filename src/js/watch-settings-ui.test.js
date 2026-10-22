import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML,Event} from 'linkedom';
import {initStructuredEmailPreference} from './structured-email-preference.js';
const html=await readFile(new URL('../../watch-detail.html',import.meta.url),'utf8');
const copies=Object.fromEntries(await Promise.all(['en','fr'].map(async l=>[l,JSON.parse(await readFile(new URL('../locales/'+l+'.json',import.meta.url),'utf8'))])));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function setup({language='en',enabled=false,mode='daily_digest',fail=false}={}){
 const{document}=parseHTML(html),root=document.getElementById('email-notifications'),calls=[];let policy={enabled,mode,version:'daily-digest.v1'};
 const t=key=>key.split('.').reduce((v,k)=>v?.[k],copies[language]);
 const controller=initStructuredEmailPreference({root,digestEnabled:true,client:{rpc:async(name,p)=>{calls.push([name,p]);if(name.startsWith('get_'))return {data:{...policy}};if(fail)return {error:{message:'private'}};policy={...policy,mode:p.p_mode,enabled:p.p_enabled};return {data:{...policy}};}},auth:{getState:()=>({status:'authenticated',session:{user:{id:'owner'}}}),subscribe:()=>()=>{}},location:{search:'?id='+id},t});
 await tick();return{document,root,calls,controller,input:root.querySelector('input'),policy:()=>policy};
}
for(const language of ['en','fr'])test('switch saves consent only; OFF hides choices and preserves frequency '+language,async()=>{
 const f=await setup({language});assert.equal(f.input.getAttribute('role'),'switch');assert.equal(f.input.checked,false);assert.equal(f.calls.length,1);assert.equal(f.root.querySelector('[data-email-frequency-control]').hidden,true);
 f.input.checked=true;f.input.dispatchEvent(new Event('change'));await tick();assert.deepEqual(f.calls.at(-1)[1],{p_watch_id:id,p_mode:'daily_digest',p_enabled:true});assert.equal(f.root.querySelector('[data-email-frequency-control]').hidden,false);
 f.input.checked=false;f.input.dispatchEvent(new Event('change'));await tick();assert.equal(f.policy().enabled,false);assert.equal(f.policy().mode,'daily_digest');assert.equal(f.input.getAttribute('aria-checked'),'false');assert.equal(f.root.querySelector('[data-email-hint]').hidden,true);f.controller.destroy();
});
test('radio options use existing frequency RPC without granting consent or changing monitoring',async()=>{
 const f=await setup({enabled:true}),choice=f.root.querySelector('[data-email-mode="immediate"]');choice.checked=true;choice.dispatchEvent(new Event('change'));await tick();assert.deepEqual(f.calls.at(-1),['set_media_watch_email_policy',{p_watch_id:id,p_mode:'immediate',p_enabled:true}]);assert(f.calls.every(([name])=>!name.includes('monitoring')));assert.equal(f.input.checked,true);assert.equal(choice.checked,true);f.controller.destroy();
});
test('failed saves restore the confirmed switch and frequency',async()=>{
 const f=await setup({enabled:false,mode:'immediate',fail:true});f.input.checked=true;f.input.dispatchEvent(new Event('change'));await tick();assert.equal(f.input.checked,false);assert.equal(f.policy().mode,'immediate');assert.equal(f.root.querySelector('[data-email-frequency-control]').hidden,true);assert.equal(f.root.querySelector('[role="status"]').textContent,copies.en.detail.emailSaveFailed);f.controller.destroy();
});
test('pause and delete retain original handlers and confirmation; readonly restriction remains',async()=>{
 const source=await readFile(new URL('./navigation.js',import.meta.url),'utf8');
 assert.match(source,/deleteEl\.onclick = \(\) => \{\s*deleteDialogEl\.showModal\(\)/);
 assert.match(source,/deleteConfirmEl\.onclick = async \(event\)[\s\S]*?deleteServerCompanyWatch\(watch\.id\)[\s\S]*?deleteWatch\(watch\.id\)/);
 assert.match(source,/deleteEl\.disabled=Boolean\(watch\.serverReadOnly\)/);
 assert.match(source,/pauseResumeEl\.onclick = isPaused[\s\S]*?resumeWatch/);
 const{document}=parseHTML(html);assert(document.getElementById('watchPauseResume'));assert(document.getElementById('watchDeleteCancel'));assert(document.getElementById('watchDeleteConfirm'));assert(document.querySelector('#watchManagement #structured-monitoring'));assert(document.getElementById('watchDelete').compareDocumentPosition(document.getElementById('watchPauseResume'))&2);
});

test('settings remain expanded with a focusable heading and the original scrolling anchor',async()=>{
 const {document}=parseHTML(html),section=document.getElementById('watchManagement');
 assert.equal(section.tagName,'SECTION');assert.equal(section.querySelector('summary'),null);assert.equal(section.hidden,false);
 assert.equal(document.getElementById('manageWatchTitle').tagName,'H2');assert.equal(document.getElementById('manageWatchTitle').getAttribute('tabindex'),'-1');
 assert.equal(document.querySelector('[data-watch-settings-link]').getAttribute('href'),'#watchManagement');
 const source=await readFile(new URL('./watch-detail-overview.js',import.meta.url),'utf8');
 assert(source.includes("document.getElementById('manageWatchTitle')?.focus({preventScroll:true})"));assert(!source.includes('settings.open=true'));
});

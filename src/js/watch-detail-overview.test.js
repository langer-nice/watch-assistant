import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {detailUxFixtures} from './test-support/watch-detail-ux-fixtures.js';
import {watchOperationalState,detailDevelopmentItems,renderWatchOverview,renderLatestDevelopments} from './watch-detail-overview.js';
import {getWatchTimelineEvents} from './watch-timeline.js';
const html=await readFile(new URL('../../watch-detail.html',import.meta.url),'utf8');
const dictionaries=Object.fromEntries(await Promise.all(['fr','en'].map(async lang=>[lang,JSON.parse(await readFile(new URL('../locales/'+lang+'.json',import.meta.url),'utf8'))])));
const translate=lang=>(key,values={})=>{let text=key.split('.').reduce((o,k)=>o?.[k],dictionaries[lang]);assert.equal(typeof text,'string',key);for(const [k,v]of Object.entries(values))text=text.replaceAll('{'+k+'}',v);return text;};
test('Royal Caribbean, Limoges, Real Madrid and GBP/EUR retain their source facts in FR and EN',()=>{
 for(const language of ['fr','en'])for(const watch of detailUxFixtures){
  const before=structuredClone(watch),{document}=parseHTML(html),t=translate(language);
  renderWatchOverview({document,watch,t,language,formatTimestamp:value=>value});
  renderLatestDevelopments({document,watch,t,language,formatTimestamp:value=>value,sanitizeUrl:value=>value?.startsWith('https://')?value:''});
  assert.equal(document.getElementById('watchOverview').hidden,false);
  assert.equal(document.getElementById('watchNextCheck').textContent,t('detail.nextCheckUnavailable'));
  assert.equal(document.getElementById('watchEmailSummary').textContent,t('detail.emailStatusUnavailable'));
  if(watch.inputType==='url')assert.match(document.getElementById('watchLatestDevelopmentsBody').textContent,language==='fr'?/Un suspect a été interpellé/:/A suspect was arrested/);
  if(watch.title==='Real Madrid')assert.equal(detailDevelopmentItems(watch)[0].id,'new');
  if(watch.currencyCriteria){assert.equal(document.getElementById('watchLatestDevelopments').hidden,true);assert.equal(document.getElementById('watchBriefing').open,true);assert(document.getElementById('watchCurrencyPolicySummary').textContent);}
  else{assert(document.getElementById('watchLatestDevelopmentsBody').textContent.includes(watch.updates[0].sourceTitle));assert(document.querySelector('#watchLatestDevelopmentsBody a[rel="noopener noreferrer"]'));}
  assert.equal(getWatchTimelineEvents(watch).slice().reverse().at(-1).type,'created');
  assert.deepEqual(watch,before);
 }
});
test('health distinguishes quiet active, awaiting, paused, real failure and unavailable persistence',()=>{
 const active=detailUxFixtures[2];assert.equal(watchOperationalState(active),'active');
 assert.equal(watchOperationalState({...active,lastChecked:null}),'awaiting');
 assert.equal(watchOperationalState({...active,status:'paused'}),'paused');
 assert.equal(watchOperationalState({...active,lastCheckAttempt:{status:'failed',attemptedAt:active.lastChecked}}),'failed');
 assert.equal(watchOperationalState({...active,monitoringAvailability:'pending'}),'attention');
});
test('email consent OFF wins over daily frequency; unknown schedule is never fabricated',()=>{
 const {document}=parseHTML(html),t=translate('en'),watch=detailUxFixtures[2],email=document.getElementById('email-notifications');
 email.hidden=false;const input=email.querySelector('input');input.disabled=false;input.checked=false;
 renderWatchOverview({document,watch,t,language:'en',formatTimestamp:v=>v,digestAt0815:true});
 assert.equal(document.getElementById('watchEmailSummary').textContent,t('detail.emailOff'));
 input.checked=true;email.querySelector('[data-email-frequency-control]').hidden=false;const select=email.querySelector('select');Object.defineProperty(select,'value',{value:'daily_digest'});
 renderWatchOverview({document,watch,t,language:'en',formatTimestamp:v=>v,digestAt0815:true});assert.equal(document.getElementById('watchEmailSummary').textContent,t('detail.dailyEmail0815'));
});

import {monitoringUnavailable} from './report-status.js';
import {getWatchUpdates} from './watch-updates.js';
import {extractStoryDevelopmentFrames} from './story-development-frames.js';
import {contentFingerprint} from './structured-fingerprint.js';
import {currencyCriteriaFor,currencyPolicyFor} from './currency-watch.js';
import {currencyPolicyCopy} from './currency-policy-control.js';

const usable=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export const watchOperationalState=watch=>{
 if(!watch)return 'unavailable';
 if(watch.status==='paused'||watch.monitoringState==='paused')return 'paused';
 if(monitoringUnavailable(watch)||watch.structuredExecutionDisabled||watch.attentionReason||watch.monitoringIssueReason||watch.monitoringState==='needs-attention'||watch.actionRequired||watch.requiresAttention)return 'attention';
 const failed=watch.lastCheckAttempt?.status==='failed'&&(!usable(watch.lastChecked)||!usable(watch.lastCheckAttempt.attemptedAt)||Date.parse(watch.lastCheckAttempt.attemptedAt)>=Date.parse(watch.lastChecked));
 if(failed)return 'failed';
 if(!usable(watch.lastChecked))return 'awaiting';
 return watch.monitoringState==='monitoring'?'active':'unconfirmed';
};
export const detailDevelopmentItems=watch=>getWatchUpdates(watch).slice().sort((a,b)=>(Date.parse(b.timestamp)||0)-(Date.parse(a.timestamp)||0));
export const detailStoryFrames=watch=>{
 if(watch?.inputType!=='url'||!watch.storyProfile)return [];
 const updates=detailDevelopmentItems(watch);
 const articles=updates.map(u=>({id:u.id,article:{title:u.sourceTitle,summary:u.summary,url:u.sourceUrl,publishedAt:u.publishedAt,source:u.sourceName||u.sourceDomain}}));
 // Existing baseline prevents presenting an already known event as a development.
 return extractStoryDevelopmentFrames({story:watch,articles,knownArticles:watch.initialContext?.items||[],hash:contentFingerprint});
};
let emailObserver;
export const renderWatchOverview=({document,watch,t,formatTimestamp,language,digestAt0815=false})=>{
 const root=document.querySelector('#watchOverview');if(!root)return;
 root.hidden=!watch;
 emailObserver?.disconnect();
 if(!watch)return;
 const text=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
 const state=watchOperationalState(watch);
 text('watchMonitoringHealth',t('detail.monitoringStates.'+state));
 document.getElementById('watchMonitoringHealth').dataset.state=state;
 const paused=state==='paused';
 const next=watch.monitoringSchedule?.nextDueAt||watch.nextCheckAt;
 document.getElementById('watchNextCheck').parentElement.hidden=!paused&&!usable(next);
 text('watchNextCheck',paused?t('detail.nextCheckPaused'):usable(next)?formatTimestamp(next):t('detail.nextCheckUnavailable'));
 const interval=watch.monitoringSchedule?.intervalSeconds||watch.monitoringIntervalSeconds;
 document.getElementById('watchCheckFrequency').parentElement.hidden=!(Number.isInteger(interval)&&interval>0);
 text('watchCheckFrequency',interval===86400?t('detail.frequencyDaily'):Number.isInteger(interval)&&interval>0?t('detail.frequencyHours',{count:interval/3600}):t('detail.frequencyUnavailable'));
 const currency=document.getElementById('watchCurrencyPolicySummary');
 if(currency){currency.parentElement.hidden=!currencyCriteriaFor(watch);currency.textContent=currencyPolicyCopy[language==='fr'?'fr':'en'][currencyPolicyFor(watch)]||'';}
 const email=document.querySelector('#email-notifications');
 const refreshEmail=()=>{
  const input=email?.querySelector('input'),frequency=email?.querySelector('[data-email-frequency]');
  const ready=email&&!email.hidden&&input&&!input.disabled&&email.getAttribute('aria-busy')!=='true';
  const value=!ready?t('detail.emailStatusUnavailable'):!input.checked?t('detail.emailOff'):frequency&&!frequency.closest('[hidden]')?t(frequency.value==='daily_digest'&&digestAt0815?'detail.dailyEmail0815':frequency.value==='daily_digest'?'detail.emailFrequencyDaily':frequency.value==='immediate'?'detail.emailFrequencyImmediate':'detail.emailOff'):t('detail.emailOn');
  text('watchEmailSummary',value);
 };
 refreshEmail();
 if(email&&typeof MutationObserver!=='undefined'){emailObserver=new MutationObserver(refreshEmail);emailObserver.observe(email,{subtree:true,childList:true,characterData:true,attributes:true});}
 const notice=document.getElementById('watchMediaPersistenceNotice'),settingsAnchor=document.getElementById('watchCurrencyPolicyAnchor');
 if(notice&&settingsAnchor)settingsAnchor.insertAdjacentElement('afterend',notice);
 const settingsLink=document.querySelector('[data-watch-settings-link]');
 if(settingsLink)settingsLink.onclick=()=>{const settings=document.getElementById('watchManagement');settings.open=true;settings.querySelector('summary')?.focus();};
 const initial=document.getElementById('watchInitialContext'),disclosure=document.getElementById('watchInitialContextDisclosure');
 if(disclosure)disclosure.hidden=!initial||initial.hidden;
 const briefing=document.getElementById('watchBriefing');
 // Preserve the currency threshold/current rate panel in full view.
 if(briefing&&briefing.dataset.watchId!==watch.id){briefing.open=Boolean(currencyCriteriaFor(watch));briefing.dataset.watchId=watch.id;}
};
export const renderLatestDevelopments=({document,watch,t,formatTimestamp,language,sanitizeUrl})=>{
 const section=document.getElementById('watchLatestDevelopments'),body=document.getElementById('watchLatestDevelopmentsBody');
 if(!section||!body)return;
 section.hidden=!watch||Boolean(currencyCriteriaFor(watch));if(section.hidden)return;
 const next=body.cloneNode(false);
 const add=(tag,text,parent=next)=>{const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;};
 const updates=detailDevelopmentItems(watch),frames=detailStoryFrames(watch);
 const metadata=(item,parent)=>{
  const published=item.publishedAt&&usable(item.publishedAt)?t('detail.publishedDate',{date:formatTimestamp(item.publishedAt)}):'';
  const detected=item.timestamp&&usable(item.timestamp)?t('detail.detectedDate',{date:formatTimestamp(item.timestamp)}):'';
  add('p',[item.sourceName||item.sourceDomain||item.source,published,detected].filter(Boolean).join(' · '),parent).className='monitoring-update__metadata';
 };
 const article=(item,parent)=>{
  const url=sanitizeUrl(item.sourceUrl||item.url);if(!url)return;
  const link=add('a',t('detail.openArticle')+' ↗',parent);link.href=url;link.target='_blank';link.rel='noopener noreferrer';
 };
 for(const frame of frames){
  const card=add('article','');card.className='detail-development';
  add('h3',language==='fr'?frame.fr:frame.en,card);
  for(const source of frame.sources){
   add('p',source.quote,card);
   metadata({...source,timestamp:updates.find(u=>u.id===source.id)?.timestamp},card);
   article(source,card);
  }
 }
 const list=add('ul','');list.className='detail-development-list';
 for(const item of updates.slice(0,3)){
  const card=add('li','',list);card.className='detail-development';
  const title=item.sourceTitle||item.summary||t('detail.untitledItem');
  add('h3',title,card);
  const same=(a,b)=>String(a||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()===String(b||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  if(item.summary&&!same(title,item.summary))add('p',item.summary,card);
  metadata(item,card);article(item,card);
 }
 if(!updates.length)add('p',t(watch.lastChecked?'detail.developmentsEmpty':'detail.developmentsAwaiting'));
 if(updates.length){const link=add('a',t('detail.viewFullHistory'));link.href='#watchMonitoringUpdates';}
 if(!body.isEqualNode(next))body.replaceChildren(...next.childNodes);
};

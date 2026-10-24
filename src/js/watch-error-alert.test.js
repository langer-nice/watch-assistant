import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {getMonitoringFailureMessageKey} from './watch-monitoring-errors.js';
const navigation=readFileSync(new URL('./navigation.js',import.meta.url),'utf8');

test('only the Company persistence error gains the shared alert; FR/EN copy and Check now stay intact',()=>{
 const start=navigation.indexOf('    if (lastAttemptFailed) {',navigation.indexOf('const checkResultsEl='));
 const end=navigation.indexOf('    } else if (watch.currencyEvaluation',start);
 const render=new Function('checkFeedbackEl','watch','t','getMonitoringFailureMessageKey','isCompanyWatch','lastAttemptFailed',navigation.slice(start,end)+'    }');
 const reset=navigation.match(/  checkFeedbackEl\?\.classList\.remove\('is-action', 'watch-error-alert'\);/)[0];
 for(const language of ['en','fr']){
  const dictionary=JSON.parse(readFileSync(new URL('../locales/'+language+'.json',import.meta.url),'utf8'));
  const t=key=>key.split('.').reduce((node,key)=>node[key],dictionary);
  const {document}=parseHTML('<div><button>Check now</button><p hidden></p></div>');
  const feedback=document.querySelector('p'),button=document.querySelector('button'),before=button.outerHTML;
  for(const company of [true,false]){
   render(feedback,{lastCheckAttempt:{code:'PERSISTENCE_UNAVAILABLE'}},t,getMonitoringFailureMessageKey,()=>company,true);
   assert.equal(feedback.classList.contains('watch-error-alert'),company);
   assert.equal(feedback.textContent,t('detail.checkFailedStatus')+' — '+t('detail.checkFailure.persistence'));
   if(language==='en')assert.ok(feedback.textContent.endsWith('Try again.'));
   assert.equal(feedback.hidden,false);
   assert.equal(button.outerHTML,before);
   new Function('checkFeedbackEl',reset)(feedback);
   assert.equal(feedback.classList.contains('watch-error-alert'),false);
  }
 }
});

test('both targeted alerts share one pale-red container and decorative circle/cross style',()=>{
 const styles=readFileSync(new URL('../scss/pages/_watch-detail.scss',import.meta.url),'utf8');
 const shared=styles.slice(styles.indexOf('// Shared presentation'),styles.indexOf('.detail-overview #watchFeedBaselineNotice'));
 assert.match(shared,/\.watch-fact-check__feedback\.watch-error-alert:not\(\[hidden\]\)/);
 assert.match(shared,/#watchLoadNotice > p\.watch-error-alert/);
 for(const rule of ['border: 1px solid #ffe0e0','background: #fff1f1','color: #b91c33','border-radius: var(--radius-input)',"content: ''",'border-radius: 50%',"stroke='white'"])assert.ok(shared.includes(rule),rule);
});

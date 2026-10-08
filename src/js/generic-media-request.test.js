import test from 'node:test';
import assert from 'node:assert/strict';
import { planMediaQuery, validateMediaQuery } from './media-provider-query.js';
import { planLocalMediaRecovery } from './local-media-recovery.js';
import { selectHomeReport } from './home-report.js';
import { getCanonicalWatchClassification } from './report-status.js';

test('bounded FR/EN topic requests preserve topic, constraints and edition', () => {
  for (const [request,topic] of [
    ['Monitoring French students protests.', 'French students protests'],
    ['Follow news about French students protests.', 'French students protests'],
    ['Surveille les manifestations étudiantes françaises.', 'les manifestations étudiantes françaises'],
    ['Suivre les élections européennes.', 'les élections européennes'],
  ]) {
    const plan = planMediaQuery(request);
    assert.equal(plan.monitoringSource.query, topic);
    validateMediaQuery({ inputType:'text',request,mediaMention:plan.mediaMention },plan.monitoringSource);
  }
  const plan=planMediaQuery('Monitoring French students protests excluding violence in French in France');
  assert.equal(plan.monitoringSource.query,'French students protests -"violence"');
  assert.deepEqual(plan.mediaMention.locale,{country:'FR',language:'fr'});
});
test('ambiguous and operational requests never silently become news',()=>{
  for(const request of ['Monitor Apple','Monitoring my parcel','Monitor election ticket prices','Track protests every hour','Surveille le prix des manifestations','Monitoring protests below 100 people','Find me an apartment','Track French students protests only in Spanish']) assert.throws(()=>planMediaQuery(request),{code:'MEDIA_QUERY_REVIEW_REQUIRED'},request);
});
test('legacy proposal retains identity, request, creation, local baseline and immutable history',()=>{
 const watch={id:'41000000-0000-4000-8000-000000000001',inputType:'text',title:'Synthetic legacy',category:'general',request:'Monitoring French students protests.',createdAt:'2026-09-01T10:00:00Z',monitoringSnapshot:{checkedAt:'2026-09-02T10:00:00Z',items:[{id:'old'}]},updates:[{id:'old',timestamp:'2026-09-02T10:01:00Z'}],seenMonitoringItemIds:['old']};
 const before=structuredClone(watch),next=planLocalMediaRecovery(watch);
 assert.deepEqual(watch,before);assert.equal(next.id,watch.id);assert.equal(next.request,watch.request);assert.equal(next.createdAt,watch.createdAt);
 assert.deepEqual(next.monitoringSnapshot,watch.monitoringSnapshot);assert.deepEqual(next.localRecoveryHistory.updates,watch.updates);assert.equal(next.monitoringSource.query,'French students protests');
 assert.throws(()=>planLocalMediaRecovery({...watch,mediaPersistence:{ownerId:'other'}}));
 assert.throws(()=>planLocalMediaRecovery({...watch,request:'Monitor my parcel'}));
});
test('pending, failed and unsupported Watches surface on Home without invented checks or retention changes',()=>{
 for(const status of ['pending','failed','unsupported','local-only','loading','conflict']) {
 const watch={id:'legacy',title:'Synthetic Watch',status:'watching',createdAt:'2026-01-01T00:00:00Z',monitoringAvailability:status};
 const report={completedAt:'2026-10-05T15:07:00Z',entries:[{watchId:'legacy',classification:'watching',title:watch.title}],attempts:[{watchId:'legacy',status:'succeeded'}]};
 const before=structuredClone(report);const view=selectHomeReport({report,watches:[watch]});
 assert.equal(getCanonicalWatchClassification(watch),'attention');assert.equal(view.attentionWatches.length,1);assert.equal(view.quietWatches.length,0);assert.equal(view.totalChecked,0);assert.deepEqual(report,before);
 }
});

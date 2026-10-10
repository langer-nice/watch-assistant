import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMediaWatchMiddleware } from '../../server/media-watch-api.js';
import { runMediaMonitoring } from '../../server/media-monitoring-cron.js';
import { mediaArticleIdentityKeys } from '../../server/media-article-identity.js';
import { planMediaQuery } from '../../src/js/media-provider-query.js';
import { mediaWatchDefinition } from '../../src/js/media-watch-definition.js';

// Deterministic provider fixtures, usable with PGlite or an explicitly isolated
// staging client. Never processes another Watch or any notification queue.
export async function exerciseMediaQueryRecovery({ service, clientA, clientB, userA, userB, legacyInitialContext = false, inspectLedger = true, afterBaseline }) {
  const id = randomUUID();
  const request = 'Dis-moi quand Ed Sheeran est mentionné dans les médias';
  const planned = planMediaQuery(request, { language: 'fr' });
  const legacySource = { ...planned.monitoringSource, query: 'Dis-moi quand Ed Sheeran est mentionné dans le média' };
  const legacyUrl = new URL(legacySource.url); legacyUrl.searchParams.set('q', legacySource.query); legacySource.url = legacyUrl.href;
  const definition = { inputType: 'text', request, category: 'news', mediaMention: planned.mediaMention };
  const rpc = async (client, name, params) => { const r = await client.rpc(name, params); assert.ifError(r.error); return r.data; };
  const rows = async (table, owner = service) => { const r = await owner.from(table).select('*').eq(table === 'watches' ? 'id' : 'watch_id', id).range(0, 99); assert.ifError(r.error); return r.data; };
  const state = async () => ({ row: (await rows('watches'))[0], snapshot: (await rows('media_watch_snapshots'))[0], seen: inspectLedger ? (await rows('media_watch_seen_articles')).map(x => x.article_key).sort() : null, notifications: await rows('media_watch_notifications') });
  const persist = async (source, rev) => rpc(clientA, 'persist_media_watch', {p_id:id,p_title:'SYNTHETIC media query recovery',p_source:source,p_definition:definition,p_state:'monitoring',p_revision:rev,p_mutation:randomUUID(),p_deleted:false});
  let row = await persist(legacySource, 0); // Deliberately reproduce old persisted data, bypassing the new API guard.
  const item = (name, publishedAt = '2026-10-01T18:00:00Z', url = `https://fixture.example/${name}`) => ({id:name,title:`Ed Sheeran ${name}`,url,publishedAt,excerpt:'Deterministic test article'});
  const old = item('baseline', '2025-01-01T12:00:00Z');
  let tick = 0;
  const seed = async items => {
    const prior = (await state()).snapshot;
    const normalized = items.map(x => ({...x,identityKeys:mediaArticleIdentityKeys(x)}));
    return rpc(service, 'complete_manual_media_watch_check', {p_watch_id:id,p_user_id:userA,p_expected_revision:row.media_revision,
      p_checked_at:`2026-09-30T06:${String(35 + tick++).padStart(2,'0')}:00Z`,p_source_title:'Synthetic fixture',p_source_url:row.monitoring_source.url,
      p_item_ids:normalized.map(x=>x.id),p_items:normalized,p_expected_checked_at:prior?.checked_at||null,p_expected_items:prior?.items||null,p_notification_items:normalized});
  };
  assert.equal((await seed([old])).outcome,'baseline');
  // Mimic pre-PR50 rows only in the explicitly created fixture, if supported.
  if (afterBaseline) await afterBaseline(id);
  else if (legacyInitialContext) { const r=await service.from('media_watch_snapshots').update({initial_items:null}).eq('watch_id',id); assert.ifError(r.error); }
  assert.equal((await seed([old,item('existing-event','2026-09-30T06:36:00Z')])).outcome,'matching-items');
  const before = await state();
  let items = [old]; let fail = false; let fetches = 0;
  const fetchFeed = async () => { fetches++; if (fail) throw Object.assign(new Error('Fixture timeout'),{code:'TIMEOUT'}); return {checkedAt:`2026-10-05T16:${String(tick++).padStart(2,'0')}:00Z`,items,source:{url:planned.monitoringSource.url,title:'Fixture'}}; };
  const middleware = createMediaWatchMiddleware({ serviceClient:service,env:{MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false'},fetchFeed,
    authenticate: async req => req.headers.authorization === 'fixture-B' ? {user:{id:userB},client:clientB} : {user:{id:userA},client:clientA} });
  const call = async (method, body, account = 'fixture-A', check = false) => {
    let status, data;
    await middleware({url:`/api/media-watches${check?'?action=check':''}`,method,body,headers:{authorization:account}}, {setHeader(){},set statusCode(v){status=v;},end(v){data=JSON.parse(v);}});
    return {status,data};
  };
  const check = async (account = 'fixture-A') => call('POST',{id,revision:row.media_revision},account,true);
  assert.equal((await check()).data.code,'MEDIA_QUERY_REVIEW_REQUIRED'); assert.equal(fetches,0);
  const legacyDefinition = mediaWatchDefinition({id,title:row.title,...definition,monitoringSource:legacySource});
  const unchanged = await call('POST',{definition:legacyDefinition,revision:row.media_revision,mutation:randomUUID(),deleted:false});
  assert.equal(unchanged.status,200); row=unchanged.data.watch;
  const staleEdit = await call('POST',{definition:{...legacyDefinition,watch_definition:{...definition,request:'Tell me when Bono is mentioned in the media',mediaMention:{subjects:['Bono'],matchMode:'all'}}},revision:row.media_revision,mutation:randomUUID(),deleted:false});
  assert.equal(staleEdit.status,422);
  const repairedDefinition = mediaWatchDefinition({id,title:row.title,...definition,monitoringSource:planned.monitoringSource});
  const save = await call('POST',{definition:repairedDefinition,revision:row.media_revision,mutation:randomUUID(),deleted:false});
  assert.equal(save.status,200); row=save.data.watch;
  const repaired=await state();
  assert.equal(row.media_revision, before.row.media_revision+2);
  assert.deepEqual(repaired.snapshot,before.snapshot); assert.deepEqual(repaired.seen,before.seen);
  assert.deepEqual(repaired.notifications,before.notifications);
  for (const key of ['last_checked_at','last_change_item_id','media_last_change_detected_at','last_change_published_at']) assert.equal(key.endsWith('_at') ? Date.parse(row[key]) : row[key], key.endsWith('_at') ? Date.parse(before.row[key]) : before.row[key]);
  assert.equal(row.watch_definition.request,request);
  assert.equal((await check()).data.outcome,'no-new-items'); // Baseline identity still known after repair.
  // Scoped scheduled pipeline: global queue maintenance is deliberately skipped.
  const scopedService = { from: table => { assert.equal(table,'watches'); return { select:fields => service.from(table).select(fields).eq('id',id) }; },
    rpc:(name,params)=>name==='maintain_media_watch_notifications' ? Promise.resolve({data:null,error:null}) : service.rpc(name,params) };
  const scheduled = () => runMediaMonitoring({client:scopedService,env:{MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false'},fetchFeed,notificationProcessor:async()=>({status:'disabled'})});
  items=[old,item('later')]; assert.equal((await scheduled()).changedCount,1);
  const later=await state(); assert.equal(later.row.last_check_outcome,'matching-items');
  const detectedAt=later.row.media_last_change_detected_at;
  items=[{...item('later'),id:'alternate-guid',url:'https://fixture.example/later?utm_source=another'},old];
  assert.equal((await scheduled()).changedCount,0);
  assert.deepEqual((await state()).row.media_last_change_detected_at,detectedAt);
  items=[item('pre-baseline-scheduled','2025-01-02T12:00:00Z')]; assert.equal((await scheduled()).changedCount,0);
  // Manual path deliberately has no date cutoff, using a distinct unseen fixture.
  items=[item('pre-baseline-manual','2025-01-03T12:00:00Z')]; assert.equal((await check()).data.outcome,'matching-items');
  const successful=await state(); fail=true;
  assert.equal((await check()).data.code,'TIMEOUT'); assert.equal((await scheduled()).failedCount,1);
  const failed=await state(); assert.deepEqual(failed.snapshot,successful.snapshot); assert.deepEqual(failed.row.last_checked_at,successful.row.last_checked_at);
  assert.equal(failed.row.last_check_error_code,'TIMEOUT'); assert.equal(failed.row.last_change_item_id,successful.row.last_change_item_id);
  const reload=await call('GET'); const restored=reload.data.watches.find(x=>x.id===id);
  assert.equal(restored.monitoring_source.query,'Ed Sheeran'); assert.equal(Date.parse((Array.isArray(restored.media_watch_snapshots) ? restored.media_watch_snapshots[0] : restored.media_watch_snapshots).baseline_at),Date.parse(before.snapshot.baseline_at));
  assert.equal((await check('fixture-B')).status,404);
  assert.equal((await call('GET',undefined,'fixture-B')).data.watches.some(x=>x.id===id),false);
  assert.equal((await call('POST',{definition:repairedDefinition,revision:row.media_revision,mutation:randomUUID(),deleted:false},'fixture-B')).status,409);
  assert.equal((await rows('watches',clientB)).length,0);
  assert.equal((await rows('media_watch_notifications')).length,0);
  return {watchId:id,baseline:before.snapshot.baseline_at,initialContext:legacyInitialContext?'legacy-null':'retained',query:row.monitoring_source.query,revision:row.media_revision,historyPreserved:true,distinctUpdate:true,equivalentUrlDeduplicated:true,scheduledCutoff:true,manualNoCutoff:true,providerFailurePreserved:true,reload:true,crossAccountBlocked:true,monitoringEmailsSent:0};
}

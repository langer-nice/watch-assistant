import assert from 'node:assert/strict'; import test from 'node:test'; import { runMediaMonitoring } from './media-monitoring-cron.js';
const item=(id,title=id)=>({id,title,url:`https://news.example/${id}`,publishedAt:'2026-09-13T00:00:00Z',source:'News',excerpt:'Summary'});
const watch=(snapshot=null)=>({id:'w1',title:'Elon Musk',type:'media_news',monitoring_state:'monitoring',deleted_at:null,current_status:'watching',monitoring_source:{type:'rss',url:'https://feed.example/rss'},watch_definition:{inputType:'text',mediaMention:{subjects:['Elon Musk'],matchMode:'all'}},media_watch_snapshots:snapshot?[snapshot]:[]});
const clientFor=(rows,rpc=async()=>({data:'unchanged',error:null}))=>({from(){const b={select(){return b},eq(){return b},is(){return b},order(){return b},range(){return Promise.resolve({data:rows,error:null})}};return b},rpc});
const feed=(items)=>({checkedAt:'2026-09-13T06:00:00Z',source:{title:'Google News',url:'https://feed.example/rss'},items});
const disabled={MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false'};
test('initial historical baseline, manual path, no-new and corrected records enqueue nothing',async()=>{let params; const c=clientFor([watch()],async(n,p)=>{params=p;return {data:'unchanged',error:null}}); await runMediaMonitoring({client:c,env:disabled,fetchFeed:async()=>feed([item('old','Elon Musk old')]),notificationProcessor:async()=>({status:'disabled'})}); assert.equal(params.p_outcome,'baseline');assert.deepEqual(params.p_notification_items,[]);assert.equal(params.p_enqueue_notifications,false); const manual=await import('../src/js/watch-monitoring.js'); assert.equal(String(manual.createWatchCheckController).includes('media-watch-notification'),false);});
test('matching candidates reach the durable SQL identity filter in deterministic feed order',async()=>{const old={checked_at:'2026-09-12T00:00:00Z',item_ids:['old'],items:[item('old','Elon Musk old')]};let params;const c=clientFor([watch(old)],async(n,p)=>{params=p;return {data:'changed',error:null}});const env={MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',VERCEL_ENV:'production',RESEND_API_KEY:'x',WATCH_EMAIL_FROM:'Watch <x@davidlangdesign.com>',WATCH_APP_BASE_URL:'https://watch.example'}; await runMediaMonitoring({client:c,env,fetchFeed:async()=>feed([item('new1','Elon Musk one'),item('new2','Elon Musk two'),item('old','Elon Musk old')]),notificationProcessor:async()=>({status:'success'})});assert.deepEqual(params.p_notification_items.map(x=>x.id),['new1','new2','old']);assert.equal(params.p_enqueue_notifications,true);});
test('failed watch does not stop another and stale database completion is skipped',async()=>{const rows=[watch(),{...watch(),id:'w2',monitoring_source:{url:'https://feed.example/two'}}];let calls=0;const c=clientFor(rows,async()=>({data:++calls===1?'skipped':'unchanged',error:null}));const out=await runMediaMonitoring({client:c,env:disabled,fetchFeed:async(url)=>{if(url.endsWith('/rss'))throw new Error('failed');return feed([])},notificationProcessor:async()=>({status:'disabled'})});assert.equal(out.failedCount,1);assert.equal(out.unchangedCount + out.skippedCount,1);});

test('media stage clamps its batch and terminates when a feed never responds',async()=>{
 const c=clientFor([watch()]);const start=Date.now();
 const out=await runMediaMonitoring({client:c,env:disabled,maxRunMs:25,fetchFeed:async()=>new Promise(()=>{}),notificationProcessor:async()=>({status:'disabled'})});
 assert.ok(Date.now()-start<1000);assert.equal(out.failedCount,1);assert.equal(out.deadlineReached,true);
 await assert.rejects(runMediaMonitoring({client:c,pageSize:0}),/Invalid media batch/);
});

test('media pagination processes at most fifty Watches with three concurrent source checks',async()=>{
 const rows=Array.from({length:75},(_,i)=>({...watch(),id:`watch-${i}`}));const ranges=[];let active=0;let peak=0;let checked=0;
 const c={from(){const b={select(){return b},eq(){return b},is(){return b},order(){return b},async range(start,end){ranges.push([start,end]);return{data:rows.slice(start,end+1),error:null}}};return b},rpc:async()=>({data:'unchanged',error:null})};
 const out=await runMediaMonitoring({client:c,pageSize:17,env:disabled,fetchFeed:async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;checked++;return feed([])},notificationProcessor:async()=>({status:'disabled'})});
 assert.deepEqual(ranges,[[0,16],[17,33],[34,49]]);assert.equal(checked,50);assert.equal(out.totalEligibleWatches,50);assert.ok(peak<=3);
});

test('invalid enabled email configuration preserves pending and newly eligible media work', async () => {
  const calls = [];
  const c = clientFor([watch({checked_at:'2026-09-12T00:00:00Z',item_ids:['old'],items:[item('old')]})], async (name, params) => {
    calls.push([name, params]); return { data: 'changed', error: null };
  });
  const result = await runMediaMonitoring({ client: c,
    env: { MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED: 'true', VERCEL_ENV: 'production' },
    fetchFeed: async () => feed([item('new', 'Elon Musk news')]) });
  assert.equal(calls[0][1].p_enabled, true);
  assert.equal(calls[1][1].p_enqueue_notifications, true);
  assert.equal(result.notifications.status, 'configuration-failed');
  assert.equal(result.notifications.claimedCount, 0);
});

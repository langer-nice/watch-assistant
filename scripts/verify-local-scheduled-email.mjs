// Explicit isolated integration harness. No deployment or application configuration changes.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createCompanyMonitoringCronHandler } from '../server/company-monitoring-cron.js';
import { fetchAndNormalizeFeed } from '../server/check-watch-api.js';
import { processCompanyWatchEmailNotifications } from '../server/company-watch-notifications.js';
import { processMediaWatchEmailNotifications } from '../server/media-watch-notifications.js';
import { sendWithResend } from '../server/company-watch-email.js';

const id='fe22544e-ec0a-412e-a134-22f824393824';
const local=parseEnv(await readFile(new URL('../.env',import.meta.url),'utf8'));
assert.equal(local.SUPABASE_URL,'http://127.0.0.1:54321');
assert.equal(local.VITE_SUPABASE_URL,local.SUPABASE_URL);
for(const flag of ['MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED','WATCH_EMAIL_NOTIFICATIONS_ENABLED'])assert.equal(local[flag],'false');
assert.ok(!process.env.VERCEL_ENV&&!process.env.RESEND_API_KEY&&!local.RESEND_API_KEY);
const status=JSON.parse(await readFile('/tmp/wa-local-status.json','utf8'));
assert.equal(status.API_URL,local.SUPABASE_URL);
const sql=q=>execFileSync('docker',['exec','supabase_db_wa-creation-auth-lab','psql','-U','postgres','-d','postgres','-XqAt','-v','ON_ERROR_STOP=1','-c',`begin read only; ${q}; commit;`],{encoding:'utf8'}).trim();
assert.equal(sql("select to_regclass('cron.job') is null"),'t');
const [captureContainer]=JSON.parse(execFileSync('docker',['inspect','supabase_inbucket_wa-creation-auth-lab'],{encoding:'utf8'}));
assert.ok(!captureContainer.Config.Env.some(x=>/^MP_SMTP_(RELAY|FORWARD)/.test(x)));
assert.ok(!JSON.stringify(captureContainer.Args).includes('relay'));
const nativeFetch=globalThis.fetch;
let fixtureOrigin;
// Every HTTP call from this process is restricted to exact loopback destinations.
const localFetch=(url,options)=>{
 const u=new URL(url instanceof Request?url.url:String(url));
 assert.ok([local.SUPABASE_URL,'http://127.0.0.1:54324',fixtureOrigin].includes(u.origin),'Remote network destination blocked');
 return nativeFetch(url,options);
};
globalThis.fetch=localFetch;
const raw=createClient(local.SUPABASE_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}});
const must=async query=>{const x=await query;assert.equal(x.error,null);return x.data;};
const before=await must(raw.from('watches').select('*,media_watch_snapshots(*)').eq('id',id).single());
const auth=await raw.auth.admin.getUserById(before.user_id);assert.equal(auth.error,null);assert.equal(auth.data.user.email,'david-supervised@example.test');assert.ok(auth.data.user.email_confirmed_at);
assert.equal(before.monitoring_state,'monitoring');
const snapshot=Array.isArray(before.media_watch_snapshots)?before.media_watch_snapshots[0]:before.media_watch_snapshots;
assert.ok(snapshot?.baseline_at&&snapshot.initial_items?.length&&snapshot.items?.length);
const baseIdentity=JSON.stringify([snapshot.baseline_at,snapshot.initial_items]);
const notificationRows=()=>must(raw.from('media_watch_notifications').select('*').eq('watch_id',id).order('created_at'));
assert.equal((await notificationRows()).length,0,'Use only the untouched baseline; do not rerun on an already exercised fixture');
assert.equal(sql(`select count(*) from public.media_watch_notifications where watch_id <> '${id}'`),'0');
assert.equal(sql('select count(*) from public.company_watch_notifications'),'0');
const unrelated=()=>sql(`select md5(coalesce(jsonb_agg(to_jsonb(w) order by id)::text,'')) from public.watches w where id <> '${id}'`);
const unrelatedBefore=unrelated();
const priorSeen=await must(raw.from('media_watch_seen_articles').select('*').eq('watch_id',id));
await writeFile('/tmp/wa-nvidia-scheduled-before.json',JSON.stringify({watch:before,seen:priorSeen},null,2),{mode:0o600});
// Apply the extra selector to real PostgREST queries, not a fabricated row set.
const client={from(table){const query=raw.from(table);return new Proxy(query,{get(target,key){if(key==='select')return (...args)=>{let selected=target.select(...args);if(table==='watches')selected=selected.eq('id',id);if(table==='media_watch_notifications')selected=selected.eq('watch_id',id);return selected;};const v=target[key];return typeof v==='function'?v.bind(target):v;}});},auth:raw.auth,rpc(name,args){if(args?.p_watch_id)assert.equal(args.p_watch_id,id);return raw.rpc(name,args);}};
const xml=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const article={id:`local-nvidia-${randomUUID()}`,url:`https://local-fixture.invalid/nvidia/${randomUUID()}`,title:'[SYNTHETIC LOCAL TEST] Nvidia scheduled notification',excerpt:'Synthetic Nvidia observation created only to verify the isolated monitoring and email chain.',source:'Local synthetic fixture',publishedAt:new Date().toISOString()};
assert.ok(Date.parse(article.publishedAt)>Date.parse(snapshot.baseline_at));
let includeNew=false,feedRequests=0,transportRequests=0;const accepted=new Map();let capturedId;
const rss=()=>`<?xml version="1.0"?><rss version="2.0"><channel><title>Local replay of existing Nvidia reference</title><link>https://local-fixture.invalid/</link>${[...(includeNew?[article]:[]),...snapshot.items].map(x=>`<item><guid isPermaLink="false">${xml(x.id)}</guid><link>${xml(x.url)}</link><title>${xml(x.title)}</title><description>${xml(x.excerpt)}</description><source>${xml(x.source)}</source><pubDate>${xml(new Date(x.publishedAt).toUTCString())}</pubDate></item>`).join('')}</channel></rss>`;
const bridge=createServer(async(req,res)=>{try{
 if(req.method==='GET'&&req.url==='/feed'){feedRequests++;res.setHeader('Content-Type','application/rss+xml');res.end(rss());return;}
 assert.equal(req.method,'POST');assert.equal(req.url,'/emails');assert.equal(req.headers.authorization,'Bearer local-capture-only');
 transportRequests++;let body='';for await(const chunk of req)body+=chunk;const message=JSON.parse(body);
 assert.deepEqual(message.to,['david-supervised@example.test']);const key=req.headers['idempotency-key'];assert.ok(key);
 let mid=accepted.get(key);if(!mid){
 const result=await localFetch('http://127.0.0.1:54324/api/v1/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({From:{Email:'watch@watch.davidlangdesign.com',Name:'Watch Assistant LOCAL TEST'},To:message.to.map(Email=>({Email})),Subject:message.subject,Text:message.text,HTML:message.html})});
 assert.equal(result.ok,true);const data=await result.json();mid=data.ID||data.id;assert.ok(mid,'Mailpit accepted message ID');accepted.set(key,mid);capturedId=mid;
 }
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:mid}));
 }catch{res.statusCode=500;res.end(JSON.stringify({error:'Local capture failed'}));}});
await new Promise(r=>bridge.listen(0,'127.0.0.1',r));fixtureOrigin=`http://127.0.0.1:${bridge.address().port}`;
const env={SUPABASE_URL:local.SUPABASE_URL,CRON_SECRET:randomUUID(),VERCEL_ENV:'production',NODE_ENV:'development',MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false',RESEND_API_KEY:'local-capture-only',WATCH_EMAIL_FROM:'Watch Assistant <watch@watch.davidlangdesign.com>',WATCH_APP_BASE_URL:'https://watch-assistant.local.test'};
// Exact production gates, in a private argument object only. No .env edits.
const sender=params=>sendWithResend(params,{fetchImpl:(url,options)=>{assert.equal(url,'https://api.resend.com/emails');return localFetch(fixtureOrigin+'/emails',options);}});
const fetchFeed=(url,options)=>{assert.equal(url,before.monitoring_source.url);return fetchAndNormalizeFeed(url,{...options,lookup:async()=>[{address:'93.184.216.34',family:4}],fetchImpl:()=>localFetch(fixtureOrigin+'/feed')});};
const notificationProcessor=args=>args.deadline?processMediaWatchEmailNotifications({...args,sender}):processCompanyWatchEmailNotifications(args);
const summaries=[];
const handler=createCompanyMonitoringCronHandler({env,clientFactory:()=>client,fetchFeed,fetchCompany:()=>{throw Error('Unrelated Company processing forbidden');},fetchCurrency:()=>{throw Error('Currency processing forbidden');},notificationProcessor,logger:{info(){},error(){}}});
const invoke=async(authorized=true)=>{let code,body;await handler({method:'GET',headers:{authorization:authorized?`Bearer ${env.CRON_SECRET}`:'Bearer invalid'}},{setHeader(){},set statusCode(v){code=v},end(s){body=JSON.parse(s);}});return{code,body};};
try{
 assert.equal((await invoke(false)).code,401);assert.equal(feedRequests,0);assert.equal(transportRequests,0);
 for(const phase of ['baseline-replay','one-new-synthetic','unchanged-repeat']){
  includeNew=phase!=='baseline-replay';const startTransport=transportRequests;const outcome=await invoke();
  assert.equal(outcome.code,200);assert.equal(outcome.body.totalEligibleWatches,0);assert.equal(outcome.body.media.totalEligibleWatches,1);assert.equal(outcome.body.media.failedCount,0);assert.equal(outcome.body.media.notifications.failedCount,0);
  const notifications=await notificationRows();const expected=phase==='baseline-replay'?0:1;
  assert.equal(notifications.length,expected);assert.equal(accepted.size,expected);assert.equal(transportRequests-startTransport,phase==='one-new-synthetic'?1:0);
  if(expected){assert.equal(notifications[0].status,'sent');assert.equal(notifications[0].user_id,before.user_id);assert.equal(notifications[0].provider_message_id,capturedId);}
  const current=await must(raw.from('media_watch_snapshots').select('*').eq('watch_id',id).single());assert.equal(JSON.stringify([current.baseline_at,current.initial_items]),baseIdentity);
  summaries.push({phase,at:new Date().toISOString(),media:outcome.body.media,notificationRows:notifications.length,capturedMonitoringEmails:accepted.size,additionalTransportRequests:transportRequests-startTransport});
 }
 const captured=await(await localFetch(`http://127.0.0.1:54324/api/v1/message/${capturedId}`)).json();
 for(const needle of [before.title,article.title,article.excerpt,article.source,article.url,id])assert.ok(captured.Text.includes(needle),`Missing expected email field: ${needle}`);
 assert.ok(captured.HTML.includes(article.title));assert.ok(captured.Text.includes('2026'));
 const after=await must(raw.from('watches').select('*').eq('id',id).single());assert.equal(after.user_id,before.user_id);assert.deepEqual(after.watch_definition,before.watch_definition);assert.deepEqual(after.monitoring_source,before.monitoring_source);assert.equal(after.media_revision,before.media_revision);assert.equal(unrelated(),unrelatedBefore);
 const evidence={testedRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),watchId:id,ownerVerified:true,baseline:snapshot.baseline_at,baselineItems:snapshot.items.length,baselinePreserved:true,unrelatedWatchesUnchanged:true,article,feedRequests,transportRequests,capturedId,summaries,notifications:await notificationRows()};
 await writeFile('/tmp/wa-nvidia-scheduled-result.json',JSON.stringify(evidence,null,2),{mode:0o600});
 console.log(JSON.stringify({watchId:id,baselinePreserved:true,unrelatedWatchesUnchanged:true,feedRequests,transportRequests,capturedId,summaries},null,2));
}finally{await new Promise(r=>bridge.close(r));globalThis.fetch=nativeFetch;}

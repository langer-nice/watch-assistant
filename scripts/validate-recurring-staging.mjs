// Explicit opt-in: real staging only. Never reads browser tokens or sends mail.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { normalizeCurrencyWatch, parseCurrencyRequest } from '../src/js/currency-watch.js';
import { mediaWatchDefinition } from '../src/js/media-watch-definition.js';
import { runMediaMonitoring } from '../server/media-monitoring-cron.js';
const env=parseEnv(await readFile(process.argv[2],'utf8'));
const ref='tseexvbwhrtofcsrvcqc';
assert.equal(env.SUPABASE_URL,`https://${ref}.supabase.co`);
assert.equal(env.VITE_SUPABASE_URL,env.SUPABASE_URL);
for(const k of ['SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_ANON_KEY']) assert.equal(JSON.parse(Buffer.from(env[k].split('.')[1],'base64url')).ref,ref);
assert.equal(env.MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED,'false');
assert.equal(env.WATCH_EMAIL_NOTIFICATIONS_ENABLED,'false');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,options);
const ok=({data,error})=>{if(error) throw Error(`${error.code || 'ERROR'}: ${error.message}`);return data;};
const users=[]; const ids=[]; const evidence={project:ref,emailDelivery:'disabled',sequences:[]};
for(let i=0;i<2;i++){
 const email=`recurring-${randomUUID()}@example.test`; const password=randomBytes(32).toString('base64url');
 const user=ok(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{purpose:'recurring-alert-staging-validation'}})).user;
 const client=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,options);
 const session=ok(await client.auth.signInWithPassword({email,password})).session;
 users.push({id:user.id,client,session});
 await writeFile('/tmp/watch-recurring-staging/fixtures.json',JSON.stringify({users:users.map(({id,session})=>({id,session})),watchIds:ids}),{mode:0o600});
}
for(const [policy,rates,expected] of [
 ['crossing',['1.16','1.17','1.18','1.16','1.19'],[0,1,0,0,1]],
 ['daily',['1.17','1.18','1.18','1.16','1.19'],[1,1,0,0,1]],
]){
 const watch=normalizeCurrencyWatch({id:randomUUID(),title:`Synthetic staging ${policy}`,inputType:'text',request:'The pound reaches 1.17 to the euro',status:'watching',currencyPolicy:policy});
 const def=mediaWatchDefinition(watch); ids.push(watch.id);
 await writeFile('/tmp/watch-recurring-staging/fixtures.json',JSON.stringify({users:users.map(({id,session})=>({id,session})),watchIds:ids}),{mode:0o600});
 ok(await users[0].client.rpc('persist_media_watch',{p_id:watch.id,p_title:def.title,p_source:def.monitoring_source,p_definition:def.watch_definition,p_state:'monitoring',p_revision:0,p_mutation:randomUUID(),p_deleted:false}));
 const scoped={from:table=>({select:fields=>service.from(table).select(fields).eq(table==='watches'?'id':'watch_id',watch.id)}),rpc:(name,params)=>name==='maintain_media_watch_notifications'?Promise.resolve({data:null,error:null}):service.rpc(name,params)};
 const one=(day,rate,fail=false)=>runMediaMonitoring({client:scoped,env:{...env,VERCEL_ENV:'preview'},fetchCurrency:async request=>{
   if(fail) throw Error('deterministic provider failure');
   const date=`2026-09-${day}`; return {criteria:parseCurrencyRequest(request),checkedAt:`${date}T17:00:00Z`,observation:{base:'GBP',quote:'EUR',rate,date}};
 }});
 const results=[];
 for(const [i,rate] of rates.entries()){
   const r=await one(21+i,rate); assert.equal(r.failedCount,0);assert.equal(r.changedCount,expected[i]);results.push(r.changedCount);
   assert.equal((await one(21+i,rate)).changedCount,0);
 }
 assert.equal((await one(24,'1.16')).failedCount,1);
 assert.equal((await one(28,null,true)).failedCount,1);
 const read=()=>users[0].client.from('watches').select('*,media_watch_snapshots(*),currency_watch_events(*)').eq('id',watch.id).single();
 let row=ok(await read()); const events=row.currency_watch_events;
 assert.equal(events.length,expected.reduce((a,b)=>a+b,0)); assert.equal(row.currency_evaluation.providerRate,'1.19');
 const next=policy==='daily'?'crossing':'daily';
 ok(await users[0].client.rpc('persist_media_watch',{p_id:watch.id,p_title:row.title,p_source:row.monitoring_source,p_definition:{...row.watch_definition,currencyPolicy:next},p_state:'monitoring',p_revision:row.media_revision,p_mutation:randomUUID(),p_deleted:false}));
 assert.equal((await one(25,'1.19')).changedCount,0);
 row=ok(await read());assert.equal(row.watch_definition.currencyPolicy,next);assert.deepEqual(row.currency_watch_events,events);
 assert.equal(ok(await users[1].client.from('watches').select('id').eq('id',watch.id)).length,0);
 assert.equal(ok(await users[1].client.from('currency_watch_events').select('id').eq('watch_id',watch.id)).length,0);
 const attack=await users[1].client.rpc('persist_media_watch',{p_id:watch.id,p_title:'forbidden',p_source:row.monitoring_source,p_definition:row.watch_definition,p_state:'paused',p_revision:row.media_revision,p_mutation:randomUUID(),p_deleted:false});assert.ok(attack.error);
 assert.equal(ok(await service.from('media_watch_notifications').select('id').eq('watch_id',watch.id)).length,0);
 evidence.sequences.push({policy,expected,observed:results,eventCount:events.length,repeatedChecks:'silent',policyChange:'no replay',foreignRead:'empty',foreignWrite:'rejected',outboxCount:0});
}
// Private temporary session state is used only for the optional local browser harness.
await writeFile('/tmp/watch-recurring-staging/fixtures.json',JSON.stringify({users:users.map(({id,session})=>({id,session})),watchIds:ids}),{mode:0o600});
await writeFile('/tmp/watch-recurring-staging/evidence.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));

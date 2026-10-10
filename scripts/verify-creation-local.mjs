// Real Auth/API/RLS integration, explicitly separate from the documented UI run.
// Requires the dedicated local stack and app described in docs/creation-reliability.md.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { planMediaQuery } from '../src/js/media-provider-query.js';
import { mediaWatchDefinition } from '../src/js/media-watch-definition.js';
const e = parseEnv(await readFile(new URL('../.env',import.meta.url),'utf8'));
assert.equal(e.SUPABASE_URL,'http://127.0.0.1:54321');
assert.equal(e.VITE_SUPABASE_URL,e.SUPABASE_URL);
for(const key of ['MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED','WATCH_EMAIL_NOTIFICATIONS_ENABLED'])assert.equal(e[key],'false');
assert.equal(process.env.VERCEL_ENV,undefined);
const api='http://127.0.0.1:5199';
const sql=q=>execFileSync('docker',['exec','supabase_db_wa-creation-auth-lab','psql','-U','postgres','-d','postgres','-XqAt','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'}).trim();
assert.equal(sql("select relrowsecurity from pg_class where oid='public.watches'::regclass"),'t');
assert.equal(sql("select to_regclass('cron.job') is null"),'t');
async function login(email) {
 const client=createClient(e.SUPABASE_URL,e.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 let sent=await client.auth.signInWithOtp({email});
 if(sent.error?.code==='over_email_send_rate_limit'){await new Promise(r=>setTimeout(r,1100));sent=await client.auth.signInWithOtp({email});}
 assert.equal(sent.error,null);
 let code;
 for(let i=0;i<30&&!code;i++){
  const box=await (await fetch('http://127.0.0.1:54324/api/v1/messages')).json();
  const message=box.messages.find(m=>m.To.some(t=>t.Address===email));
  code=message?.Snippet.match(/Your code:\s*(\d{6})/)?.[1];
  if(!code)await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(code,'OTP captured locally');
 const invalid=await client.auth.verifyOtp({email,token:'000000',type:'email'});assert.ok(invalid.error);
 const verified=await client.auth.verifyOtp({email,token:code,type:'email'});code=null;assert.equal(verified.error,null);
 return {client,session:verified.data.session};
}
const suffix=crypto.randomUUID();
const a=await login(`contract-${suffix}@example.test`);
const id=crypto.randomUUID();
const request='Tell me when Microsoft is mentioned in the media.';
const definition=mediaWatchDefinition({id,title:'Local contract media',inputType:'text',request,...planMediaQuery(request),status:'watching'});
const job={definition,revision:0,mutation:crypto.randomUUID(),pending:true,deleted:false};
async function call(session,method='GET',body){
 const r=await fetch(api+'/api/media-watches',{method,headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,body:await r.json()};
}
const save=await call(a.session,'POST',job);assert.equal(save.status,200);assert.equal(save.body.watch.id,id);
// Deliberately discard the first response: replay the identical mutation.
const replay=await call(a.session,'POST',job);assert.equal(replay.status,200);assert.equal(replay.body.watch.media_revision,save.body.watch.media_revision);
assert.equal(sql(`select count(*) from public.watches where id='${id}' and user_id='${a.session.user.id}'`),'1');
// New real Auth session; no copied storage/session/token.
const second=await login(`contract-${suffix}@example.test`);
assert.equal(second.session.user.id,a.session.user.id);
assert.ok((await call(second.session)).body.watches.some(w=>w.id===id));
const b=await login(`other-${suffix}@example.test`);
assert.ok(!(await call(b.session)).body.watches.some(w=>w.id===id));
const denied=await call(b.session,'POST',{...job,revision:save.body.watch.media_revision,mutation:crypto.randomUUID()});
assert.notEqual(denied.status,200);
const rls=await b.client.from('watches').select('id').eq('id',id);assert.equal(rls.error,null);assert.deepEqual(rls.data,[]);
const invalid=await call(a.session,'POST',{...job,definition:{...definition,id:crypto.randomUUID(),watch_definition:{inputType:'text',request:'Monitor everything in Monaco',category:'general'}},mutation:crypto.randomUUID()});assert.equal(invalid.status,400);
assert.equal(sql(`select count(*) from public.media_watch_notifications where user_id='${a.session.user.id}'`),'0');
console.log(JSON.stringify({passed:true,realOtp:true,invalidOtpRejected:true,freshAuthSession:true,watchId:id,ownerMatches:true,singleRow:true,idempotentReplay:true,crossAccountApiAndRlsDenied:true,unsupportedRejected:true,monitoringNotifications:0}));

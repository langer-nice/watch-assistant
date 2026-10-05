// Explicitly opted-in staging fixtures. Never changes other Watches or sends mail.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { exerciseMediaQueryRecovery } from './test-support/media-query-recovery.mjs';
const env=parseEnv(await readFile(process.argv[2],'utf8'));
const ref='tseexvbwhrtofcsrvcqc';
assert.equal(env.SUPABASE_URL,`https://${ref}.supabase.co`);
assert.equal(env.VITE_SUPABASE_URL,env.SUPABASE_URL);
for (const key of ['SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_ANON_KEY']) assert.equal(JSON.parse(Buffer.from(env[key].split('.')[1],'base64url')).ref,ref);
for (const key of ['MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED','WATCH_EMAIL_NOTIFICATIONS_ENABLED']) assert.equal(env[key],'false');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,options);
const ok=({data,error})=>{assert.ifError(error);return data;};
const users=[];
await mkdir('/tmp/watch-media-query-staging',{recursive:true,mode:0o700});
for(let i=0;i<2;i++) {
 const email=`media-query-${randomUUID()}@example.test`,password=randomBytes(32).toString('base64url');
 const {user}=ok(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{purpose:'synthetic-media-query-validation'}}));
 const client=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,options);
 const {session}=ok(await client.auth.signInWithPassword({email,password}));
 users.push({id:user.id,email,client,session});
 await writeFile('/tmp/watch-media-query-staging/private-fixtures.json',JSON.stringify(users.map(({client,...rest})=>rest)),{mode:0o600});
}
const evidence=await exerciseMediaQueryRecovery({service,clientA:users[0].client,clientB:users[1].client,userA:users[0].id,userB:users[1].id,legacyInitialContext:true});
await writeFile('/tmp/watch-media-query-staging/evidence.json',JSON.stringify({project:ref,...evidence},null,2));
console.log(JSON.stringify({project:ref,...evidence},null,2));

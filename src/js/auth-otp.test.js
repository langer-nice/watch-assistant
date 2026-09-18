import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSession } from './auth-session.js';
const location = new URL('https://example.test/new-watch.html');
const session = { user:{id:'synthetic-a',email:'a@example.test'},access_token:'synthetic-session' };
const setup = (options = {}) => {
  let listener, time=1000;
  const calls=[];
  const client={ auth:{
    getSession:async()=>({data:{session:null}}),
    onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){}}}};},
    signInWithOtp:async payload=>{calls.push(['send',payload]);return {error:null};},
    verifyOtp:async payload=>{calls.push(['verify',payload]);listener('SIGNED_IN',session);return {data:{session},error:null};},
    signOut:async()=>{listener('SIGNED_OUT',null);return {error:null};},
  }};
  const auth=createAuthSession({client,location,mode:'otp',now:()=>time,...options});
  return {auth,client,calls,advance(ms){time+=ms;},emit:(event,s)=>listener(event,s)};
};

test('OTP uses the supported email type, and only a verified session authorizes completion',async()=>{
  const {auth,calls}=setup();await auth.initialize();await auth.sendMagicLink(' a@example.test ');
  assert.equal(auth.getState().status,'code-sent');assert.equal(auth.getState().session,null);
  assert.deepEqual(calls[0],['send',{email:'a@example.test',options:{shouldCreateUser:true}}]);
  await auth.verifyCode(' 246810 ');
  assert.deepEqual(calls[1],['verify',{email:'a@example.test',token:'246810',type:'email'}]);
  assert.equal(auth.getState().session,session);assert.ok(auth.getState().verifiedRequest);
  assert.equal(JSON.stringify(auth.getState()).includes('246810'),false);
});

for(const code of ['','12345','1234567','12 3456','12-3456','abcdef','１２３４５６','123.45']) {
  test(`malformed code is never sent: ${JSON.stringify(code)}`,async()=>{
    const {auth,calls}=setup();await auth.initialize();await auth.sendMagicLink('a@example.test');await auth.verifyCode(code);
    assert.equal(auth.getState().error,'malformed_code');assert.equal(calls.length,1);
  });
}
for(const error of ['invalid_code','otp_expired','used_code','over_email_send_rate_limit','network_failure']) {
  test(`provider failure stays unauthenticated and recoverable: ${error}`,async()=>{
    const {auth,client}=setup();await auth.initialize();await auth.sendMagicLink('a@example.test');
    client.auth.verifyOtp=async()=>({error:{code:error}});await auth.verifyCode('246810');
    assert.equal(auth.getState().status,'code-sent');assert.equal(auth.getState().session,null);assert.equal(auth.getState().error,error);
  });
}

test('resend cooldown covers changed email and duplicates and never runs automatically',async()=>{
  const {auth,calls,advance}=setup({resendSeconds:120});await auth.initialize();await auth.sendMagicLink('a@example.test');
  assert.equal(auth.cooldownRemaining(),120);
  auth.resetEmail();await auth.sendMagicLink('b@example.test');assert.equal(calls.length,1);
  advance(119000);await auth.sendMagicLink('b@example.test');assert.equal(calls.length,1);
  advance(1000);assert.equal(calls.length,1);await auth.sendMagicLink('b@example.test');assert.equal(calls.length,2);
});

test('simultaneous send and verify requests are deduplicated',async()=>{
  const {auth,client,calls}=setup();await auth.initialize();
  let sent;client.auth.signInWithOtp=()=>new Promise(resolve=>{calls.push('send');sent=resolve;});
  const pending=auth.sendMagicLink('a@example.test');await auth.sendMagicLink('a@example.test');assert.equal(calls.length,1);
  sent({error:null});await pending;
  let verified;client.auth.verifyOtp=()=>new Promise(resolve=>{calls.push('verify');verified=resolve;});
  const verifying=auth.verifyCode('246810');await auth.verifyCode('246810');assert.equal(calls.length,2);
  verified({data:{session}});await verifying;assert.equal(auth.getState().status,'authenticated');
});

test('cancelled verification and account switching cannot authorize draft transfer',async()=>{
  const {auth,client,emit}=setup();await auth.initialize();await auth.sendMagicLink('a@example.test');
  let finish;client.auth.verifyOtp=()=>new Promise(resolve=>{finish=resolve;});
  const pending=auth.verifyCode('246810');auth.cancelChallenge();
  const other={user:{id:'synthetic-b',email:'b@example.test'},access_token:'other-synthetic-session'};
  emit('SIGNED_IN',other);client.auth.getSession=async()=>({data:{session:other}});
  finish({data:{session}});await pending;
  assert.equal(auth.getState().session,other);assert.equal(auth.getState().verifiedRequest,null);
});

test('sign-out during verification rejects delayed success and cleans up a late SDK session',async()=>{
  const {auth,client,emit}=setup();await auth.initialize();await auth.sendMagicLink('a@example.test');
  let finish;client.auth.verifyOtp=()=>new Promise(resolve=>{finish=resolve;});
  const pending=auth.verifyCode('246810');await auth.signOut();
  emit('SIGNED_IN',session);client.auth.getSession=async()=>({data:{session}});
  finish({data:{session}});await pending;
  assert.equal(auth.getState().session,null);assert.equal(auth.getState().verifiedRequest,null);
});

test('missing or mismatched verified identity fails closed',async()=>{
  for(const returned of [null,{user:{id:'a'}},{...session,user:{id:'b',email:'b@example.test'}}]) {
    const {auth,client}=setup();await auth.initialize();await auth.sendMagicLink('a@example.test');
    client.auth.verifyOtp=async()=>({data:{session:returned}});await auth.verifyCode('246810');
    assert.equal(auth.getState().status,'error');assert.equal(auth.getState().session,null);assert.equal(auth.getState().error,'unresolved_auth');
  }
});

test('unset or unknown rollout mode remains compatible with Magic Link delivery',async()=>{
  const {auth,calls}=setup({mode:'magic-link'});await auth.initialize();await auth.sendMagicLink('a@example.test');
  assert.equal(auth.getState().status,'link-sent');assert.equal(calls[0][1].options.emailRedirectTo,'https://example.test/index.html');
  await auth.verifyCode('246810');assert.equal(calls.length,1);
});

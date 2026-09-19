import assert from 'node:assert/strict'; import test from 'node:test'; import { processMediaWatchEmailNotifications } from './media-watch-notifications.js';
const env={MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'true',VERCEL_ENV:'production',RESEND_API_KEY:'placeholder',WATCH_EMAIL_FROM:'Watch <watch@davidlangdesign.com>',WATCH_APP_BASE_URL:'https://watch.example'};
const row=(id)=>({id,watch_id:`watch-${id}`,user_id:`user-${id}`,source_article_id:`article-${id}`,watch_title:'Elon Musk',article:{title:`Article ${id}`,url:`https://news.example/${id}`,source:'News'}});
const store=(entries,{unverified=[]}={})=>{const rows=new Map(entries.map(x=>[x.id,{...x,status:'pending'}]));const calls={sent:[],failed:[]};return {calls,from(){const b={select(){return b},eq(){return b},or(){return b},order(){return b},range(start,end){return Promise.resolve({data:[...rows.values()].filter(x=>x.status==='pending').slice(start,end+1).map(({id})=>({id})),error:null})}};return b},auth:{admin:{getUserById:async(id)=>({data:{user:unverified.includes(id)?{email:null}:{email:`${id}@example.test`,email_confirmed_at:'now'}},error:null})}},rpc:async(name,p)=>{const x=rows.get(p.p_notification_id);if(name==='get_media_watch_notification_locale')return {data:'en',error:null};if(name==='claim_media_watch_email_notification'){if(x.status!=='pending'||x.claim_token)return {data:null,error:null};x.claim_token=p.p_claim_token;return {data:x,error:null}}if(name==='begin_media_watch_email_submission'){x.started=true;return {data:true,error:null}}if(name==='complete_media_watch_email_notification'){x.status='sent';calls.sent.push(x.id);return {data:true,error:null}}if(name==='fail_media_watch_email_notification'){x.status='failed';calls.failed.push([x.id,p.p_error_code]);return {data:true,error:null}}return {data:null,error:null}}};};
test('overlapping processors claim each media article once',async()=>{const c=store([row('one')]);let sends=0;const sender=async()=>{sends++;await new Promise(r=>setTimeout(r,5));return{id:'provider'}};await Promise.all([processMediaWatchEmailNotifications({client:c,env,sender,createClaimToken:()=>`a-${Math.random()}`}),processMediaWatchEmailNotifications({client:c,env,sender,createClaimToken:()=>`b-${Math.random()}`})]);assert.equal(sends,1);assert.deepEqual(c.calls.sent,['one']);});
test('unverified recipient and provider failure are isolated from a successful article',async()=>{const c=store([row('bad-recipient'),row('bad-provider'),row('good')],{unverified:['user-bad-recipient']});const out=await processMediaWatchEmailNotifications({client:c,env,sender:async({html})=>{if(html.includes('bad-provider'))throw Object.assign(new Error('private'),{code:'EMAIL_PROVIDER_ERROR'});return{id:'provider'}}});assert.equal(out.sentCount,1);assert.equal(out.failedCount,2);assert.deepEqual(c.calls.failed.map(x=>x[1]).sort(),['EMAIL_PROVIDER_ERROR','RECIPIENT_UNVERIFIED']);});
test('disabled media delivery never reads the outbox or calls a sender',async()=>{let touched=false;const out=await processMediaWatchEmailNotifications({client:{from(){touched=true}},env:{...env,MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED:'false'},sender:async()=>{touched=true}});assert.equal(out.status,'disabled');assert.equal(touched,false);});

test('accepted provider submission followed by database failure is terminal and explicitly uncertain',async()=>{
 const c=store([row('accepted')]);const original=c.rpc;c.rpc=async(name,p)=>name==='complete_media_watch_email_notification'?{data:false,error:{code:'database'}}:original(name,p);
 let sends=0;await processMediaWatchEmailNotifications({client:c,env,sender:async()=>{sends++;return{id:'accepted'}}});
 assert.equal(sends,1);assert.equal(c.calls.failed[0][1],'EMAIL_DELIVERY_OUTCOME_UNKNOWN');
 await processMediaWatchEmailNotifications({client:c,env,sender:async()=>{sends++;return{id:'duplicate'}}});assert.equal(sends,1);
});
for (const preparationMs of [0, 29]) {
  test(`a hung provider is bounded without replay after ${preparationMs}ms preparation`, async (t) => {
    // Only simulated time consumes the budget; host scheduling cannot expire it
    // before the test has observed the intended provider boundary.
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
    const c = store([row('timeout')]);
    const recipientEntered = Promise.withResolvers();
    const releaseRecipient = Promise.withResolvers();
    const providerEntered = Promise.withResolvers();
    const releaseProvider = Promise.withResolvers();
    const getUser = c.auth.admin.getUserById;
    c.auth.admin.getUserById = async (...args) => {
      recipientEntered.resolve();
      await releaseRecipient.promise;
      return getUser(...args);
    };
    let sends = 0;
    const sender = () => { sends += 1; providerEntered.resolve(); return releaseProvider.promise; };
    const start = Date.now();
    const run = processMediaWatchEmailNotifications({ client: c, env, deadline: start + 30, sender });
    const reached = signal => Promise.race([
      signal.promise,
      run.then(() => assert.fail('processor completed before the expected boundary')),
    ]);
    try {
      await reached(recipientEntered);
      assert.equal(sends, 0);
      t.mock.timers.tick(preparationMs);
      assert.equal(sends, 0, 'preparation is explicitly held before the provider');
      releaseRecipient.resolve();
      await reached(providerEntered);
      assert.equal(sends, 1);
      t.mock.timers.tick(30 - preparationMs);
      const result = await run;
      assert.equal(Date.now() - start, 30);
      assert.equal(result.claimedCount, 1);
      assert.equal(result.failedCount, 1);
      assert.equal(result.sentCount, 0);
      assert.equal(result.persistenceFailureCount, 1, 'expired budget also prevents recording the uncertain outcome');
      assert.deepEqual(c.calls.sent, []);
      const next = await processMediaWatchEmailNotifications({ client: c, env, deadline: Date.now() + 30, sender });
      assert.equal(next.skippedCount, 1, 'the retained claim prevents replay after an uncertain submission');
      assert.equal(sends, 1, 'a later processor must not submit the same article again');
    } finally {
      // Settle deferred work even if an assertion fails, before restoring mocks.
      releaseRecipient.resolve();
      releaseProvider.resolve({ id: 'late-provider-result' });
      try { await run; } finally { c.auth.admin.getUserById = getUser; t.mock.timers.reset(); }
    }
  });
}

for (const from of [undefined, '', 'invalid', 'watch@example.test', 'x\nBcc:secret']) {
  test(`invalid media config blocks claims: ${JSON.stringify(from)}`, async () => {
    const result = await processMediaWatchEmailNotifications({ client: {}, env: { ...env, WATCH_EMAIL_FROM: from },
      sender: async () => assert.fail('unexpected provider call') });
    assert.equal(result.status, 'configuration-failed'); assert.equal(result.claimedCount, 0);
  });
}
for (const code of ['EMAIL_PROVIDER_REJECTED_422', 'EMAIL_PROVIDER_RETRYABLE', 'EMAIL_DELIVERY_OUTCOME_UNKNOWN']) {
  test(`media persists ${code} without automatic replay`, async () => {
    const c = store([row('one')]); let sends = 0;
    const run = () => processMediaWatchEmailNotifications({ client: c, env,
      sender: async () => { sends++; throw Object.assign(new Error('secret'), { code }); } });
    const result = await run(); await run(); assert.equal(sends, 1);
    assert.equal(c.calls.failed[0][1], code);
    assert.equal(result.retryableFailureCount, code === 'EMAIL_PROVIDER_RETRYABLE' ? 1 : 0);
  });
}
test('media normalizes legacy sender and preserves per-run delivery limit', async () => {
  const c = store(Array.from({ length: 30 }, (_, i) => row(String(i)))); const sent = [];
  const run = () => processMediaWatchEmailNotifications({ client: c, env: { ...env, WATCH_EMAIL_FROM: '<watch@davidlangdesign.com>' },
    sender: async message => { assert.equal(message.from, 'Watch Assistant <watch@davidlangdesign.com>');
      sent.push(message.idempotencyKey); return { id: 'accepted' }; } });
  assert.equal((await run()).sentCount, 25); assert.equal((await run()).sentCount, 5);
  assert.equal((await run()).sentCount, 0); assert.equal(new Set(sent).size, 30);
});

test('Unicode media configuration performs no database work and remains recoverable', async () => {
  const c = store([row('one')]); let sends = 0;
  const untouchedClient = new Proxy(c, { get() { assert.fail('invalid config must not access outbox or recipient'); } });
  for (const from of ['teſt@davidlangdesign.com', 'test@davidlangdeſign.com']) {
    const result = await processMediaWatchEmailNotifications({ client: untouchedClient,
      env: { ...env, WATCH_EMAIL_FROM: from }, sender: async () => { sends++; } });
    assert.equal(result.status, 'configuration-failed'); assert.equal(result.sentCount, 0);
    assert.equal(result.claimedCount, 0); assert.doesNotMatch(JSON.stringify(result), /@/);
  }
  assert.equal(sends, 0); assert.deepEqual(c.calls, { sent: [], failed: [] });
  const result = await processMediaWatchEmailNotifications({ client: c, env,
    sender: async () => { sends++; return { id: 'accepted' }; } });
  assert.equal(result.sentCount, 1); assert.equal(sends, 1);
});

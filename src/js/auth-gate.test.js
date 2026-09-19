import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { parseHTML } from 'linkedom';
import { configureAccountStorage, localWatchStorageKey } from './account-storage.js';
import { addWatch, getStoredWatches } from './watch-storage.js';
import { saveReport, getReports } from './report-storage.js';
import { safeAuthReturn, getCallbackReturn, getCreationReturn } from './auth-return.js';
import { createAuthSession, getMagicLinkRedirectUrl } from './auth-session.js';
register('./test-support/json-module-loader.js', import.meta.url);
const { initAuthUi, renderAuthState, authErrorKey, getAuthMode } = await import('./auth-ui.js');
const { setLanguage } = await import('./i18n.js');
let originals;
let interfaces = [];
const startUi = options => { const ui = initAuthUi(options); interfaces.push(ui); return ui; };
const storage = () => {
  const values = new Map();
  return { values, getItem:k=>values.get(k) ?? null, setItem:(k,v)=>values.set(k,String(v)), removeItem:k=>values.delete(k) };
};
const client = () => {
  let callback, resolve;
  return {
    emit(session) { callback('SIGNED_IN', session); },
    resolve(session = null) { resolve({ data: { session }, error: null }); },
    auth: {
      onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      getSession() { return new Promise(done=>{ resolve=done; }); },
      async signInWithOtp() { return { error: null }; },
    },
  };
};
const setup = async (path = 'new-watch.html') => {
  const html = await readFile(new URL('../../new-watch.html', import.meta.url), 'utf8');
  const { window, document } = parseHTML(html);
  // Match native digit-containing data attributes (Linkedom treats digits as word boundaries).
  Object.defineProperty(window.Element.prototype, 'dataset', { configurable:true, get() {
    const element=this;
    const attr=key=>'data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
    return new Proxy({}, {get:(_,key)=>element.getAttribute(attr(key)) ?? undefined,
      set:(_,key,value)=>{element.setAttribute(attr(key),String(value));return true;}});
  }});
  Object.assign(globalThis, { window, document, Event:window.Event, CustomEvent:window.CustomEvent });
  window.HTMLElement.prototype.focus = function () { document.focusedElement = this; };
  window.HTMLFormElement.prototype.reportValidity = () => true;
  const redirects = [];
  const url = new URL(`https://example.test/${path}`);
  window.location = { href:url.href, pathname:url.pathname, search:url.search, hash:url.hash, reload:()=>redirects.push('reload'), replace:value=>redirects.push(value) };
  const accountMenu = document.createElement('div');
  accountMenu.innerHTML = '<button data-profile-trigger><span data-auth-label></span></button><div data-auth-root></div>';
  document.body.prepend(accountMenu);
  setLanguage('en', {persist:false});
  return { document, redirects };
};
test.beforeEach(() => {
  originals = Object.fromEntries(['window','document','Event','CustomEvent','localStorage','sessionStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  globalThis.localStorage=storage(); globalThis.sessionStorage=storage();
});
test.afterEach(() => {
  interfaces.forEach(ui=>ui.destroy()); interfaces=[];
  configureAccountStorage(null);
  for(const [key,descriptor] of Object.entries(originals)) {
    if(descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key];
  }
});

for (const route of ['new-watch.html','new-watch.html?onboarding=first-watch','new-watch.html?edit=private-id','new-watch.html?edit=private-id&presentation=modal']) {
  test(`only an in-memory new request is available before authentication: ${route}`, async () => {
    const {document,redirects}=await setup(route);
    const mock=client(); const ui=startUi({client:mock});
    const content=document.querySelector('[data-editor-content]');
    assert.equal(content.hidden,true); assert.equal(content.hasAttribute('inert'),true);
    ui.revealEditor(); assert.equal(content.hidden,true);
    mock.resolve(); await ui.ready;
    assert.equal(ui.canEnterEditor(),false);
    assert.equal(document.querySelector('[data-auth-label]').textContent,'Sign in');
    const input=document.querySelector('#guestWatchInput');
    if(route.includes('edit=')) { assert.equal(input,null); assert.equal(document.querySelector('[data-auth-gate]').hidden,false); }
    else {
      assert.ok(input);assert.equal(document.querySelector('[data-auth-gate]').hidden,true);
      input.value='PRIVATE GUEST REQUEST';
      document.querySelector('[data-guest-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
      assert.equal(input.value,'PRIVATE GUEST REQUEST');assert.equal(document.querySelector('[data-auth-gate]').hidden,false);
      document.querySelector('[data-auth-back]').click();
      assert.equal(input.value,'PRIVATE GUEST REQUEST');assert.equal(document.querySelector('[data-auth-gate]').hidden,true);
      mock.emit({user:{id:'synthetic-a'}});
      assert.equal(input.value,'','an unrelated sign-in must never adopt guest text');
      assert.equal(redirects.at(-1),'reload');
    }
  });
}

test('resolved account enters directly; callback returns only to the allowlisted creation flow', async () => {
  const {document}=await setup(); const mock=client(); const ui=startUi({client:mock});
  mock.resolve({user:{id:'synthetic-a'}}); await ui.ready;
  assert.equal(ui.canEnterEditor(),true); ui.revealEditor();
  assert.equal(document.querySelector('[data-editor-content]').hidden,false);
  assert.equal(document.querySelector('[data-auth-gate]'),null);
  assert.equal(document.querySelector('[data-auth-label]').textContent,'');
});

test('signed-out and unresolved storage cannot read, create, adopt or acknowledge anonymous data', () => {
  localStorage.setItem('watchAssistant.watches.guest.v2', JSON.stringify([{id:'legacy-guest',request:'PRIVATE'}]));
  for(const status of ['anonymous','unavailable','loading','sending','link-sent','error','confirming','signing-out']) {
    configureAccountStorage({getState:()=>({status})});
    const before = [...localStorage.values];
    assert.equal(localWatchStorageKey('watchAssistant.watches'),null);
    assert.equal(addWatch({id:'anonymous',request:'PRIVATE',createdAt:new Date().toISOString()}),null);
    assert.throws(()=>saveReport({id:'anonymous'}), TypeError);
    assert.deepEqual(getStoredWatches(),[]); assert.deepEqual(getReports(),[]);
    assert.deepEqual([...localStorage.values],before);
  }
  configureAccountStorage({getState:()=>({status:'authenticated',session:{user:{id:'synthetic-b'}}})});
  assert.deepEqual(getStoredWatches(),[]);
});

test('strict return allowlist rejects external, malformed, encoded and private editor destinations', () => {
  for(const value of ['https://evil.test','//evil.test','\\\\evil.test','javascript:alert(1)','/new-watch.html','%6eew-watch.html','new-watch.html%3fonboarding=first-watch','new-watch.html?edit=private','new-watch.html?request=PRIVATE','new-watch.html#private',' new-watch.html','new-watch.html?onboarding=first-watch&next=//evil.test']) {
    assert.equal(safeAuthReturn(value),null,value);
    assert.equal(getCallbackReturn(new URL(`https://example.test/index.html?returnTo=${encodeURIComponent(value)}`)),null);
  }
  assert.equal(getCallbackReturn(new URL('https://example.test/?returnTo=new-watch.html&returnTo=new-watch.html')),null);
  assert.equal(getCallbackReturn(new URL('https://example.test/?returnTo=%6eew-watch.html')),null);
  const redirect = getMagicLinkRedirectUrl(new URL('https://example.test/new-watch.html?request=PRIVATE'), 'new-watch.html?onboarding=first-watch','fr');
  assert.equal(getCallbackReturn(new URL(redirect)),'new-watch.html?onboarding=first-watch');
  assert.equal(redirect.includes('PRIVATE'),false);
});

test('pending OTP suppresses duplicates and stale responses cannot replace a signed-in session', async () => {
  let resolve, calls=0;
  const mock=client(); mock.auth.signInWithOtp=()=>{ calls++;return new Promise(done=>{resolve=done;}); };
  const auth=createAuthSession({client:mock,location:new URL('https://example.test')});
  const ready=auth.initialize(); mock.resolve(); await ready;
  const pending=auth.sendMagicLink('one@example.test'); await auth.sendMagicLink('two@example.test');
  assert.equal(calls,1); assert.equal(auth.getState().status,'sending');
  mock.emit({user:{id:'synthetic-a'}}); resolve({error:null}); await pending;
  assert.equal(auth.getState().status,'authenticated');
});

for(const lang of ['en','fr']) {
  test(`${lang} confirmation escapes email, provides secondary recovery, focuses a cleared field and survives translation`, async () => {
    const {document}=await setup(); setLanguage(lang,{persist:false});
    const mock=client();const ui=startUi({client:mock});mock.resolve();await ui.ready;ui.canEnterEditor();
    document.querySelector('#guestWatchInput').value='Synthetic Watch request';
    document.querySelector('[data-guest-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(document.focusedElement.id,'gateEmail');
    const email='<img src=x onerror=alert(1)>@example.test';
    await ui.auth.sendMagicLink(email);
    const gate=document.querySelector('[data-auth-gate]');
    assert.ok(gate.textContent.includes(email));assert.equal(gate.querySelector('img'),null);
    assert.ok(gate.querySelector('[role="status"]'));
    assert.equal(gate.querySelector('form'),null);
    const retry=gate.querySelector('[data-auth-retry]');
    assert.equal(retry.className,'auth-menu__text-button');
    assert.ok(retry.textContent.includes(lang==='en'?'Wrong email?':'Mauvaise adresse ?'));
    assert.equal(gate.textContent.includes('Resend'),false);
    retry.click();assert.equal(document.focusedElement.id,'gateEmail');
    assert.equal(document.focusedElement.value,'');
    setLanguage(lang,{persist:false});assert.ok(gate.querySelector('form'));
  });
}

test('errors use localized recovery text without leaking provider diagnostics', async () => {
  const {document}=await setup(); const root=document.createElement('div');
  for(const [message,key] of [['429 rate limit','auth.rateLimit'],['otp_expired','auth.expiredLink'],['invalid token','auth.invalidLink'],['provider stack SECRET','auth.error']]) {
    assert.equal(authErrorKey(message),key);
    renderAuthState(root,{status:'error',error:message});
    assert.ok(root.querySelector('[role="alert"]'));
    assert.equal(root.textContent.includes(message),false);
  }
});

for (const returnTo of ['new-watch.html?onboarding=first-watch', '//evil.test', '%6eew-watch.html']) {
  test(`callback navigation validates the destination before entering the app: ${returnTo}`, async () => {
    const {document,redirects}=await setup(`index.html?returnTo=${encodeURIComponent(returnTo)}`);
    document.querySelector('[data-editor-content]').remove();
    const mock=client(); const ui=startUi({client:mock});
    mock.resolve({user:{id:'synthetic-a'}}); await ui.ready;
    assert.deepEqual(redirects,returnTo.startsWith('new-watch') ? [returnTo] : []);
    assert.equal(ui.canEnterEditor(),!returnTo.startsWith('new-watch'));
  });
}

test('a modal route without profile UI still creates the shared gate and resolves authentication', async () => {
  const {document}=await setup('new-watch.html?edit=synthetic-watch&presentation=modal');
  document.querySelector('[data-auth-root]').remove();
  const mock=client(); const ui=startUi({client:mock}); mock.resolve(); await ui.ready;
  assert.equal(ui.canEnterEditor(),false);
  assert.ok(document.querySelector('[data-auth-gate]'));
});

for (const flow of ['1', '2', '3', '4']) {
  test(`public audience ${flow} survives sign-in without preserving private editor fields`, () => {
    const location = new URL(`https://example.test/new-watch.html?onboarding=first-watch&flow=${flow}&request=PRIVATE`);
    const expected = `new-watch.html?onboarding=first-watch&flow=${flow}`;
    assert.equal(getCreationReturn(location), expected);
    assert.equal(getCallbackReturn(new URL(getMagicLinkRedirectUrl(location, expected))), expected);
    assert.equal(safeAuthReturn(`${expected}&request=PRIVATE`), null);
  });
}

test('same-page OTP resumes the exact guest request once, only after resolved verification', async () => {
  const {document}=await setup(); const mock=client(); const resumed=[];
  mock.auth.verifyOtp=async({email,token,type})=>{
    assert.equal(type,'email');assert.equal(token,'246810');
    const session={user:{id:'synthetic-a',email},access_token:'synthetic-token'};
    mock.emit(session);return {data:{session}};
  };
  const ui=startUi({client:mock,env:{VITE_AUTH_MODE:'otp'},onResume:(...args)=>resumed.push(args)});
  mock.resolve();await ui.ready;ui.canEnterEditor();
  const input=document.querySelector('#guestWatchInput'); input.value='  DISTINCTIVE PRIVATE REQUEST\n  second line  ';
  document.querySelector('[data-guest-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(resumed.length,0);
  await ui.auth.sendMagicLink('a@example.test');
  const form=document.querySelector('[data-auth-gate] [data-auth-code-form]');form.reportValidity=()=>true;
  form.querySelector('[name="code"]').value=' 246810 ';
  form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(resumed,[['  DISTINCTIVE PRIVATE REQUEST\n  second line  ','synthetic-a']]);
  assert.equal(input.value,'');assert.equal(document.querySelector('#guestWatchInput'),null);
  assert.equal(form.querySelector('[name="code"]').value,'');
});

test('guest URL paste does not call analysis or persist, and history manipulation invalidates it', async()=>{
  const {document,redirects}=await setup();const mock=client();const ui=startUi({client:mock});mock.resolve();await ui.ready;ui.canEnterEditor();
  const input=document.querySelector('#guestWatchInput');const before=[...localStorage.values];
  input.value='https://example.test/private-request';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('paste',{bubbles:true}));
  assert.deepEqual([...localStorage.values],before);assert.equal(sessionStorage.values.size,0);
  window.location.search='?edit=private-a';
  document.querySelector('[data-guest-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(input.value,'');assert.equal(document.querySelector('[data-editor-content]').hidden,true);
  assert.equal(redirects.length,0);
});

test('pagehide scrubs guest input and prevents detached submission',async()=>{
  const {document}=await setup();const mock=client();const ui=startUi({client:mock});mock.resolve();await ui.ready;ui.canEnterEditor();
  const input=document.querySelector('#guestWatchInput');input.value='PRIVATE';const form=document.querySelector('[data-guest-form]');
  window.dispatchEvent(new Event('pagehide'));assert.equal(input.value,'');
  form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(document.querySelector('[data-auth-gate]').hidden,true);
});

test('duplicate UI verification submissions cannot cancel the original authorized resume', async()=>{
  const {document}=await setup();const mock=client();let finish;let calls=0;const resumed=[];
  mock.auth.verifyOtp=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
  const ui=startUi({client:mock,env:{VITE_AUTH_MODE:'otp'},onResume:(...args)=>resumed.push(args)});
  mock.resolve();await ui.ready;ui.canEnterEditor();
  document.querySelector('#guestWatchInput').value='PRIVATE';
  document.querySelector('[data-guest-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await ui.auth.sendMagicLink('a@example.test');
  const submit=()=>{
    const form=document.querySelector('[data-auth-gate] [data-auth-code-form]');form.reportValidity=()=>true;
    form.querySelector('[name="code"]').value='246810';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  };
  submit();submit();assert.equal(calls,1);
  finish({data:{session:{user:{id:'synthetic-a',email:'a@example.test'},access_token:'synthetic-session'}}});
  await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(resumed,[['PRIVATE','synthetic-a']]);
});

test('returning to the guest request during verification invalidates the old creation action', async()=>{
  const {document}=await setup();const mock=client();let finish;const resumed=[];
  mock.auth.verifyOtp=()=>new Promise(resolve=>{finish=resolve;});
  const ui=startUi({client:mock,env:{VITE_AUTH_MODE:'otp'},onResume:(...args)=>resumed.push(args)});
  mock.resolve();await ui.ready;ui.canEnterEditor();
  const input=document.querySelector('#guestWatchInput');input.value='PRIVATE CANCELLED REQUEST';
  document.querySelector('[data-guest-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await ui.auth.sendMagicLink('a@example.test');
  const form=document.querySelector('[data-auth-gate] [data-auth-code-form]');form.reportValidity=()=>true;
  form.querySelector('[name="code"]').value='246810';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  document.querySelector('[data-auth-back]').click();
  assert.equal(input.value,'PRIVATE CANCELLED REQUEST');
  mock.auth.getSession=async()=>({data:{session:null}});
  finish({data:{session:{user:{id:'synthetic-a',email:'a@example.test'},access_token:'synthetic-session'}}});
  await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(resumed,[]);
});


test('rollout configuration defaults safely to Magic Link and opts in only to exact otp',()=>{
  for(const env of [undefined,{}, {VITE_AUTH_MODE:'magic-link'}, {VITE_AUTH_MODE:'unknown'}, {VITE_AUTH_MODE:'OTP'}]) assert.equal(getAuthMode(env),'magic-link');
  assert.equal(getAuthMode({VITE_AUTH_MODE:'otp'}),'otp');
});

test('late initial-session events and token refresh do not reload an already authenticated page',async()=>{
  const {document,redirects}=await setup('watches.html');document.querySelector('[data-editor-content]').remove();
  const mock=client();const ui=startUi({client:mock});const session={user:{id:'synthetic-a',email:'a@example.test'},access_token:'synthetic-session'};
  mock.resolve(session);await ui.ready;mock.emit(session);mock.emit(session);
  assert.deepEqual(redirects,[]);
});

for (const email of ['a@example.test', 'b@example.test']) {
  test(`staged Magic Link resumes only the explicitly requested identity: ${email}`, async () => {
    const { document, redirects } = await setup();
    const mock = client();
    const resumed = [];
    const ui = startUi({ client: mock, onResume: (...args) => resumed.push(args) });
    mock.resolve(); await ui.ready; ui.canEnterEditor();
    document.querySelector('#guestWatchInput').value = 'EXACT LEGACY REQUEST';
    document.querySelector('[data-guest-form]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await ui.auth.sendMagicLink('a@example.test');
    mock.emit({ user: { id: 'synthetic-owner', email }, access_token: 'synthetic-session' });
    await Promise.resolve();
    assert.deepEqual(resumed, email === 'a@example.test' ? [['EXACT LEGACY REQUEST', 'synthetic-owner']] : []);
    assert.deepEqual(redirects, email === 'a@example.test' ? [] : ['reload']);
  });
}

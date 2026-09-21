// Local synthetic OTP only; no real email, backend, or external network.
// Start account-isolation-preview.mjs, then set PLAYWRIGHT_MODULE to playwright/index.mjs.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.env.SYNTHETIC_ORIGIN || 'http://127.0.0.1:4178';
assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const browser=await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE});
const errors=[];
const waitGuest=page=>page.locator('#guestWatchInput').waitFor({state:'visible'});
const enterPanel=async page=>{await page.locator('[data-guest-form] button').click();await page.locator('#gateEmail').waitFor({state:'visible'});};
try {
  for(const lang of ['en','fr']) for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
    const context=await browser.newContext({viewport,locale:lang,reducedMotion:'reduce'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await context.addInitScript(()=>{
      window.__idbCalls=0;
      const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{window.__idbCalls++;return open(...args);};
      document.addEventListener('submit',event=>{
        if(event.target.id==='newWatchForm') window.__resumedRequest=document.querySelector('#newWatchInput').value;
      },true);
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    const requests=[];let saved=null;let posts=0;
    page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))requests.push(request);});
    await page.route('**/api/plan-watch*',route=>route.fulfill({json:{strategy:'official_company',connector:'bodacc',country:'FR',identifier:'552005969',confidence:1,needsClarification:false,clarificationQuestion:null}}));
    await page.route('**/api/company-watches',route=>{
      if(route.request().method()==='POST') {
        assert.match(route.request().headers().authorization,/^Bearer synthetic-/);
        posts++;
        const body=route.request().postDataJSON();
        saved={id:'synthetic-created',inputType:'company',category:'general',title:body.title,request:body.request,whyFollowing:body.summary,status:'watching',createdAt:new Date().toISOString(),company:{siren:body.siren,name:body.companyName},updates:[]};
        return route.fulfill({status:201,json:{watch:saved,outcome:'baseline'}});
      }
      return route.fulfill({json:{watches:saved?[saved]:[]}});
    });
    await page.route('**/api/company-watch?*',route=>{
      assert.equal(route.request().method(),'PATCH');saved={...saved,whyFollowing:route.request().postDataJSON().summary};
      return route.fulfill({json:{watch:saved}});
    });
    await page.goto(`${origin}/flow-3.html?lang=${lang}&flow=4`);
    while(!await page.locator('[data-onboarding-first-watch]').isVisible()) await page.locator('[data-flow-3-screen]:not([hidden]) [data-flow-3-next]').click();
    await page.locator('[data-onboarding-first-watch]').click();await waitGuest(page);
    assert.equal(await page.locator('#newWatchInput').isVisible(),false);
    assert.equal(await page.locator('#guestOnboardingNotice').isVisible(),true);
    const request='  Synthetic Company SIREN 552005969\n  ';
    await page.locator('#guestWatchInput').fill('https://example.test/PRIVATE-GUEST-URL');
    await page.locator('#guestWatchInput').press('Space');
    assert.equal(requests.length,0,'typing/pasting URLs cannot fetch or analyze');
    await page.locator('#guestWatchInput').fill(request);
    await enterPanel(page);
    assert.equal(await page.locator('#guestWatchInput').inputValue(),request);
    await page.locator('[data-auth-back]').click();
    assert.equal(await page.locator('#guestWatchInput').inputValue(),request);
    assert.equal(await page.locator('#guestWatchInput').evaluate(el=>el===document.activeElement),true);
    await enterPanel(page);
    await page.locator('#gateEmail').fill('a@example.test');await page.locator('#gateEmail').press('Enter');
    await page.locator('#gateEmailCode').waitFor({state:'visible'});
    assert.equal(await page.locator('#gateEmailCode').getAttribute('inputmode'),'numeric');
    assert.equal(await page.locator('#gateEmailCode').getAttribute('autocomplete'),'one-time-code');
    assert.ok((await page.locator('[data-auth-gate]').innerText()).includes('a@example.test'));
    assert.equal(await page.locator('[data-auth-gate] [data-auth-resend]').count(),0);
    assert.equal(await page.locator('[data-auth-cooldown]').count(),0);
    assert.equal(await page.evaluate(()=>syntheticAuth.emailCalls.length),1);
    assert.equal(requests.length,0,'email challenge cannot start Watch APIs');
    assert.equal(posts,0);
    assert.equal(await page.evaluate(text=>JSON.stringify({...localStorage,...sessionStorage}).includes(text),request),false);
    assert.equal(await page.evaluate(()=>window.__idbCalls),0);
    assert.equal(await page.evaluate(()=>document.cookie.includes('Synthetic')),false);
    assert.equal(page.url().includes('Synthetic'),false);
    await page.locator('#gateEmailCode').fill('12 3456');await page.locator('#gateEmailCode').press('Enter');
    await page.locator('#gateEmailError[role="alert"]').waitFor();
    await page.locator('#gateEmailCode').fill('000000');await page.locator('#gateEmailCode').press('Enter');
    await page.locator('#gateEmailError[role="alert"]').waitFor();
    assert.equal(posts,0);assert.equal(requests.length,0);
    const retry=page.locator('[data-auth-gate] [data-auth-retry]');
    await retry.focus();
    assert.equal(await retry.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    assert.ok(await retry.evaluate(el=>el.getBoundingClientRect().height>=44));
    assert.equal(await retry.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
    await page.screenshot({path:`/tmp/watch-otp-${lang}-${viewport.width}.png`});
    // Paste-equivalent fill preserves surrounding whitespace; internal repairs are forbidden.
    await page.locator('#gateEmailCode').evaluate(el => { const data = new DataTransfer(); data.setData('text', ' 246810 '); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); });await page.locator('#gateEmailCode').press('Enter');
    await page.locator('#urlReviewCreate').waitFor({state:'visible'});
    assert.ok(page.url().includes('/new-watch.html'),'verification stays on the current application page');
    assert.equal(await page.evaluate(()=>window.__resumedRequest),request);
    assert.equal(await page.locator('#onboardingRequestNotice').count(),1);
    assert.equal(posts,0);
    await page.locator('#urlReviewCreate').click();await page.waitForURL('**/index.html');
    assert.equal(posts,1);
    await page.goto(`${origin}/new-watch.html?edit=synthetic-created`);await page.locator('#newWatchInput').waitFor({state:'visible'});
    await page.locator('[data-note-toggle]').click();await page.locator('#whyFollowingInput').fill('PRIVATE OWNED NOTE');
    await page.locator('#newWatchSubmit').click();await page.waitForURL('**/watch-detail.html?id=synthetic-created*');
    assert.equal(saved.whyFollowing,'PRIVATE OWNED NOTE');
    await page.goto(`${origin}/new-watch.html?edit=synthetic-created`);await page.locator('#newWatchInput').waitFor({state:'visible'});
    await page.evaluate(()=>syntheticAuth.signOut());await waitGuest(page);
    assert.equal((await page.locator('body').innerText()).includes('PRIVATE OWNED NOTE'),false);
    saved=null;
    await page.locator('#guestWatchInput').fill('STALE GUEST TEXT');
    await page.evaluate(()=>syntheticAuth.signIn('B'));await page.locator('#newWatchInput').waitFor({state:'visible'});
    assert.equal(await page.locator('#newWatchInput').inputValue(),'');
    await page.evaluate(()=>syntheticAuth.signOut());await waitGuest(page);
    await page.locator('#guestWatchInput').fill('LOST ON RELOAD');await page.reload();await waitGuest(page);
    assert.equal(await page.locator('#guestWatchInput').inputValue(),'');
    await page.goto(`${origin}/watches.html`);
    await page.locator(viewport.width<768?'.mobile-new-watch-action__button':'.top-navigation__new-watch').click();await waitGuest(page);
    await page.locator('#guestWatchInput').fill('LOST ON HISTORY');await page.goBack();await page.goForward();await waitGuest(page);
    assert.equal(await page.locator('#guestWatchInput').inputValue(),'');
    await page.goto(`${origin}/new-watch.html?edit=synthetic-created`);
    await page.locator('[data-auth-gate]').waitFor({state:'visible'});
    assert.equal(await page.locator('#guestWatchInput').count(),0);assert.equal(await page.locator('#newWatchInput').isVisible(),false);
    // Generic header sign-in uses the same challenge without creation wording.
    await page.goto(`${origin}/watches.html`);await page.locator('[data-profile-trigger]').click();
    await page.locator('#authEmail').fill('a@example.test');await page.locator('#authEmail').press('Enter');
    await page.locator('#authEmailCode').waitFor({state:'visible'});
    assert.ok((await page.locator('[data-profile-menu]').innerText()).includes(lang==='fr'?'Me connecter':'Sign in'));
    await page.locator('[data-profile-menu] [data-auth-retry]').click();
    assert.equal(await page.locator('#authEmail').inputValue(),'');
    assert.equal(await page.locator('#authEmail').evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.locator('[data-profile-menu] [type="submit"]').isDisabled(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    console.log(`PASS ${lang} ${viewport.width}: guest → cancel → OTP error → verify → creation, editing, isolation, history, header recovery`);
    await context.close();
  }
  const context=await browser.newContext({reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  for(const lang of ['en','fr']) for(const flow of ['1','2','3','4']) {
    await page.goto(`${origin}/flow-3.html?lang=${lang}&flow=${flow}`);
    while(!await page.locator('[data-onboarding-first-watch]').isVisible())await page.locator('[data-flow-3-screen]:not([hidden]) [data-flow-3-next]').click();
    await page.locator('[data-onboarding-first-watch]').click();await waitGuest(page);
    assert.equal(await page.locator('[data-auth-gate]').isVisible(),false);
  }
  await page.goto(`${origin}/dashboard.html`);await page.locator('[data-dashboard-journeys] article').first().waitFor();
  assert.equal(await page.locator('[data-dashboard-journeys] article').count(),4);
  await page.goto(`${origin}/watches.html`);await page.locator('[data-profile-trigger]').click();
  await page.locator('#authEmail').fill('a@example.test');await page.locator('#authEmail').press('Enter');
  await page.locator('#authEmailCode').waitFor({state:'visible'});
  await page.locator('#authEmailCode').fill('246810');await page.locator('#authEmailCode').press('Enter');
  await page.waitForFunction(()=>document.querySelector('[data-auth-label]')?.textContent==='');
  assert.ok(page.url().endsWith('/watches.html'));
  assert.equal(await context.pages().length,1);
  console.log('PASS generic header OTP signs in on the same Watches page without another tab');
  await context.close();assert.deepEqual(errors,[]);
  console.log('PASS four public onboarding flows in EN/FR, Demo Dashboard and no uncaught browser errors');
} finally {await browser.close();}

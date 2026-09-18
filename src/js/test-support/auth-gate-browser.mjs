// Local synthetic preview only. Run with PLAYWRIGHT_MODULE pointing to playwright/index.mjs.
// SYNTHETIC_ORIGIN defaults to the separately started account-isolation-preview server.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.SYNTHETIC_ORIGIN || 'http://127.0.0.1:4178';
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const browser = await chromium.launch({headless:true});
const errors=[];
try {
  for (const lang of (process.env.PUBLIC_ONLY ? [] : ['en','fr'])) for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
    const context=await browser.newContext({viewport,locale:lang,reducedMotion:'reduce'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${origin}/new-watch.html`,{waitUntil:'domcontentloaded'});
    // During the synthetic one-second unresolved-auth interval, the real editor is inert and hidden.
    assert.equal(await page.locator('#newWatchInput').isVisible(),false);
    await page.locator('[data-auth-continue]').waitFor();
    assert.equal(await page.locator('#newWatchInput').count(),0);
    assert.equal(await page.locator('[data-profile-trigger]').innerText(),lang==='fr'?'Se connecter':'Sign in');
    const overlaps = await page.locator('.top-navigation').evaluate(nav => {
      const items=[...nav.querySelectorAll('a, button')].filter(el=>el.getClientRects().length && !el.closest('[hidden]'));
      return items.some((a,i)=>items.slice(i+1).some(b=>{
        const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();
        return Math.min(x.right,y.right)>Math.max(x.left,y.left)+1 && Math.min(x.bottom,y.bottom)>Math.max(x.top,y.top)+1;
      }));
    });
    assert.equal(overlaps,false,'header controls do not overlap');
    const gate=page.locator('[data-auth-gate]');
    await page.locator('[data-auth-continue]').click();
    assert.equal(await page.locator('#gateEmail').evaluate(el=>el===document.activeElement),true);
    await page.locator('#gateEmail').fill('synthetic@example.test');
    await page.locator('#gateEmail').press('Enter');
    await gate.locator('[data-auth-retry]').waitFor();
    assert.equal(await page.evaluate(()=>window.syntheticAuth.emailCalls.length),1);
    assert.ok((await gate.innerText()).includes('synthetic@example.test'));
    assert.ok((await gate.innerText()).includes(lang==='fr'?'Consultez votre messagerie':'Check your email'));
    assert.equal(await gate.locator('form').count(),0);
    assert.equal(await gate.getByText(/resend|renvoyer/i).count(),0);
    const retry=gate.locator('[data-auth-retry]');
    const style=await retry.evaluate(el=>({height:el.getBoundingClientRect().height,bg:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopWidth}));
    assert.ok(style.height>=44); assert.equal(style.bg,'rgba(0, 0, 0, 0)');assert.equal(style.border,'0px');
    await retry.focus(); assert.equal(await retry.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
    await page.screenshot({path:`/tmp/watch-auth-confirmation-${lang}-${viewport.width}.png`});
    await retry.press('Enter');
    assert.equal(await page.locator('#gateEmail').inputValue(),'');
    assert.equal(await page.locator('#gateEmail').evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>/watches|reports|mediaSync/i.test(k))),false);
    await page.evaluate(()=>window.syntheticAuth.signIn('A'));
    await page.locator('#newWatchInput').waitFor({state:'visible'});
    await page.locator('#newWatchInput').fill('PRIVATE SYNTHETIC A DRAFT');
    await page.evaluate(()=>window.syntheticAuth.signOut());
    await page.locator('[data-auth-continue]').waitFor();
    assert.equal((await page.locator('body').innerText()).includes('PRIVATE SYNTHETIC'),false);
    await page.reload();await page.locator('[data-auth-continue]').waitFor();
    assert.equal(await page.locator('#newWatchInput').count(),0);
    await page.goto(`${origin}/watches.html`);await page.locator(viewport.width<768 ? '.mobile-new-watch-action__button' : '.top-navigation__new-watch').click();
    await page.locator('[data-auth-continue]').waitFor();
    await page.goBack();await page.goForward();await page.locator('[data-auth-continue]').waitFor();
    assert.equal(await page.locator('#newWatchInput').count(),0);
    await page.goto(`${origin}/new-watch.html?edit=synthetic-private`);await page.locator('[data-auth-continue]').waitFor();
    assert.equal(await page.locator('#newWatchInput').count(),0);
    // A synthetic callback in another document preserves the first-Watch destination.
    await page.evaluate(()=>window.syntheticAuth.signIn('A'));
    await page.locator('#newWatchInput').waitFor({state:'visible'});
    await page.goto(`${origin}/index.html?returnTo=new-watch.html%3Fonboarding%3Dfirst-watch&lang=${lang}`);
    await page.waitForURL('**/new-watch.html?onboarding=first-watch');
    await page.locator('#newWatchInput').waitFor({state:'visible'});
    // Owned creation/storage and actual editing controls, without production requests.
    await page.evaluate(async()=>{
      const {addWatch}=await import('/src/js/watch-storage.js');
      addWatch({id:'synthetic-owned',title:'Synthetic owned Watch',request:'Synthetic owned request',whyFollowing:'PRIVATE SYNTHETIC A NOTE',inputType:'text',category:'general',status:'watching',createdAt:new Date().toISOString(),updates:[]});
    });
    await page.goto(`${origin}/new-watch.html?edit=synthetic-owned`);
    await page.locator('#newWatchInput').waitFor({state:'visible'});
    assert.equal(await page.locator('#whyFollowingInput').inputValue(),'PRIVATE SYNTHETIC A NOTE');
    await page.locator('#whyFollowingInput').fill('PRIVATE SYNTHETIC A EDITED');
    await page.locator('#newWatchSubmit').click();
    await page.waitForURL('**/watch-detail.html?id=synthetic-owned');
    await page.goto(`${origin}/new-watch.html?edit=synthetic-owned`);
    await page.locator('#newWatchInput').waitFor({state:'visible'});
    assert.equal(await page.locator('#whyFollowingInput').inputValue(),'PRIVATE SYNTHETIC A EDITED');
    await page.evaluate(()=>window.syntheticAuth.signOut());await page.locator('[data-auth-continue]').waitFor();
    await page.evaluate(()=>window.syntheticAuth.signIn('B'));await page.locator('#newWatchInput').waitFor({state:'visible'});
    assert.deepEqual(await page.evaluate(async()=>(await import('/src/js/watch-storage.js')).getStoredWatches()),[]);
    assert.equal(await page.locator('#newWatchInput').inputValue(),'');
    await page.evaluate(()=>window.syntheticAuth.signOut());await page.locator('[data-auth-continue]').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    console.log(`PASS ${lang} ${viewport.width}: gate, confirmation, keyboard, return, owned edit, sign-out, history, isolation`);
    await context.close();
  }
  const context=await browser.newContext({reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  for(const lang of ['en','fr']) for(const flow of ['1','2','3','4']) {
    await page.goto(`${origin}/flow-3.html?lang=${lang}&flow=${flow}`);
    assert.ok((await page.locator('body').innerText()).trim().length>20);
    assert.equal(await page.locator('[data-auth-gate]').count(),0);
    // Walk the actual public intro; reduced motion skips animation delays.
    for(let i=0;i<5 && !await page.locator('[data-onboarding-first-watch]').isVisible();i++) {
      await page.locator('[data-flow-3-screen]:not([hidden]) [data-flow-3-next]').click();
    }
    await page.locator('[data-onboarding-first-watch]').click();
    await page.locator('[data-auth-continue]').waitFor();
    assert.equal(await page.locator('#newWatchInput').count(),0);
    if (flow === '4') {
      await page.evaluate(()=>window.syntheticAuth.signIn('A'));
      await page.waitForURL('**/new-watch.html?onboarding=first-watch&flow=4');
      await page.locator('#newWatchInput').waitFor({state:'visible'});
      assert.ok((await page.locator('#onboardingRequestNotice').innerText()).length>20);
      await page.evaluate(()=>window.syntheticAuth.signOut());
      await page.locator('[data-auth-continue]').waitFor();
    }
    console.log(`PASS public onboarding ${flow} ${lang} → first-Watch gate`);
  }
  await page.goto(`${origin}/dashboard.html`);
  await page.locator('[data-dashboard-journeys] article').first().waitFor();
  assert.equal(await page.locator('[data-dashboard-journeys] article').count(),4);
  assert.equal(await page.locator('[data-auth-gate]').count(),0);
  let savedCompany = null;
  await page.route('**/api/plan-watch*',route=>route.fulfill({json:{strategy:'official_company',connector:'bodacc',country:'FR',identifier:'552005969',confidence:1,needsClarification:false,clarificationQuestion:null}}));
  await page.route('**/api/company-watches',route=>{
    if(route.request().method()==='POST') {
      assert.match(route.request().headers().authorization,/Bearer synthetic-/);
      const body=route.request().postDataJSON();
      savedCompany={id:'synthetic-created-company',inputType:'company',title:body.title,request:body.request,category:'general',status:'watching',createdAt:new Date().toISOString(),company:{siren:body.siren,name:body.companyName},updates:[]};
      return route.fulfill({status:201,json:{watch:savedCompany,outcome:'baseline'}});
    }
    return route.fulfill({json:{watches:savedCompany?[savedCompany]:[]}});
  });
  await page.goto(`${origin}/new-watch.html`);await page.locator('[data-auth-continue]').waitFor();
  await page.evaluate(()=>window.syntheticAuth.signIn('A'));await page.locator('#newWatchInput').waitFor({state:'visible'});
  await page.evaluate(async()=>(await import('/src/js/intro-flow.js')).cancelOnboardingFirstWatch());
  await page.locator('#newWatchInput').fill('Synthetic Company SIREN 552005969');
  await page.locator('#newWatchSubmit').click();
  await page.locator('#urlReviewCreate').waitFor({state:'visible'});
  await page.locator('#urlReviewCreate').click();
  await page.waitForURL('**/watch-detail.html?id=synthetic-created-company*');
  assert.equal(savedCompany.company.siren,'552005969');
  await page.waitForFunction(title=>document.querySelector('#watchTitle')?.textContent.includes(title),savedCompany.title);
  assert.ok((await page.locator('body').innerText()).includes(savedCompany.title));
  console.log('PASS authenticated form → review → synthetic authorized POST → persisted Watch Detail');
  await context.close();
  assert.deepEqual(errors,[]);
  console.log('PASS Demo Dashboard; no uncaught browser errors; all network restricted to local synthetic origin');
} finally { await browser.close(); }

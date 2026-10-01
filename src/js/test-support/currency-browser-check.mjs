import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
const page = await browser.newPage(); page.setDefaultTimeout(10000);
const language = process.env.TEST_LANGUAGE === 'fr' ? 'fr' : 'en';
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5198' ? route.continue() : route.fulfill({status:200,body:''}));
page.on('console',e=>{if(['error','warning'].includes(e.type())) console.log(e.type(),e.text());});
try {
await page.addInitScript(language=>{
localStorage.setItem('synthetic-preview-account','A');localStorage.setItem('watchAssistant.language',language);
if(!localStorage.getItem('seeded')) {localStorage.setItem('seeded','true');localStorage.setItem('watchAssistant.watches.v2.account.synthetic-user-a',JSON.stringify([{id:'12345678-1234-4234-8234-123456789012',title:'The pound reaches 1.70 to the euro',request:'The pound reaches 1.70 to the euro',inputType:'text',category:'finance',status:'watching',monitoringState:'monitoring',createdAt:'2026-10-01T09:40:00Z'}]));}
}, language);
await page.goto('http://127.0.0.1:5198/new-watch.html?edit=12345678-1234-4234-8234-123456789012');
await page.locator('[name=watchRequest]').waitFor({state:'visible'});
await page.locator('[name=watchRequest]').fill('The pound reaches 1.17 to the euro');
await page.locator('#newWatchSubmit').click();
await page.waitForURL('**/watch-detail.html?id=*');
await page.locator('#watchCheckNow').waitFor({state:'visible'});

await page.locator('#watchCheckNow').click();
await page.waitForFunction(() => /Target reached:|Seuil atteint/.test(document.body.innerText));
const body = await page.locator('body').innerText();
assert.match(body,/1 GBP ≈ 1.170001170001 EUR/);
assert.match(body,/(target|objectif) ≥ 1.17/);
assert.match(body,/2026-09-30/);
assert.doesNotMatch(body,/No meaningful update has been detected yet/);
assert.ok(body.includes(language === 'fr' ? 'Seuil atteint' : 'Target reached'));
const count = await page.evaluate(()=>JSON.parse(localStorage.getItem('watchAssistant.watches.v2.account.synthetic-user-a'))[0].updates.length);
assert.equal(count,1);
await page.locator('#watchCheckNow').click();
await page.waitForTimeout(400);
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('watchAssistant.watches.v2.account.synthetic-user-a'))[0].updates.length),1);
await page.screenshot({path:`/tmp/currency-ui-${language}.png`,fullPage:true});
await page.route('**/api/check-watch',route=>route.fulfill({json:{ criteria:{base:'GBP',quote:'EUR',target:'1.17',operator:'gte'}, checkedAt:'2026-10-01T09:44:00Z', observation:{base:'GBP',quote:'EUR',rate:'1.1699',date:'2026-09-30'} }}));
await page.locator('#watchCheckNow').click();
await page.waitForFunction(()=>/Target not reached|Seuil non atteint/.test(document.body.innerText));
assert.match(await page.locator('body').innerText(),/1.1699 EUR/);
await page.unroute('**/api/check-watch');
await page.route('**/api/check-watch',route=>route.fulfill({status:502,json:{code:'STALE_CURRENCY_DATA'}}));
await page.locator('#watchCheckNow').click();
await page.waitForFunction(()=>document.querySelector('#watchCheckFeedback')?.dataset.state === 'error');
assert.doesNotMatch(await page.locator('#watchCheckFeedback').innerText(),/No new updates/);
console.log(`PASS ${language}: edit → save → check → result; repeat deduplication; below target; verification failure`);
assert.deepEqual(errors,[]);
} finally { await browser.close(); }

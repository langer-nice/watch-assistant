// Local synthetic identities and intercepted APIs only; never send real emails.
// Start account-isolation-preview.mjs; configure PLAYWRIGHT_MODULE and optional BROWSER_EXECUTABLE.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.SYNTHETIC_ORIGIN || 'http://127.0.0.1:4178';
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const fixture = { id: 'synthetic-existing-watch', inputType: 'company', title: 'Synthetic company', request: 'Follow synthetic company', whyFollowing: 'Synthetic regression', category: 'general', status: 'watching', createdAt: '2026-09-20T08:00:00Z', company: { siren: '552005969', name: 'Synthetic company' }, updates: [] };
try {
  for (const lang of ['en', 'fr']) for (const width of [1280, 390]) {
    const copy = JSON.parse(await readFile(new URL(`../../locales/${lang}.json`, import.meta.url))).examples;
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: lang, reducedMotion: 'reduce' });
    const errors = [], mutations = [], monitoring = [];
    let populated = false;
    await context.route('**/*', route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) return route.fulfill({ status: 200, body: '', contentType: req.resourceType() === 'stylesheet' ? 'text/css' : 'application/javascript' });
      if (url.pathname.startsWith('/api/')) {
        if (req.method() !== 'GET') mutations.push(url.pathname);
        if (!['/api/company-watches','/api/media-watches'].includes(url.pathname)) monitoring.push(url.pathname);
        const accountA = req.headers().authorization === 'Bearer synthetic-no-network-token';
        return route.fulfill({ json: { watches: populated && accountA && url.pathname === '/api/company-watches' ? [fixture] : [], emailEnabled: false } });
      }
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    // Home counts new Watches for 24 hours; keep this fixture inside that window.
    await page.clock.setFixedTime(new Date('2026-09-20T09:00:00Z'));
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(origin + '/watches.html');
    await page.evaluate(lang => {
      localStorage.setItem('watchAssistant.language', lang);
      localStorage.setItem('watchAssistant.onboardingCompleted', 'true');
    }, lang);
    const examples = page.locator('#exampleWatches');
    const ready = async () => {
      await examples.locator('article').first().waitFor();
      assert.equal(await examples.locator('article.briefing-item').count(), 9);
      assert.equal(await examples.locator('a.briefing-item__link').count(), 6);
      assert.equal(await examples.locator('[data-watch-id]').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    };
    for (const mode of ['guest', 'empty', 'populated']) {
      populated = mode === 'populated';
      await page.evaluate(mode => {
        if (mode === 'guest') localStorage.removeItem('synthetic-preview-account');
        else localStorage.setItem('synthetic-preview-account', 'A');
      }, mode);
      await page.goto(origin + '/watches.html'); await ready();
      assert.equal(await page.locator('#watchList [data-watch-id]').count(), populated ? 1 : 0);
      assert.equal((await page.locator('#watchList').innerText()).includes('Aucune Watch active'), false);
      if (populated) {
        const bounds = await page.evaluate(() => {
          const real = document.querySelector('#watchList .briefing-item__link');
          const example = document.querySelector('#exampleWatches .briefing-item__link');
          return { real: real.getBoundingClientRect().toJSON(), example: example.getBoundingClientRect().toJSON(),
            padding: [real,example].map(el => getComputedStyle(el).padding),
            structure: [real,example].map(el => [...el.children].map(child => child.tagName + '.' + child.className)) };
        });
        assert.equal(bounds.real.x, bounds.example.x); assert.equal(bounds.real.width, bounds.example.width);
        assert.ok(bounds.real.bottom <= bounds.example.top);
        assert.deepEqual(bounds.padding[0], bounds.padding[1]); assert.deepEqual(bounds.structure[0], bounds.structure[1]);
      }
      await examples.locator('a').first().focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.exampleKey), 'company');
      const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));
      for (const card of await examples.locator('[aria-disabled]').all()) {
        await card.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Space'); await card.click({ force: true });
        assert.equal(page.url(), origin + '/watches.html');
        assert.equal(await card.getAttribute('href'), null);
        assert.ok(await card.getAttribute('aria-label').then(label => label.includes(copy.soon)));
        assert.equal(await card.locator('a,button').count(), 0);
      }
      assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storageBefore);
      await page.screenshot({ path: `/tmp/example-watches-${lang}-${width}-${mode}.png`, fullPage: true });
      const keys = mode === 'empty' ? ['news','company','regulation','concert','competitor','court'] : ['news'];
      for (const key of keys) {
        const row = examples.locator(`[data-example-key="${key}"]`);
        assert.ok((await row.getAttribute('aria-label')).startsWith(copy.badge));
        await row.focus(); await page.keyboard.press('Enter');
        const create = page.locator('[data-example-create]'); await create.waitFor();
        assert.equal(await page.locator('.top-navigation [data-profile-trigger]').isVisible(), true);
        assert.equal(await page.locator('.top-navigation [data-auth-root]').count(), 1);
        assert.equal(await create.innerText(), lang === 'fr' ? 'Créer une Watch à partir de cet exemple' : 'Create a Watch from this example');
        assert.equal(await page.locator('.detail-card__field p').innerText(), copy.items[key].request);
        assert.equal(await page.locator('#watchCheckNow, #watchEditAction, [data-watch-id]').count(), 0);
        assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storageBefore);
        if (key === 'news') await page.screenshot({ path: `/tmp/example-detail-${lang}-${width}-${mode}.png`, fullPage: true });
        await create.focus(); await page.keyboard.press('Enter');
        const input = page.locator(mode === 'guest' ? '#guestWatchInput' : '#newWatchInput'); await input.waitFor({ state: 'visible' });
        assert.equal(await input.inputValue(), copy.items[key].request);
        assert.equal(await input.evaluate(el => el === document.activeElement), true);
        if (mode !== 'guest') assert.equal(await page.locator('#newWatchSubmit').isEnabled(), true);
        await input.fill('Synthetic personalized draft');
        if (mode === 'guest') {
          assert.equal(await page.locator('[data-auth-gate]').isVisible(), false);
          await page.locator('[data-guest-form] button').click();
          await page.locator('#gateEmail').waitFor({ state: 'visible' });
          assert.equal(await page.evaluate(() => syntheticAuth.emailCalls.length), 0);
          await page.locator('[data-auth-back]').click();
          assert.equal(await input.inputValue(), 'Synthetic personalized draft');
          assert.equal(await input.evaluate(el => el === document.activeElement), true);
        }
        await page.locator('[id$="ExampleInstruction"] + a').click(); await ready();
      }
      await page.goto(origin + '/index.html');
      await page.waitForFunction(populated => populated ? document.querySelector('#homeNewCount')?.textContent === '1' : document.querySelector('#homeEmptyState')?.hidden === false, populated);
      assert.equal(await page.locator('#exampleWatches, #exampleGallery, [data-example-key]').count(), 0);
      assert.equal(await page.getByText(copy.items.news.request, { exact: true }).count(), 0);
      if (populated) assert.equal(await page.locator('#homeNewCount').innerText(), '1');
      console.log(`PASS ${lang} ${width} ${mode}: native list/detail, real rows first, keyboard, exact prefill, cancel, no side effects`);
    }
    // Account transition must scrub the example draft via existing editor isolation.
    await page.goto(origin + '/new-watch.html?example=news');
    await page.locator('#newWatchInput').waitFor({ state: 'visible' });
    await page.locator('#newWatchInput').fill('PRIVATE SYNTHETIC A DRAFT');
    populated = false;
    await page.evaluate(() => syntheticAuth.signIn('B'));
    await page.waitForURL(origin + '/new-watch.html');
    await page.locator('#newWatchInput').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#newWatchInput').inputValue(), '');
    await page.goto(origin + '/watches.html'); await ready();
    assert.equal(await page.locator('#watchList [data-watch-id]').count(), 0);
    await page.evaluate(() => syntheticAuth.signOut());
    await page.waitForFunction(() => Boolean(document.querySelector('[data-auth-label]')?.textContent));
    assert.equal(await page.locator('#watchList [data-watch-id]').count(), 0);
    assert.equal(await examples.locator('article').count(), 9);
    for (const key of ['flights','price','bitcoin']) {
      await page.goto(origin + `/watch-detail.html?example=${key}`);
      await page.getByText(copy.soon, { exact: true }).waitFor();
      assert.equal(await page.locator('[data-example-create]').count(), 0);
    }
    assert.deepEqual(mutations, []); assert.deepEqual(monitoring, []); assert.deepEqual(errors, []);
    console.log(`PASS ${lang} ${width}: account A/B/signout isolation, unavailable direct routes, zero mutations/monitoring/browser errors`);
    await context.close();
  }
} finally { await browser.close(); }

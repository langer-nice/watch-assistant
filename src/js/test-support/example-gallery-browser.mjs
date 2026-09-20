// Synthetic identities and intercepted APIs only. No email or business writes.
// Start account-isolation-preview.mjs; PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node this-file.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.SYNTHETIC_ORIGIN || 'http://127.0.0.1:4178';
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const fixture = { id: 'gallery-synthetic-watch', inputType: 'company', title: 'Synthetic existing company', request: 'Follow synthetic company', whyFollowing: 'Synthetic regression', category: 'general', status: 'watching', createdAt: '2026-09-20T08:00:00Z', company: { siren: '552005969', name: 'Synthetic company' }, updates: [] };
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
        return route.fulfill({ json: { watches: populated && url.pathname === '/api/company-watches' ? [fixture] : [], emailEnabled: false } });
      }
      return route.continue();
    });
    await context.addInitScript(() => {
      window.galleryStorageWrites = [];
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { window.galleryStorageWrites.push([key, value]); return original.call(this, key, value); };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(origin + '/index.html');
    await page.evaluate(lang => {
      localStorage.setItem('watchAssistant.language', lang);
      localStorage.setItem('watchAssistant.onboardingCompleted', 'true');
      localStorage.setItem('synthetic-preview-account', 'A');
    }, lang);
    await page.reload();
    const gallery = page.locator('#exampleGallery');
    await gallery.locator('a').first().waitFor();
    assert.equal(await page.locator('#homeEmptyState').isVisible(), true);
    assert.equal(await gallery.locator('a').count(), 6);
    assert.equal(await gallery.locator('h2').innerText(), copy.heading);
    assert.equal(await gallery.evaluate(el => el.classList.contains('example-gallery--compact')), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await gallery.locator('.example-gallery__grid').first().evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), width === 390 ? 1 : 2);
    const before = await page.evaluate(() => JSON.stringify(localStorage));
    const more = gallery.locator('button');
    await more.focus(); await page.keyboard.press('Enter');
    assert.equal(await more.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-disabled')), 'true');
    for (const card of await page.locator('#exampleGalleryMore article').all()) {
      await card.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
      assert.equal(page.url(), origin + '/index.html');
    }
    assert.equal(await page.locator('#exampleGalleryMore a, #exampleGalleryMore button').count(), 0);
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), before);
    await page.screenshot({ path: `/tmp/gallery-${lang}-${width}.png`, fullPage: true });
    await more.click(); assert.equal(await more.getAttribute('aria-expanded'), 'false');
    // Language changes update existing nodes without replacing the focused control.
    await more.focus();
    await page.evaluate(async lang => { const { setLanguage } = await import('/src/js/i18n.js'); setLanguage(lang === 'fr' ? 'en' : 'fr', { persist: false }); }, lang);
    assert.equal(await more.evaluate(el => el === document.activeElement), true);
    await page.evaluate(async lang => { const { setLanguage } = await import('/src/js/i18n.js'); setLanguage(lang, { persist: false }); }, lang);
    for (const id of ['news','company','regulation','concert','competitor','court']) {
      await page.locator(`a[href="new-watch.html?example=${id}"]`).click();
      const input = page.locator('#newWatchInput'); await input.waitFor({ state: 'visible' });
      assert.equal(await input.inputValue(), copy.items[id].request);
      assert.equal(await page.locator('#newWatchSubmit').isEnabled(), true);
      assert.equal(await input.evaluate(el => el.closest('.watch-composer').classList.contains('has-value')), true);
      assert.equal(await input.evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator('#newWatchInputExampleInstruction').innerText(), copy.instruction);
      assert.equal(new URL(page.url()).searchParams.has('example'), false);
      await page.locator('#newWatchInputExampleInstruction + a').click();
      await gallery.locator('a').first().waitFor();
    }
    populated = true;
    await page.reload(); await gallery.locator('a').first().waitFor();
    assert.equal(await gallery.evaluate(el => el.classList.contains('example-gallery--compact')), true);
    assert.equal(await page.locator('#homeEmptyState').isVisible(), false);
    await page.screenshot({ path: `/tmp/gallery-populated-${lang}-${width}.png`, fullPage: true });
    await page.goto(origin + '/watches.html');
    await page.getByText('Synthetic company', { exact: true }).first().waitFor();
    assert.equal(await page.locator('#exampleGallery').count(), 0);
    assert.equal(await page.getByText(copy.items.news.request, { exact: true }).count(), 0);
    // Guest follows the same draft -> auth -> back path without sending an email.
    populated = false;
    await page.evaluate(() => localStorage.removeItem('synthetic-preview-account'));
    await page.goto(origin + '/index.html'); await gallery.locator('a').first().waitFor();
    await gallery.locator('a').first().click();
    const guest = page.locator('#guestWatchInput'); await guest.waitFor({ state: 'visible' });
    assert.equal(await guest.inputValue(), copy.items.news.request);
    assert.equal(await guest.evaluate(el => el === document.activeElement), true);
    await guest.fill('Synthetic personalized draft');
    await page.locator('[data-guest-form] button').click();
    await page.locator('#gateEmail').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => syntheticAuth.emailCalls.length), 0);
    await page.locator('[data-auth-back]').click();
    assert.equal(await guest.inputValue(), 'Synthetic personalized draft');
    assert.equal(await guest.evaluate(el => el === document.activeElement), true);
    await page.locator('#guestWatchInputExampleInstruction + a').click();
    await gallery.locator('a').first().waitFor();
    await page.goto(origin + '/new-watch.html'); await guest.waitFor({ state: 'visible' });
    assert.equal(await guest.inputValue(), '');
    assert.deepEqual(mutations, []); assert.deepEqual(monitoring, []); assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => window.galleryStorageWrites.some(([k,v]) => /Synthetic personalized draft|\[a news topic|\[un sujet/.test(v))), false);
    console.log(`PASS ${lang} ${width}: empty/populated Home, all six prefills, focus, cancellation, keyboard/ARIA, guest auth/back, zero mutation/monitoring/email requests and browser errors`);
    await context.close();
  }
} finally { await browser.close(); }

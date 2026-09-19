// Isolated production-style startup with synthetic identity and local-only traffic.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs [BROWSER_EXECUTABLE=/path/to/chrome] node this-file
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({
  configFile: false,
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.VITE_VERCEL_ENV': JSON.stringify('production'),
    'import.meta.env.VITE_AUTH_MODE': JSON.stringify('magic-link'),
  },
  server: { host: '127.0.0.1', port: 0, hmr: false },
  plugins: [{ name: 'synthetic-startup-auth', enforce: 'pre', transform(_source, id) {
    if (id.endsWith('/src/js/supabase-client.js')) return `export { createSupabaseBrowserClient } from '/src/js/test-support/synthetic-auth-client.js';`;
  } }],
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  for (const lang of ['en', 'fr']) for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, locale: lang, reducedMotion: 'reduce' });
    const errors = [];
    await context.route('**/*', route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin !== origin) return route.fulfill({ status: 200, body: '', contentType: request.resourceType() === 'stylesheet' ? 'text/css' : 'application/javascript' }); // Local stand-ins for fonts/analytics; no external traffic.
      if (url.pathname.startsWith('/api/')) {
        assert.equal(request.method(), 'GET', 'startup must not mutate Watch data');
        return route.fulfill({ json: { watches: [], emailEnabled: false } });
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(origin + '/');
    await page.waitForURL('**/flow-3.html');
    await page.locator('[data-flow-language-selection]').waitFor({ state: 'visible' });
    assert.deepEqual(errors, [], 'fresh Home redirect must not reject startup');
    await page.locator(`[data-flow-language="${lang}"]`).click();
    for (const index of [0, 1]) {
      const next = page.locator(`[data-flow-3-screen="${index}"] [data-flow-3-next]:not([hidden]).is-visible`);
      await next.waitFor({ state: 'visible' }); await next.click();
    }
    const create = page.locator('[data-onboarding-first-watch]:not([hidden]).is-visible');
    await create.waitFor({ state: 'visible' }); await create.click();
    const input = page.locator('#guestWatchInput'); await input.waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-auth-gate]').isVisible(), false);
    await input.fill('Synthetic startup draft');
    assert.equal(await page.locator('[data-auth-gate]').isVisible(), false);
    await page.locator('[data-guest-form] button').click();
    await page.locator('#gateEmail').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-auth-gate] button[type="submit"]').innerText(), lang === 'fr' ? 'Recevoir un lien de connexion' : 'Email me a sign-in link');
    assert.equal(await page.evaluate(() => syntheticAuth.emailCalls.length), 0);
    await page.screenshot({ path: `/tmp/hotfix-startup-${lang}-${viewport.width}.png`, fullPage: true });
    await page.locator('[data-auth-back]').click(); assert.equal(await input.inputValue(), 'Synthetic startup draft');
    // A fresh document initialized with a mocked existing account must reveal the real editor.
    await page.evaluate(() => { localStorage.setItem('synthetic-preview-account', 'A'); localStorage.setItem('watchAssistant.onboardingCompleted', 'true'); });
    await page.goto(origin + '/new-watch.html');
    await page.locator('#newWatchInput').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#guestWatchInput').count(), 0);
    await page.goto(origin + '/index.html');
    const all = page.locator('a[href="watches.html"]').first(); await all.waitFor({ state: 'visible' }); await all.click();
    await page.waitForURL('**/watches.html');
    await page.waitForFunction(() => document.querySelector('[data-auth-label]')?.textContent === '');
    assert.deepEqual(errors, []);
    console.log(`PASS ${lang} ${viewport.width}: fresh / → onboarding → guest → Magic Link; signed-in editor/Home/All Watches; zero console/page errors`);
    await context.close();
  }
} finally { await browser?.close(); await server.close(); }

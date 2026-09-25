// Harness-only fixture injection and visual comparison; never uses public loaders.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseline = process.env.CAPTURE_BASELINE === '1';
const output = process.env.VISUAL_BASELINE_DIR || '/tmp/watch-preview-controls';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
const forbidden = ['Preview test data', 'Load test Watches', 'Reset and reload test Watches', 'Available only in local development and Vercel previews.'];
let cases = 0;
try {
  for (const env of ['local', 'preview', 'production']) {
    const server = await createServer({ configFile: false, root: process.env.FIXTURE_ROOT || process.cwd(),
      cacheDir: `/tmp/watch-controls-vite-${env}`,
      define: { 'import.meta.env.DEV': String(env === 'local'), 'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(env), 'import.meta.env.VITE_AUTH_MODE': JSON.stringify('otp') },
      server: { host: '127.0.0.1', port: 0, hmr: false },
      plugins: [{ name: 'synthetic-controls-check', enforce: 'pre', transform(_source, id) {
        if (id.endsWith('/src/js/supabase-client.js')) return `export { createSupabaseBrowserClient } from '/src/js/test-support/synthetic-auth-client.js';`;
      } }],
    });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    try {
      for (const lang of ['en', 'fr']) for (const width of [1280, 390]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, locale: lang, reducedMotion: 'reduce' });
        const errors = [];
        await context.addInitScript(lang => {
          localStorage.setItem('synthetic-preview-account', 'A');
          localStorage.setItem('watchAssistant.language', lang);
          localStorage.setItem('watchAssistant.onboardingCompleted', 'true');
        }, lang);
        await context.route('**/*', route => {
          const req = route.request(), url = new URL(req.url());
          if (url.origin !== origin) return route.fulfill({ status: 200, body: '', contentType: req.resourceType() === 'stylesheet' ? 'text/css' : 'application/javascript' });
          if (url.pathname.startsWith('/api/')) {
            assert.equal(req.method(), 'GET');
            return route.fulfill({ json: { watches: [], emailEnabled: false } });
          }
          return route.continue();
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
        for (const route of ['index', 'watches']) {
          await page.goto(`${origin}/${route}.html`);
          await page.waitForFunction(() => document.querySelector('[data-auth-label]')?.textContent === '');
          await page.locator(route === 'index' ? '#homeEmptyState' : '#exampleWatches').waitFor({ state: 'visible' });
          await page.evaluate(() => document.fonts.ready);
          // Let existing reveal transitions settle before comparing pixels.
          await page.waitForTimeout(600);
          const name = `${env}-${lang}-${width}-${route}`;
          if (baseline) {
            assert.equal(await page.locator('.dev-reset-control').count(), env === 'production' ? 0 : 1);
            await page.screenshot({ path: `${output}/${name}-original.png`, fullPage: true });
            // Normalize only the section intentionally deleted by this change.
            await page.locator('.dev-reset-control').evaluateAll(nodes => nodes.forEach(node => node.remove()));
          } else {
            assert.equal(await page.locator('.dev-reset-control, [data-load-preview-watches], [data-reset-preview-watches], [data-preview-watches-feedback]').count(), 0);
            const text = await page.locator('body').innerText();
            forbidden.forEach(value => assert.ok(!text.includes(value)));
            assert.equal(await page.evaluate(() => typeof window.watchAssistantResetDemo), 'undefined');
          }
          const geometry = await page.evaluate(() => [...document.body.querySelectorAll('*')].filter(el => el.getClientRects().length && !['SCRIPT', 'STYLE'].includes(el.tagName)).map(el => {
            const style = getComputedStyle(el);
            return { tag: el.tagName, className: el.className, text: el.children.length ? '' : el.textContent,
              rect: el.getBoundingClientRect().toJSON(),
              style: Object.fromEntries(['display','position','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','color','backgroundColor','padding','margin','border','borderRadius','boxShadow','gap'].map(key => [key, style[key]])) };
          }));
          const pixels = await page.screenshot({ path: `${output}/${name}-${baseline ? 'expected' : 'actual'}.png`, fullPage: true });
          if (baseline) {
            await writeFile(`${output}/${name}.png`, pixels);
            await writeFile(`${output}/${name}.json`, JSON.stringify(geometry));
          } else if (process.env.COMPARE_BASELINE === '1') {
            assert.deepEqual(geometry, JSON.parse(await readFile(`${output}/${name}.json`, 'utf8')), `${name}: all remaining layout and computed styles must match`);
          }
          cases++;
        }
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally { await server.close(); }
  }
  console.log(`PASS ${cases} Home/All Watches cases: local/preview/production × EN/FR × desktop/mobile; ${baseline ? 'baseline captured' : 'no public controls or reset, no console errors'}`);
} finally { await browser.close(); }

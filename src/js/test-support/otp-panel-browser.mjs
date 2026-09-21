// Local synthetic regression: never contacts a real email or auth provider.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = 'http://127.0.0.1:4178';
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
let cases = 0;
try {
  for (const lang of ['fr', 'en']) for (const width of [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({ status: 200, body: '', contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'application/javascript' }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.clock.install();
    await page.goto(`${origin}/watches.html?lang=${lang}`);
    await page.locator('[data-profile-trigger]').click();
    await page.locator('#authEmail').waitFor();
    const menu = page.locator('[data-profile-menu]');
    const style = () => menu.evaluate(el => {
      const s = getComputedStyle(el);
      return [el.getBoundingClientRect().width, s.padding, s.borderRadius, s.boxShadow, s.border];
    });
    const initialStyle = await style();
    await page.screenshot({ path: `/tmp/otp-email-${lang}-${width}.png` });
    await page.locator('#authEmail').fill('a@example.test');
    await page.locator('#authEmail').press('Enter');
    await page.locator('#authEmailCode').waitFor();
    const code = page.locator('#authEmailCode');
    assert.equal(await code.evaluate(el => el === document.activeElement), true);
    assert.deepEqual(await style(), initialStyle);
    assert.equal(await page.locator('[data-auth-resend]').count(), 0);
    assert.equal(await page.locator('[data-auth-cooldown]').count(), 0);
    assert.equal(await page.locator('[data-auth-resend-region]').evaluate(el => el.getBoundingClientRect().height), 0);
    const label = lang === 'fr' ? 'Utiliser une autre adresse' : 'Use another email';
    assert.equal(await page.locator('[data-auth-retry]').innerText(), label);
    const geometry = await menu.evaluate(el => {
      const text = el.querySelector('.auth-menu__email');
      const label = el.querySelector('label'), input = el.querySelector('input');
      const submit = el.querySelector('[type=submit]'), retry = el.querySelector('[data-auth-retry]');
      const rect = n => n.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(retry);
      return { gaps: [[text,input],[input,submit],[submit,retry]].map(([a,b])=>rect(b).top-rect(a).bottom),
        lines: range.getClientRects().length, fits: rect(el).left >= 0 && rect(el).right <= innerWidth,
        topGap: rect(text).top - rect(el).top,
        hiddenLabel: getComputedStyle(label).position === 'absolute' && rect(label).height === 1,
        placeholderWeight: getComputedStyle(input, '::placeholder').fontWeight };
    });
    assert.equal(await menu.locator('h1, h2').count(), 0);
    assert.equal(await page.getByRole('textbox', { name: lang === 'fr' ? 'Code de connexion à six chiffres' : 'Six-digit sign-in code', exact: true }).count(), 1);
    assert.equal(await code.getAttribute('placeholder'), lang === 'fr' ? 'Code à six chiffres' : 'Six-digit code');
    assert.equal(await menu.locator('[type=submit]').innerText(), lang === 'fr' ? 'Me connecter' : 'Sign in');
    assert.ok(geometry.hiddenLabel);
    assert.ok(geometry.topGap <= 18);
    assert.equal(geometry.placeholderWeight, '400');
    assert.ok(geometry.gaps.every(gap => gap >= 7 && gap <= 9), JSON.stringify(geometry));
    assert.equal(geometry.lines, 1); assert.ok(geometry.fits);
    await page.screenshot({ path: `/tmp/otp-before-${lang}-${width}.png` });
    await code.fill('123');
    await page.clock.fastForward(59000);
    assert.equal(await page.locator('[data-auth-resend]').count(), 0);
    await page.clock.fastForward(1000);
    await page.locator('[data-auth-resend]').waitFor();
    assert.equal(await code.inputValue(), '123');
    assert.equal(await code.evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('[data-auth-resend]').innerText(), lang === 'fr' ? 'Renvoyer le code' : 'Resend code');
    assert.equal(await page.evaluate(() => syntheticAuth.emailCalls.length), 1);
    await code.press('Tab');
    assert.equal(await page.locator('[type=submit]').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('[data-auth-retry]').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('[data-auth-retry]').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('[data-auth-resend]').evaluate(el => el === document.activeElement), true);
    await page.screenshot({ path: `/tmp/otp-after-${lang}-${width}.png` });
    await page.keyboard.press('Enter');
    await page.clock.runFor(500);
    await code.waitFor();
    assert.equal(await page.evaluate(() => syntheticAuth.emailCalls.length), 2);
    assert.equal(await page.locator('[data-auth-resend]').count(), 0);
    await code.fill('000000'); await code.press('Enter'); await page.clock.runFor(100);
    await page.locator('#authEmailError[role=alert]').waitFor();
    assert.equal(await code.evaluate(el => el === document.activeElement), true);
    await page.locator('[data-auth-retry]').click();
    assert.equal(await page.locator('#authEmail').inputValue(), '');
    assert.equal(await page.locator('#authEmail').evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('[type=submit]').isDisabled(), true);
    // 200% zoom-equivalent CSS viewport: the 320px case covers a 640px window at 200%.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    cases++; console.log(`PASS compact OTP ${lang} ${width}: dimensions, spacing, expiry, focus, keyboard, resend, errors, recovery`);
    await context.close();
  }
  console.log(`PASS ${cases} visual/functional scenarios; zero console errors; synthetic email only`);
} finally { await browser.close(); }

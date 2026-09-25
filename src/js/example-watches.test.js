import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { parseHTML } from 'linkedom';
import { renderSummaryCard } from './watch-summary-card.js';
import { renderWatchCardLink } from './watch-card-link.js';
register('./test-support/json-module-loader.js', import.meta.url);
const { renderExampleWatches, renderExampleDetail, applyExampleToEditor, activeExampleIds, comingExampleIds } = await import('./example-watches.js');
const { setLanguage } = await import('./i18n.js');
const { createGuestEditor } = await import('./guest-editor.js');
const messages = Object.fromEntries(await Promise.all(['en', 'fr'].map(async lang => [lang, JSON.parse(await readFile(new URL(`../locales/${lang}.json`, import.meta.url)))])));
let originals;
test.beforeEach(() => {
  originals = Object.fromEntries(['window','document','Event','CustomEvent','localStorage','sessionStorage','fetch'].map(k => [k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const { window, document } = parseHTML('<html><body><section id="exampleWatches"></section><section data-editor-content><div class="watch-composer"><textarea id="newWatchInput"></textarea></div></section></body></html>');
  // Linkedom needs native dataset semantics for digit-containing i18n attributes.
  Object.defineProperty(window.Element.prototype, 'dataset', { configurable: true, get() {
    const element = this;
    const attr = key => 'data-' + String(key).replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    return new Proxy({}, { get: (_, key) => element.getAttribute(attr(key)) ?? undefined,
      set: (_, key, value) => { element.setAttribute(attr(key), String(value)); return true; } });
  }});
  Object.assign(globalThis, { window, document, Event: window.Event, CustomEvent: window.CustomEvent });
  window.HTMLElement.prototype.focus = function () { document.focusedElement = this; };
  window.location = new URL('https://example.test/new-watch.html');
  window.history = { state: null, replaceState(_s,_t,path) { window.location = new URL(path, window.location); } };
  const forbidden = () => { throw new Error('Gallery cannot access storage or network'); };
  globalThis.localStorage = globalThis.sessionStorage = { getItem: forbidden, setItem: forbidden, removeItem: forbidden };
  globalThis.fetch = forbidden;
  setLanguage('en', { persist: false });
});
test.afterEach(() => {
  for (const [key, descriptor] of Object.entries(originals)) {
    if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key];
  }
});
test('static examples use shared Watch rows, remain visible and do not access persistence/network', () => {
  renderExampleWatches();
  const root = document.querySelector('#exampleWatches');
  assert.equal(root.querySelectorAll('article.briefing-item').length, 9);
  assert.equal(root.querySelectorAll('a.briefing-item__link').length, 6);
  assert.equal(root.querySelectorAll('[data-watch-id]').length, 0);
  assert.equal(root.querySelectorAll('button').length, 0);
  const first = root.querySelector('a'); first.focus();
  renderExampleWatches(); assert.equal(root.querySelector('a'), first);
  assert.equal(document.focusedElement, first);
  for (const card of root.querySelectorAll('[aria-disabled]')) {
    assert.equal(card.getAttribute('aria-disabled'), 'true');
    assert.equal(card.getAttribute('tabindex'), '0');
    assert.equal(card.getAttribute('href'), null);
    assert.equal(card.querySelector('a,button'), null);
    card.click(); assert.equal(window.location.search, '');
  }
});
for (const lang of ['en', 'fr']) test(`${lang} active detail and unavailable routes never expose real controls`, () => {
  setLanguage(lang, { persist: false });
  const detail = document.createElement('main'); detail.className = 'page--detail'; document.body.append(detail);
  for (const key of [...activeExampleIds, ...comingExampleIds, 'unknown']) {
    detail.innerHTML = '<nav class="top-navigation"><button data-profile-trigger>Account</button></nav><button id="watchCheckNow">Real action</button>';
    const navigation = detail.querySelector('nav');
    window.location = new URL(`https://example.test/watch-detail.html?example=${key}`);
    assert.equal(renderExampleDetail(), true);
    assert.equal(detail.querySelector('#watchCheckNow'), null);
    assert.equal(detail.querySelector('nav'), navigation);
    const create = detail.querySelector('[data-example-create]');
    assert.equal(Boolean(create), activeExampleIds.includes(key));
    if (create) {
      assert.equal(create.textContent, lang === 'fr' ? 'Créer une Watch à partir de cet exemple' : 'Create a Watch from this example');
      assert.equal(create.getAttribute('href'), `new-watch.html?example=${key}`);
      assert.equal(detail.querySelector('.detail-card__field p').textContent, messages[lang].examples.items[key].request);
    }
  }
});
for (const lang of ['en','fr']) test(`exact ${lang} prefill, focus, instruction, one-time consume and cancel`, () => {
  setLanguage(lang, { persist: false });
  for (const id of activeExampleIds) {
    const input = document.querySelector('textarea'); input.value = '';
    window.location = new URL(`https://example.test/new-watch.html?example=${id}`);
    assert.equal(applyExampleToEditor(input), true);
    assert.equal(input.value, messages[lang].examples.items[id].request);
    assert.equal(document.focusedElement, input);
    assert.equal(input.nextElementSibling.textContent, messages[lang].examples.instruction);
    assert.equal(input.getAttribute('aria-describedby').includes(input.nextElementSibling.id), true);
    assert.equal(window.location.search, '');
    input.value = 'My edits';
    assert.equal(applyExampleToEditor(input), false);
    input.nextElementSibling.nextElementSibling.click();
    assert.equal(input.value, '');
    input.parentElement.querySelectorAll('p,a').forEach(el => el.remove());
  }
});
test('unknown, coming-soon and edit URLs cannot seed an editor; existing drafts are preserved', () => {
  const input = document.querySelector('textarea');
  for (const query of [...comingExampleIds.map(id => `example=${id}`), 'example=unknown', 'example=news&edit=real']) {
    window.location = new URL(`https://example.test/new-watch.html?${query}`);
    assert.equal(applyExampleToEditor(input), false);
    assert.equal(input.value, '');
  }
  window.location = new URL('https://example.test/new-watch.html?example=news');
  input.value = 'Existing draft'; assert.equal(applyExampleToEditor(input), false);
  assert.equal(input.value, 'Existing draft');
});
test('guest uses existing in-memory submission, back preserves edits, destroy discards', () => {
  window.location = new URL('https://example.test/new-watch.html?example=news');
  let submitted;
  const guest = createGuestEditor({ content: document.querySelector('[data-editor-content]'), onSubmit: value => { submitted = value; }, onInvalidate() {} });
  const input = document.querySelector('#guestWatchInput');
  assert.equal(guest.isCurrent(), true);
  assert.equal(input.value, messages.en.examples.items.news.request);
  input.value = 'Personalized request';
  input.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(submitted, 'Personalized request');
  guest.hide(); guest.show();
  assert.equal(input.value, 'Personalized request');
  assert.equal(document.focusedElement, input);
  guest.destroy(); assert.equal(input.value, '');
  assert.equal(document.querySelector('[data-guest-editor]'), null);
});
test('examples are All-Watches-only, after real rows and outside all data pipelines', async () => {
  const home = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /exampleGallery|exampleWatches/);
  const list = await readFile(new URL('../../watches.html', import.meta.url), 'utf8');
  assert.ok(list.indexOf('id="watchList"') < list.indexOf('id="exampleWatches"'));
  const navigation = await readFile(new URL('navigation.js', import.meta.url), 'utf8');
  const listRenderer = navigation.slice(navigation.indexOf('const renderWatchList'), navigation.indexOf('const renderWatchDetail'));
  assert.ok(listRenderer.indexOf('renderExampleWatches()') < listRenderer.indexOf('if (watches.length === 0)'));
  assert.doesNotMatch(listRenderer, /watches.empty/);
  assert.ok(navigation.indexOf('if (renderExampleDetail()) return;') < navigation.indexOf('const watchId = getWatchIdFromLocation(window.location);', navigation.indexOf('const renderWatchDetail')));
  for (const file of ['watch-storage.js','report-storage.js','watch-model.js','watch-monitoring.js']) {
    assert.doesNotMatch(await readFile(new URL(file, import.meta.url), 'utf8'), /example-watches|activeExampleIds/);
  }
  const source = await readFile(new URL('example-watches.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\(|supabase|addWatch|monitorWatch|sendEmail|data-watch-id/);
  assert.match(source, /renderSummaryCard\(/);
  assert.match(navigation, /return renderSummaryCard\(/);
});

test('real and example rows share exactly the same structure; real metadata/navigation remain intact', () => {
  renderExampleWatches();
  const holder = document.createElement('div');
  holder.innerHTML = renderSummaryCard({ title: 'Real title', category: 'General', supportingText: 'Real request',
    timestamp: '20 September', statusPresentation: { modifier: 'new', label: 'New' },
    renderLink: content => renderWatchCardLink({ watchId: 'real-watch', className: 'briefing-item__link', content }),
  });
  const real = holder.querySelector('a');
  const example = document.querySelector('#exampleWatches a');
  assert.equal(real.getAttribute('href'), 'watch-detail.html?id=real-watch');
  assert.equal(real.querySelector('.briefing-item__time').textContent, '20 September');
  assert.equal(real.querySelector('.status-label').textContent, 'New');
  assert.equal(example.querySelector('.briefing-item__time, .status-label'), null);
  assert.deepEqual([...real.children].map(el => [el.tagName, el.className]), [...example.children].map(el => [el.tagName, el.className]));
  assert.equal(real.parentElement.className, example.parentElement.className);
});

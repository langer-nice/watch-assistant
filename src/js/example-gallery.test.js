import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { parseHTML } from 'linkedom';
register('./test-support/json-module-loader.js', import.meta.url);
const { renderExampleGallery, applyExampleToEditor, activeExampleIds, comingExampleIds } = await import('./example-gallery.js');
const { setLanguage } = await import('./i18n.js');
const { createGuestEditor } = await import('./guest-editor.js');
const messages = Object.fromEntries(await Promise.all(['en', 'fr'].map(async lang => [lang, JSON.parse(await readFile(new URL(`../locales/${lang}.json`, import.meta.url)))])));
let originals;
test.beforeEach(() => {
  originals = Object.fromEntries(['window','document','Event','CustomEvent','localStorage','sessionStorage','fetch'].map(k => [k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const { window, document } = parseHTML('<html><body><section id="exampleGallery"></section><section data-editor-content><div class="watch-composer"><textarea id="newWatchInput"></textarea></div></section></body></html>');
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
test('empty Home gallery, compact populated Home, stable focus and expansion; no persistence or requests', () => {
  renderExampleGallery();
  const root = document.querySelector('#exampleGallery');
  assert.equal(root.querySelectorAll('a').length, 6);
  assert.equal(root.classList.contains('example-gallery--compact'), false);
  const more = root.querySelector('button');
  const extra = document.querySelector('#exampleGalleryMore');
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  assert.equal(extra.hidden, true);
  more.focus(); more.click();
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  assert.equal(extra.hidden, false);
  renderExampleGallery({ hasWatches: true });
  assert.equal(root.classList.contains('example-gallery--compact'), true);
  assert.equal(document.focusedElement, more);
  assert.equal(root.querySelector('button'), more);
  for (const card of extra.children) {
    assert.equal(card.getAttribute('aria-disabled'), 'true');
    assert.equal(card.getAttribute('tabindex'), '0');
    assert.equal(card.querySelector('a, button'), null);
    card.click(); assert.equal(window.location.search, '');
  }
  more.click(); assert.equal(extra.hidden, true);
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
test('gallery is Home-only and cannot enter Watch/report/monitoring pipelines', async () => {
  const home = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.ok(home.includes('id="exampleGallery"'));
  for (const file of ['watches.html','watch-detail.html']) {
    assert.doesNotMatch(await readFile(new URL(`../../${file}`, import.meta.url), 'utf8'), /exampleGallery/);
  }
  for (const file of ['watch-storage.js','report-storage.js','watch-model.js','watch-monitoring.js']) {
    assert.doesNotMatch(await readFile(new URL(file, import.meta.url), 'utf8'), /example-gallery|activeExampleIds/);
  }
  const source = await readFile(new URL('example-gallery.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\(|supabase|addWatch|monitorWatch|sendEmail/);
});

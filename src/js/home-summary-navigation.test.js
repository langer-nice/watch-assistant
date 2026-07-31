import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getFirstRenderedHomeWatch,
  navigateToHomeWatchStatus,
} from './home-summary-navigation.js';

const createRoot = (matches = {}) => ({
  querySelector: (selector) => matches[selector] || null,
});

test('summary navigation resolves the first matching Watch from the current rendered order', () => {
  const calls = [];
  const firstUpdated = {
    scrollIntoView: (options) => calls.push(['scroll', options]),
    querySelector: () => ({ focus: (options) => calls.push(['focus', options]) }),
  };
  const root = createRoot({ '[data-home-watch-status="updated"]': firstUpdated });

  assert.equal(getFirstRenderedHomeWatch(root, 'updated'), firstUpdated);
  assert.equal(navigateToHomeWatchStatus(root, 'updated'), true);
  assert.deepEqual(calls, [
    ['scroll', { behavior: 'smooth', block: 'start' }],
    ['focus', { preventScroll: true }],
  ]);
});

test('zero or unknown status destinations do not navigate', () => {
  const root = createRoot();
  assert.equal(navigateToHomeWatchStatus(root, 'attention'), false);
  assert.equal(navigateToHomeWatchStatus(root, 'unknown'), false);
  assert.equal(getFirstRenderedHomeWatch(root, 'unknown'), null);
});

test('Home markup and handlers expose accessible live summary navigation and sorting', async () => {
  const [html, navigation, en, fr] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../locales/fr.json', import.meta.url), 'utf8'),
  ]);

  assert.equal((html.match(/data-home-status-target=/g) || []).length, 2);
  assert.match(html, /<button[^>]+data-home-status-target="attention"/);
  assert.match(html, /<select id="homeWatchSort">[\s\S]*?value="needs-attention-first"[\s\S]*?value="updated-first"[\s\S]*?value="most-recent"[\s\S]*?value="oldest-first"/);
  assert.match(navigation, /trigger\.disabled = count === 0/);
  assert.match(navigation, /navigateToHomeWatchStatus\(document, trigger\.dataset\.homeStatusTarget\)/);
  assert.match(navigation, /setHomeSortPreference\(sortControl\.value\);[\s\S]*?renderHomeBriefing\(\)/);
  for (const messages of [JSON.parse(en), JSON.parse(fr)]) {
    assert.ok(messages.home.sortBy);
    assert.ok(messages.home.sortAttentionFirst);
    assert.ok(messages.home.sortUpdatedFirst);
    assert.ok(messages.home.sortMostRecent);
    assert.ok(messages.home.sortOldestFirst);
  }
});

test('compact Home cards retain content, navigation, separators, and responsive overflow rules', async () => {
  const [navigation, styles] = await Promise.all([
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../scss/components/_briefing-item.scss', import.meta.url), 'utf8'),
  ]);
  const renderer = navigation.match(/const renderHomeWatchCards =[\s\S]*?const renderHomeBriefing =/)?.[0] || '';

  assert.match(renderer, /renderWatchCardLink\(\{[\s\S]*?watchId: watch\.id/);
  assert.match(renderer, /briefing-item__header[\s\S]*?briefing-item__metadata[\s\S]*?category-label[\s\S]*?briefing-item__time[\s\S]*?briefing-item__statuses[\s\S]*?status-label[\s\S]*?<h2>[\s\S]*?supportingText/);
  assert.equal((renderer.match(/briefing-item__time/g) || []).length, 1);
  assert.match(renderer, /data-home-watch-status="\$\{homeStatus\}"/);
  assert.match(styles, /\.briefing-item \+ \.briefing-item\s*\{[\s\S]*?border-top:\s*1px solid var\(--color-divider\)/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(styles, /\.briefing-item__statuses\s*\{[\s\S]*?justify-self:\s*end/);
  assert.match(styles, /\.briefing-item__metadata\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden/);
});

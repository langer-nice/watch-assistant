import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getFirstRenderedHomeWatch,
  getHomeStatusTargetId,
  navigateToHomeWatchStatus,
} from './home-summary-navigation.js';

const createRoot = (matches = {}) => ({
  querySelector: (selector) => matches[selector] || null,
});

test('every Home summary status scrolls and focuses its first stable target identically', () => {
  const expectedIds = {
    attention: 'home-needs-attention',
    updated: 'home-updated',
    new: 'home-new',
  };

  Object.entries(expectedIds).forEach(([status, targetId]) => {
    const calls = [];
    const firstVisibleWatch = {
      scrollIntoView: (options) => calls.push(['scroll', options]),
      querySelector: () => ({ focus: (options) => calls.push(['focus', options]) }),
    };
    const selector = `#${targetId}[data-home-watch-status="${status}"]`;
    const root = createRoot({ [selector]: firstVisibleWatch });

    assert.equal(getHomeStatusTargetId(status), targetId);
    assert.equal(getFirstRenderedHomeWatch(root, status), firstVisibleWatch);
    assert.equal(navigateToHomeWatchStatus(root, status), true);
    assert.deepEqual(calls, [
      ['scroll', { behavior: 'smooth', block: 'start' }],
      ['focus', { preventScroll: true }],
    ]);
  });
});

test('zero or unknown status destinations do not navigate', () => {
  const root = createRoot();
  assert.equal(navigateToHomeWatchStatus(root, 'attention'), false);
  assert.equal(navigateToHomeWatchStatus(root, 'updated'), false);
  assert.equal(navigateToHomeWatchStatus(root, 'new'), false);
  assert.equal(navigateToHomeWatchStatus(root, 'unknown'), false);
  assert.equal(getFirstRenderedHomeWatch(root, 'unknown'), null);
  assert.equal(getHomeStatusTargetId('unknown'), null);
});

test('Home exposes accessible status navigation and keeps its fixed dashboard priority', async () => {
  const [html, navigation, en, fr] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../locales/fr.json', import.meta.url), 'utf8'),
  ]);

  assert.equal((html.match(/data-home-status-target=/g) || []).length, 3);
  assert.equal((html.match(/<select id="homeWatchSort">/g) || []).length, 0);
  assert.match(html, /<button[^>]+data-home-status-target="attention"/);
  assert.match(html, /<button[^>]+data-home-status-target="updated"/);
  assert.match(html, /<button[^>]+data-home-status-target="new"/);
  assert.match(navigation, /trigger\.disabled = count === 0/);
  assert.match(navigation, /\['new', newlyCreatedWatches\.length, newLabel\]/);
  assert.match(navigation, /navigateToHomeWatchStatus\(document, trigger\.dataset\.homeStatusTarget\)/);
  assert.match(navigation, /list\.innerHTML = renderHomeWatchCards\(watches, statusById\)/);
  const english = JSON.parse(en);
  const french = JSON.parse(fr);
  assert.deepEqual([
    english.home.sortAttentionFirst,
    english.home.sortUpdatedFirst,
    english.home.sortMostRecent,
    english.home.sortOldestFirst,
  ], ['Needs attention', 'Updated', 'Most recent', 'Oldest first']);
  assert.deepEqual([
    french.home.sortAttentionFirst,
    french.home.sortUpdatedFirst,
    french.home.sortMostRecent,
    french.home.sortOldestFirst,
  ], ['Attention requise', 'Mises à jour', 'Plus récentes', 'Plus anciennes']);
  for (const messages of [english, french]) {
    assert.ok(messages.home.sortBy);
    assert.ok(messages.home.sortAttentionFirst);
    assert.ok(messages.home.sortUpdatedFirst);
    assert.ok(messages.home.sortMostRecent);
    assert.ok(messages.home.sortOldestFirst);
  }
});

test('Home summary exposes an exact conditional New count', async () => {
  const [html, navigation, en, fr, styles] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../locales/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../locales/fr.json', import.meta.url), 'utf8'),
    readFile(new URL('../scss/components/_briefing-summary.scss', import.meta.url), 'utf8'),
  ]);
  const english = JSON.parse(en);
  const french = JSON.parse(fr);

  assert.match(html, /id="homeNewSummary" hidden[\s\S]*?<button[^>]+data-home-status-target="new"[\s\S]*?id="homeNewCount"[\s\S]*?id="homeNewLabel"/);
  assert.match(navigation, /newSummary\.hidden = newlyCreatedWatches\.length === 0/);
  assert.match(navigation, /newCount\.textContent = String\(newlyCreatedWatches\.length\)/);
  assert.match(navigation, /pluralKey\('home\.newLabel', newlyCreatedWatches\.length\)/);
  assert.match(navigation, /getHomeStatusTargetId\(homeStatus\)/);
  assert.match(navigation, /const articleId = isFirstStatusWatch \? statusTargetId : ''/);
  assert.doesNotMatch(navigation, /`(?:home|all)-watch-\$\{/);
  assert.match(navigation, /const card = renderSummaryWatchCard\([\s\S]*?if \(card && isFirstStatusWatch\) renderedStatusTargets\.add\(homeStatus\)/);
  assert.deepEqual(english.home.newLabel, { one: 'new', other: 'new' });
  assert.deepEqual(french.home.newLabel, { one: 'nouvelle', other: 'nouvelles' });
  assert.match(styles, /\.briefing-summary__status--new \.briefing-summary__dot\s*\{[\s\S]*?color:\s*var\(--color-status-success\)/);
});

test('All Watches Sort by stays a compact native row with a subtle separator at mobile widths', async () => {
  const styles = await readFile(new URL('../scss/pages/_home.scss', import.meta.url), 'utf8');

  assert.match(styles, /\.home-watch-sort\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*flex-end;[\s\S]*?gap:\s*var\(--space-xs\);[\s\S]*?border-bottom:\s*1px solid var\(--color-divider\)/);
  assert.match(styles, /\.home-watch-sort select\s*\{[\s\S]*?width:\s*auto;[\s\S]*?max-width:\s*calc\(100% - 4\.75rem\)/);
  assert.doesNotMatch(styles, /\.home-watch-sort\s*\{[^}]*flex-direction:\s*column/);
  assert.doesNotMatch(styles, /\.home-watch-sort select\s*\{[^}]*width:\s*100%/);
});

test('compact Home cards retain content, navigation, separators, and responsive overflow rules', async () => {
  const [navigation, styles] = await Promise.all([
    readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('../scss/components/_briefing-item.scss', import.meta.url), 'utf8'),
  ]);
  const sharedRenderer = navigation.match(/const renderSummaryWatchCard =[\s\S]*?const renderHomeWatchCards =/)?.[0] || '';
  const renderer = navigation.match(/const renderHomeWatchCards =[\s\S]*?const renderHomeBriefing =/)?.[0] || '';

  assert.match(sharedRenderer, /renderWatchCardLink\(\{[\s\S]*?watchId: watch\.id/);
  assert.match(sharedRenderer, /briefing-item__header[\s\S]*?briefing-item__metadata[\s\S]*?category-label[\s\S]*?briefing-item__time[\s\S]*?briefing-item__statuses[\s\S]*?status-label[\s\S]*?<h2>[\s\S]*?supportingText/);
  assert.equal((sharedRenderer.match(/briefing-item__time/g) || []).length, 1);
  assert.match(renderer, /renderSummaryWatchCard\([\s\S]*?data-home-watch-status/);
  assert.match(styles, /\.briefing-item \+ \.briefing-item\s*\{[\s\S]*?border-top:\s*1px solid var\(--color-divider\)/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(styles, /\.briefing-item__statuses\s*\{[\s\S]*?justify-self:\s*end/);
  assert.match(styles, /\.briefing-item__metadata\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden/);
});

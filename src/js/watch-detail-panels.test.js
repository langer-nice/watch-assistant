import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('comparable Watch Detail white panels share one full-width header separator', async () => {
  const [html, cardStyles] = await Promise.all([
    read('../../watch-detail.html'),
    read('../scss/components/_detail-card.scss'),
  ]);
  const comparablePanelIds = [
    'watchBriefing',
    'watchWhyToday',
    'watchTimelineSection',
    'watchFacts',
    'watchMonitoringUpdates',
  ];

  comparablePanelIds.forEach((id) => {
    const openingTag = html.match(new RegExp(`<section[^>]*id="${id}"[^>]*>`))?.[0] || '';
    assert.match(openingTag, /class="[^"]*\bdetail-panel\b[^"]*"/);
  });
  assert.match(cardStyles, /\.detail-panel > \.section-heading\s*\{[\s\S]*?margin:\s*0;[\s\S]*?padding:\s*var\(--space-lg\) var\(--space-lg\) var\(--space-md\);[\s\S]*?border-bottom:\s*1px solid var\(--color-divider\)/);
  assert.doesNotMatch(cardStyles, /\.detail-card__metadata\s*\{[^}]*border-top/);
});

test('Update History uses shared panel spacing and content typography with secondary metadata', async () => {
  const [navigation, detailStyles, timelineStyles] = await Promise.all([
    read('./navigation.js'),
    read('../scss/pages/_watch-detail.scss'),
    read('../scss/components/_timeline.scss'),
  ]);

  assert.match(navigation, /<p class="monitoring-update__description">\$\{escapeHtml\(summary\)\}<\/p>/);
  assert.match(detailStyles, /\.monitoring-updates > ul\s*\{[\s\S]*?padding:\s*var\(--space-lg\)/);
  assert.match(detailStyles, /\.monitoring-update__description\s*\{[\s\S]*?font-size:\s*var\(--font-size-sm\);[\s\S]*?font-weight:\s*var\(--font-weight-regular\);[\s\S]*?line-height:\s*1\.65/);
  assert.match(detailStyles, /\.monitoring-update \.monitoring-update__metadata\s*\{[\s\S]*?color:\s*var\(--color-text-subtle\);[\s\S]*?font-size:\s*0\.75rem/);
  assert.match(detailStyles, /\.monitoring-update__description\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(timelineStyles, /\.timeline ol\s*\{[\s\S]*?padding:\s*var\(--space-lg\)/);
  assert.doesNotMatch(detailStyles, /\.monitoring-update p\s*\{/);
});

test('remaining Watch Facts and relocated Check now retain their validated layout rules', async () => {
  const [cardStyles, detailStyles] = await Promise.all([
    read('../scss/components/_detail-card.scss'),
    read('../scss/pages/_watch-detail.scss'),
  ]);

  assert.match(cardStyles, /\.detail-card__metadata\s*\{[\s\S]*?gap:\s*var\(--space-xl\);[\s\S]*?padding:\s*var\(--space-lg\)/);
  assert.match(cardStyles, /@media \(min-width: 36rem\)[\s\S]*?\.detail-panel > \.section-heading[\s\S]*?padding-inline:\s*var\(--space-xl\)/);
  assert.match(detailStyles, /\.watch-fact-check__button\s*\{[\s\S]*?width:\s*fit-content;[\s\S]*?box-shadow:\s*none/);
});

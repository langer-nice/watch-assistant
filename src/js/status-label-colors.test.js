import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readStyles = async () => Promise.all([
  readFile(new URL('../scss/tokens/_colors.scss', import.meta.url), 'utf8'),
  readFile(new URL('../scss/components/_status-label.scss', import.meta.url), 'utf8'),
  readFile(new URL('./navigation.js', import.meta.url), 'utf8'),
]);

const relativeLuminance = (hex) => {
  const channels = hex.match(/[a-f\d]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
};

const contrast = (first, second) => {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
};

test('Updated reuses the approved Home indicator blue without a new colour token', async () => {
  const [tokens, labels] = await readStyles();
  const updatedRule = labels.match(/\.status-label--updated\s*\{[\s\S]*?\}/)?.[0] || '';

  assert.match(tokens, /--color-indicator-updated:\s*#2e7dd7/);
  assert.match(tokens, /--color-status-update:\s*var\(--color-indicator-updated\)/);
  assert.match(tokens, /--color-status-update-bg:\s*var\(--color-indicator-updated\)/);
  assert.match(tokens, /--color-status-update-text:\s*var\(--color-text-on-dark\)/);
  assert.doesNotMatch(tokens, /--color-status-(?:updated-blue|update-bright|bright-blue):/);
  assert.doesNotMatch(updatedRule, /success|green|indicator-unchanged/);
  assert.match(updatedRule, /background:\s*var\(--color-status-update-bg\)/);
});

test('Needs attention retains its established WCAG AA contrast', () => {
  assert.ok(contrast('ffffff', '9f4f48') >= 4.5);
});

test('Needs attention uses the existing strong red token with white text', async () => {
  const [tokens, labels] = await readStyles();
  const attentionRule = labels.match(/\.status-label--attention\s*\{[\s\S]*?\}/)?.[0] || '';

  assert.match(tokens, /--color-status-action:\s*var\(--color-attention-strong\)/);
  assert.match(attentionRule, /color:\s*var\(--color-text-on-dark\)/);
  assert.match(attentionRule, /background:\s*var\(--color-status-action\)/);
});

test('All Watches restores the validated Watching badge without changing Home selection', async () => {
  const [, labels, navigation] = await readStyles();
  const homeRenderer = navigation.match(/const renderHomeWatchCards =[\s\S]*?const renderHomeBriefing =/)?.[0] || '';
  const allRenderer = navigation.match(/const renderWatchList = \(\) => \{[\s\S]*?const renderWatchDetail/)?.[0] || '';

  assert.match(homeRenderer, /const homeStatus = statusById\.get\(watch\.id\);[\s\S]*?if \(!homeStatus\) return ''/);
  assert.doesNotMatch(homeRenderer, /status-label--unchanged|data-home-watch-status="unchanged"/);
  assert.match(allRenderer, /const status = statusById\.get\(watch\.id\)/);
  assert.doesNotMatch(allRenderer, /monitoringHealthStatus|renderCompanyStatusBadge/);
  assert.match(labels, /\.status-label--watching,[\s\S]*?border-color:\s*var\(--color-status-state-border\);[\s\S]*?background:\s*var\(--color-status-state-bg\)/);
});

test('New reuses the existing success badge while Updated remains blue', async () => {
  const [tokens, labels, navigation] = await readStyles();
  const statusRenderer = navigation.match(/const getSummaryCardStatus =[\s\S]*?const renderSummaryWatchCard/)?.[0] || '';

  assert.match(statusRenderer, /getWatchStatusPresentation\(status, t\)/);
  assert.match(labels, /\.status-label--stable\s*\{[\s\S]*?background:\s*var\(--color-status-success\)/);
  assert.match(tokens, /--color-status-update-bg:\s*var\(--color-indicator-updated\)/);
});

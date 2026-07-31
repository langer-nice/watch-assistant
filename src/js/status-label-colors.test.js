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

test('Updated uses a lighter primary-blue semantic fill rather than primary or green', async () => {
  const [tokens, labels] = await readStyles();
  const updatedRule = labels.match(/\.status-label--updated\s*\{[\s\S]*?\}/)?.[0] || '';

  assert.match(tokens, /--color-action:\s*var\(--color-ink-blue-600\)/);
  assert.match(tokens, /--color-status-update-bg:\s*color-mix\(in srgb, var\(--color-action\) 96%, var\(--color-surface\)\)/);
  assert.match(tokens, /--color-status-update-text:\s*var\(--color-text-on-dark\)/);
  assert.doesNotMatch(tokens, /--color-status-update-bg:\s*var\(--color-action\)/);
  assert.doesNotMatch(updatedRule, /success|green|indicator-unchanged/);
  assert.match(updatedRule, /background:\s*var\(--color-status-update-bg\)/);
});

test('both emphasized status treatments meet WCAG AA contrast', () => {
  // #64788a is the rounded sRGB result of the 96% #5e7285 primary-blue mix on white.
  assert.ok(contrast('ffffff', '64788a') >= 4.5);
  assert.ok(contrast('ffffff', '9f4f48') >= 4.5);
  assert.notEqual('64788a', '5e7285');
});

test('Needs attention uses the existing strong red token with white text', async () => {
  const [tokens, labels] = await readStyles();
  const attentionRule = labels.match(/\.status-label--attention\s*\{[\s\S]*?\}/)?.[0] || '';

  assert.match(tokens, /--color-status-action:\s*var\(--color-attention-strong\)/);
  assert.match(attentionRule, /color:\s*var\(--color-text-on-dark\)/);
  assert.match(attentionRule, /background:\s*var\(--color-status-action\)/);
});

test('Home status scope and neutral All Watches treatment remain unchanged', async () => {
  const [, labels, navigation] = await readStyles();
  const homeRenderer = navigation.match(/const renderHomeWatchCards =[\s\S]*?const renderHomeBriefing =/)?.[0] || '';
  const allRenderer = navigation.match(/const renderWatchList = \(\) => \{[\s\S]*?const renderWatchDetail/)?.[0] || '';

  assert.match(homeRenderer, /const homeStatus = statusById\.get\(watch\.id\);[\s\S]*?if \(!homeStatus\) return ''/);
  assert.doesNotMatch(homeRenderer, /status-label--unchanged|data-home-watch-status="unchanged"/);
  assert.match(allRenderer, /monitoringHealthStatus \|\| \(\['paused', 'completed'\]\.includes\(watch\.status\)[\s\S]*?: 'watching'\)/);
  assert.match(labels, /\.status-label--watching,[\s\S]*?border-color:\s*var\(--color-status-state-border\);[\s\S]*?background:\s*var\(--color-status-state-bg\)/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { WATCH_CLASSIFICATIONS } from './report-status.js';
import { getWatchStatusPresentation } from './watch-status-presentation.js';

const translate = (key) => ({
  'statuses.attention': 'Needs attention',
  'statuses.updated': 'Updated',
  'statuses.watching': 'Watching',
  'home.newBadge': 'New',
}[key]);

test('canonical status presentations reuse the validated labels and modifiers', () => {
  assert.deepEqual(
    getWatchStatusPresentation(WATCH_CLASSIFICATIONS.WATCHING, translate),
    { label: 'Watching', modifier: 'watching' },
  );
  assert.deepEqual(
    getWatchStatusPresentation(WATCH_CLASSIFICATIONS.UPDATED, translate),
    { label: 'Updated', modifier: 'updated' },
  );
  assert.deepEqual(
    getWatchStatusPresentation(WATCH_CLASSIFICATIONS.ATTENTION, translate),
    { label: 'Needs attention', modifier: 'attention' },
  );
  assert.deepEqual(
    getWatchStatusPresentation(WATCH_CLASSIFICATIONS.NEW, translate),
    { label: 'New', modifier: 'stable' },
  );
});

test('canonical Watching presentation is stable across repeated rendering', () => {
  const first = getWatchStatusPresentation(WATCH_CLASSIFICATIONS.WATCHING, translate);
  const second = getWatchStatusPresentation(WATCH_CLASSIFICATIONS.WATCHING, translate);

  assert.deepEqual(second, first);
  assert.notStrictEqual(second, first);
  assert.equal(getWatchStatusPresentation('unsupported', translate), null);
});

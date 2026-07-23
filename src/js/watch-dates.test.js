import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatWatchCreationMetadata,
  formatWatchCreationTime,
  getWatchCreationDate,
  normalizeWatchCreationDate,
} from './watch-dates.js';

test('recovers a legacy creation date and normalizes it to createdAt', () => {
  const result = normalizeWatchCreationDate({
    id: 'legacy',
    created_at: '2026-07-18T14:10:00+02:00',
  });

  assert.equal(result.valid, true);
  assert.equal(result.migrated, true);
  assert.equal(result.watch.createdAt, '2026-07-18T12:10:00.000Z');
});

test('recovers creation time from a created timeline event', () => {
  const date = getWatchCreationDate({
    timeline: [{
      type: 'created',
      date: '2026-06-03T09:30:00Z',
    }],
  });

  assert.equal(date.toISOString(), '2026-06-03T09:30:00.000Z');
});

test('does not invent a creation date when no legacy value is recoverable', () => {
  assert.deepEqual(normalizeWatchCreationDate({ id: 'unknown' }), {
    watch: { id: 'unknown' },
    migrated: false,
    valid: false,
  });
});

test('formats the newest TODAY heading time in local 24-hour time', () => {
  const date = new Date(2026, 6, 23, 19, 20);
  assert.equal(formatWatchCreationTime(date, { language: 'en' }), '19:20');
  assert.equal(formatWatchCreationTime(date, { language: 'fr' }), '19:20');
});

test('formats recent dates with locale-aware relative, weekday, and month names', () => {
  const now = new Date(2026, 6, 23, 18, 0);
  assert.equal(formatWatchCreationMetadata(new Date(2026, 6, 22, 11, 20), {
    groupType: 'last7Days',
    language: 'en',
    now,
  }), 'Yesterday · 11:20');
  assert.equal(formatWatchCreationMetadata(new Date(2026, 6, 20, 9, 45), {
    groupType: 'last7Days',
    language: 'fr',
    now,
  }), 'Lundi · 09:45');
  assert.equal(formatWatchCreationMetadata(new Date(2026, 6, 18, 14, 10), {
    groupType: 'last7Days',
    language: 'fr',
    now,
  }), '18 juillet · 14:10');
});

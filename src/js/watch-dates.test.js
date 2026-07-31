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

test('normalizes Unix seconds and milliseconds to the same meaningful Watch date', () => {
  const expected = '2026-07-31T08:00:00.000Z';
  const milliseconds = Date.parse(expected);
  const seconds = milliseconds / 1_000;

  assert.equal(getWatchCreationDate({ createdAt: seconds }).toISOString(), expected);
  assert.equal(getWatchCreationDate({ createdAt: milliseconds }).toISOString(), expected);
  assert.equal(getWatchCreationDate({ createdAt: String(seconds) }).toISOString(), expected);
});

test('missing, empty, invalid, and zero Watch dates never become 1970', () => {
  for (const createdAt of [undefined, null, '', 'not-a-date', 0, '0', Number.NaN]) {
    assert.equal(getWatchCreationDate({ createdAt }), null);
    assert.equal(formatWatchCreationTime(createdAt, { language: 'en' }), '');
    assert.equal(formatWatchCreationMetadata(createdAt, { language: 'en' }), '');
  }
});

test('the current createdAt remains authoritative over legacy creation fields', () => {
  const date = getWatchCreationDate({
    createdAt: '2026-07-30T10:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
  });

  assert.equal(date.toISOString(), '2026-07-30T10:00:00.000Z');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { groupWatches } from './watch-grouping.js';

const options = {
  briefingGeneratedAt: '2026-07-23T08:00:00+02:00',
  getMeaningfulUpdate: (watch) => watch.latestChange || '',
  language: 'en',
  now: new Date('2026-07-23T12:00:00+02:00'),
};

test('groups Watches once in the required precedence order', () => {
  const watches = [
    {
      id: 'historical-june',
      createdAt: '2026-06-20T09:00:00+02:00',
      status: 'watching',
    },
    {
      id: 'new-older',
      createdAt: '2026-07-23T09:00:00+02:00',
      status: 'watching',
    },
    {
      id: 'updated',
      createdAt: '2026-07-23T10:00:00+02:00',
      latestChange: 'Tickets are now available.',
      latestChangeAt: '2026-07-23T10:30:00+02:00',
      status: 'updated',
    },
    {
      id: 'action',
      createdAt: '2026-07-23T08:00:00+02:00',
      latestChange: 'Booking closes soon.',
      latestChangeAt: '2026-07-23T11:00:00+02:00',
      requiresAttention: true,
      status: 'updated',
    },
    {
      id: 'new-newer',
      createdAt: '2026-07-23T11:30:00+02:00',
      status: 'watching',
    },
    {
      id: 'historical-july',
      createdAt: '2026-07-02T09:00:00+02:00',
      status: 'watching',
    },
  ];

  const groups = groupWatches(watches, options);
  assert.deepEqual(groups.map((group) => group.type), [
    'actionRequired',
    'updated',
    'new',
    'historical',
    'historical',
  ]);
  assert.deepEqual(groups[2].watches.map((watch) => watch.id), ['new-newer', 'new-older']);
  assert.deepEqual(groups.slice(3).map((group) => group.label), ['July 2026', 'June 2026']);
  assert.equal(new Set(groups.flatMap((group) => group.watches.map((watch) => watch.id))).size, watches.length);
});

test('omits empty sections and sorts historical Watches newest first', () => {
  const groups = groupWatches([
    { id: 'older', createdAt: '2026-05-01T09:00:00+02:00', status: 'watching' },
    { id: 'newer', createdAt: '2026-05-20T09:00:00+02:00', status: 'watching' },
  ], options);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'May 2026');
  assert.deepEqual(groups[0].watches.map((watch) => watch.id), ['newer', 'older']);
});

test('does not categorise an update without meaningful update content', () => {
  const groups = groupWatches([
    {
      id: 'status-only',
      createdAt: '2026-07-01T09:00:00+02:00',
      latestChangeAt: '2026-07-23T10:00:00+02:00',
      status: 'updated',
    },
  ], options);

  assert.equal(groups[0].type, 'historical');
});

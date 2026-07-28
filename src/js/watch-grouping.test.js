import test from 'node:test';
import assert from 'node:assert/strict';
import { mockWatches } from './data/mock-watches.js';
import {
  getBriefingWatchGroups,
  getUpdatedSeparatorWatchId,
  groupHomeWatches,
  groupWatches,
} from './watch-grouping.js';

const options = {
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
      createdAt: '2026-07-21T10:00:00+02:00',
      latestChange: 'Tickets are now available.',
      latestChangeAt: '2026-07-23T10:30:00+02:00',
      status: 'updated',
    },
    {
      id: 'action',
      createdAt: '2026-07-20T08:00:00+02:00',
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
      id: 'recent',
      createdAt: '2026-07-22T11:20:00+02:00',
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
    'today',
    'last7Days',
    'historical',
    'historical',
  ]);
  assert.deepEqual(groups[2].watches.map((watch) => watch.id), ['new-newer', 'new-older']);
  assert.deepEqual(groups[3].watches.map((watch) => watch.id), ['recent']);
  assert.deepEqual(groups.slice(4).map((group) => group.label), ['July 2026', 'June 2026']);
  assert.equal(new Set(groups.flatMap((group) => group.watches.map((watch) => watch.id))).size, watches.length);
});

test('keeps every Watch created today and sorts them newest first', () => {
  const groups = groupWatches([
    {
      id: 'gbp',
      title: 'GBP reaches 1.18 against the EUR',
      createdAt: '2026-07-23T16:30:00+02:00',
      latestChange: 'The exchange rate changed.',
      latestChangeAt: '2026-07-23T16:45:00+02:00',
      status: 'updated',
    },
    {
      id: 'metallica',
      title: 'Tickets Metallica on sale',
      createdAt: '2026-07-23T17:06:00+02:00',
      status: 'watching',
    },
  ], options);

  assert.deepEqual(groups.map((group) => group.type), ['today']);
  assert.deepEqual(groups[0].watches.map((watch) => watch.id), ['metallica', 'gbp']);
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

test('Home briefing and All Watches share the same attention and updated records', () => {
  const metallica = {
    id: 'metallica',
    title: 'Metallica tickets',
    createdAt: '2026-07-23T11:45:00+02:00',
    status: 'watching',
  };
  const watches = [...mockWatches, metallica];
  const sharedOptions = {
    getMeaningfulUpdate: (watch) => (
      watch.latestChangeKey ? 'Localized meaningful update' : watch.latestChange || ''
    ),
    isDisplayableWatch: (watch) => Boolean(watch.titleKey || watch.title),
  };
  const briefing = getBriefingWatchGroups(watches, sharedOptions);
  const groups = groupWatches(watches, { ...options, ...sharedOptions });
  const actionRequired = groups.find((group) => group.type === 'actionRequired');
  const updated = groups.find((group) => group.type === 'updated');
  const newWatches = groups.find((group) => group.type === 'today');
  const unknownDate = groups.find((group) => group.type === 'unknownDate');

  assert.deepEqual(briefing.attentionWatches.map((watch) => watch.id), ['watch-001']);
  assert.deepEqual(briefing.updatedWatches.map((watch) => watch.id), ['watch-002', 'watch-003']);
  assert.deepEqual(
    actionRequired.watches.map((watch) => watch.id),
    briefing.attentionWatches.map((watch) => watch.id),
  );
  assert.deepEqual(
    updated.watches.map((watch) => watch.id),
    briefing.updatedWatches.map((watch) => watch.id),
  );
  assert.deepEqual(newWatches.watches.map((watch) => watch.id), ['metallica']);
  assert.deepEqual(
    unknownDate.watches.map((watch) => watch.id),
    ['watch-004', 'watch-005', 'watch-006', 'watch-007', 'watch-008'],
  );
  assert.equal(
    new Set(groups.flatMap((group) => group.watches.map((watch) => watch.id))).size,
    watches.length,
  );
});

test('uses the previous seven local calendar days before historical months', () => {
  const groups = groupWatches([
    { id: 'yesterday', createdAt: '2026-07-22T10:00:00+02:00', status: 'watching' },
    { id: 'seven-days', createdAt: '2026-07-16T00:00:00+02:00', status: 'watching' },
    { id: 'eight-days', createdAt: '2026-07-15T23:59:59+02:00', status: 'watching' },
    { id: 'unknown', status: 'watching' },
  ], options);

  assert.deepEqual(groups.map((group) => group.type), [
    'last7Days',
    'historical',
    'unknownDate',
  ]);
  assert.deepEqual(groups[0].watches.map((watch) => watch.id), ['yesterday', 'seven-days']);
  assert.deepEqual(groups[1].watches.map((watch) => watch.id), ['eight-days']);
  assert.deepEqual(groups[2].watches.map((watch) => watch.id), ['unknown']);
});

test('Home orders attention before update-date groups and sorts each group newest first', () => {
  const groups = groupHomeWatches([
    { id: 'attention', title: 'Needs setup', status: 'attention', requiresAttention: true },
    { id: 'today-old', title: 'Today old', latestUpdateAt: '2026-07-23T09:00:00+02:00', update: 'One' },
    { id: 'today-new', title: 'Today new', latestUpdateAt: '2026-07-23T11:00:00+02:00', update: 'Two' },
    { id: 'week', title: 'Week', latestUpdateAt: '2026-07-21T10:00:00+02:00', update: 'Three' },
    { id: 'june', title: 'June', latestUpdateAt: '2026-06-20T10:00:00+02:00', update: 'Four' },
    { id: 'quiet', title: 'Quiet', status: 'watching' },
  ], {
    getMeaningfulUpdate: (watch) => watch.update || '',
    isDisplayableWatch: (watch) => Boolean(watch.title),
    language: 'en',
    now: new Date('2026-07-23T12:00:00+02:00'),
  });
  assert.deepEqual(groups.map(({ type }) => type), [
    'attention', 'updatedToday', 'updatedThisWeek', 'updatedMonth',
  ]);
  assert.deepEqual(groups[1].watches.map(({ id }) => id), ['today-new', 'today-old']);
  assert.equal(groups[3].label, 'June 2026');
  assert.equal(groups.flatMap(({ watches }) => watches).filter(({ id }) => id === 'quiet').length, 0);
});

test('monitoring setup problems stay out of Home action and update groups', () => {
  const setupWatch = {
    id: 'setup',
    title: 'News story without feed',
    status: 'watching',
    monitoringStatus: { state: 'setup-required', reason: 'no-compatible-source' },
    monitoringIssueReason: 'no-compatible-source',
    latestUpdateAt: null,
  };
  const actionWatch = {
    id: 'action',
    title: 'Book the flight',
    status: 'attention',
    actionRequired: true,
    latestChange: 'The fare is now available.',
  };
  const groups = groupHomeWatches([setupWatch, actionWatch], {
    getMeaningfulUpdate: (watch) => watch.latestChange || '',
    isDisplayableWatch: () => true,
    now: new Date('2026-07-23T12:00:00+02:00'),
  });
  assert.deepEqual(groups.map(({ type }) => type), ['attention']);
  assert.deepEqual(groups[0].watches.map(({ id }) => id), ['action']);

  const briefing = getBriefingWatchGroups([setupWatch, actionWatch], {
    getMeaningfulUpdate: (watch) => watch.latestChange || '',
    isDisplayableWatch: () => true,
  });
  assert.deepEqual(briefing.attentionWatches.map(({ id }) => id), ['action']);
  assert.deepEqual(briefing.updatedWatches, []);
  assert.deepEqual(briefing.quietWatches.map(({ id }) => id), ['setup']);
});

test('a genuine candidate update remains in the correct Home date group', () => {
  const candidateWatch = {
    id: 'candidate',
    title: 'Berlin Pride attack',
    status: 'watching',
    latestUpdateAt: '2026-07-23T11:15:00+02:00',
    candidateUpdates: [{
      id: 'candidate-1',
      title: 'Police issue a new update',
      status: 'candidate',
      detectedAt: '2026-07-23T11:15:00+02:00',
    }],
  };
  const groups = groupHomeWatches([candidateWatch], {
    getMeaningfulUpdate: (watch) => watch.candidateUpdates[0].title,
    isDisplayableWatch: () => true,
    now: new Date('2026-07-23T12:00:00+02:00'),
  });
  assert.deepEqual(groups.map(({ type }) => type), ['updatedToday']);
  assert.deepEqual(groups[0].watches.map(({ id }) => id), ['candidate']);
});

test('one attention, two undated updates and five quiet Watches reconcile as 1, 2 and 5', () => {
  const watches = [
    { id: 'attention', status: 'attention', actionRequired: true, update: 'Act now.' },
    { id: 'updated-1', status: 'updated', update: 'A meaningful change.' },
    { id: 'updated-2', status: 'updated', update: 'Another meaningful change.' },
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `quiet-${index + 1}`,
      status: 'watching',
    })),
  ];
  const sharedOptions = {
    getMeaningfulUpdate: (watch) => watch.update || '',
    isDisplayableWatch: () => true,
    now: new Date('2026-07-23T12:00:00+02:00'),
  };
  const briefing = getBriefingWatchGroups(watches, sharedOptions);
  const homeGroups = groupHomeWatches(watches, sharedOptions);
  const homeAttention = homeGroups.find(({ type }) => type === 'attention')?.watches || [];
  const homeUpdates = homeGroups
    .filter(({ type }) => type !== 'attention')
    .flatMap(({ watches: groupedWatches }) => groupedWatches);

  assert.deepEqual(homeGroups.map(({ type }) => type), ['attention', 'updated']);
  assert.equal(homeAttention.length, 1);
  assert.equal(homeUpdates.length, 2);
  assert.equal(briefing.quietWatches.length, 5);
  assert.equal(homeAttention.length + homeUpdates.length + briefing.quietWatches.length, 8);
  assert.equal(new Set([...homeAttention, ...homeUpdates, ...briefing.quietWatches].map(({ id }) => id)).size, 8);
});

test('places one separator after the final canonical update when later content follows', () => {
  const attention = { id: 'attention' };
  const firstUpdate = { id: 'updated-1' };
  const secondUpdate = { id: 'updated-2' };
  const watching = { id: 'watching' };
  const groups = [
    { type: 'actionRequired', watches: [attention] },
    { type: 'updated', watches: [firstUpdate, secondUpdate] },
    { type: 'last7Days', watches: [watching] },
  ];

  assert.equal(
    getUpdatedSeparatorWatchId(groups, [firstUpdate, secondUpdate]),
    'updated-2',
  );
});

test('omits the update separator with no update or no following content', () => {
  const updated = { id: 'updated' };
  const watching = { id: 'watching' };
  assert.equal(getUpdatedSeparatorWatchId([
    { type: 'last7Days', watches: [watching] },
  ], []), null);
  assert.equal(getUpdatedSeparatorWatchId([
    { type: 'updated', watches: [updated] },
  ], [updated]), null);
});

test('uses canonical update membership and ignores attention for separator placement', () => {
  const attention = { id: 'attention' };
  const updated = { id: 'updated' };
  const watching = { id: 'watching' };
  const groups = [
    { type: 'actionRequired', watches: [attention] },
    { type: 'today', watches: [updated, watching] },
  ];

  assert.equal(getUpdatedSeparatorWatchId(groups, [updated]), 'updated');
  assert.equal(getUpdatedSeparatorWatchId(groups, []), null);
});

test('repositions or removes the separator when canonical status changes', () => {
  const first = { id: 'first' };
  const second = { id: 'second' };
  const third = { id: 'third' };
  const groups = [{ type: 'today', watches: [first, second, third] }];

  assert.equal(getUpdatedSeparatorWatchId(groups, [first]), 'first');
  assert.equal(getUpdatedSeparatorWatchId(groups, [first, second]), 'second');
  assert.equal(getUpdatedSeparatorWatchId(groups, [third]), null);
});

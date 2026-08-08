import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyFeedCheckResult,
  matchFeedItemToStory,
} from './watch-monitoring.js';

const candidate = (id, title, excerpt = '') => ({ id, title, excerpt });

const assertMatches = (profile, cases) => {
  for (const [name, item, expected] of cases) {
    assert.equal(
      matchFeedItemToStory(item, profile).matched,
      expected,
      name,
    );
  }
};

test('Carol Ruckdeschel requires story corroboration, not an incidental person mention', () => {
  const profile = {
    concepts: [
      { label: 'Carol Ruckdeschel', type: 'person' },
      {
        label: 'Carol Ruckdeschel’s conservation and off-grid life on Cumberland Island',
        type: 'relationship',
      },
    ],
  };

  assertMatches(profile, [
    ['A conservation follow-up', candidate('a',
      'Carol Ruckdeschel renews campaign to protect Cumberland Island from development'), true],
    ['B off-grid naturalist follow-up', candidate('b',
      'After decades living off-grid on Cumberland Island, Carol Ruckdeschel reflects on her life as a naturalist'), true],
    ['C conservation award', candidate('c',
      'Carol Ruckdeschel receives conservation award for work protecting Cumberland Island'), true],
    ['D unrelated snake wrangler', candidate('d',
      'Florida snake wrangler captures python near family home'), false],
    ['E unrelated Cumberland Island tourism', candidate('e',
      'Best beaches and campsites to visit on Cumberland Island this summer'), false],
    ['F same person, unrelated context', candidate('f',
      'Environmental conference guest list includes Carol Ruckdeschel among dozens of speakers'), false],
  ]);
});

test('Ivan Toney event paraphrases match while football mentions do not', () => {
  const profile = {
    concepts: [
      { label: 'Ivan Toney', type: 'person' },
      { label: 'Ivan Toney assault charge at a Soho nightclub', type: 'event' },
    ],
  };

  assertMatches(profile, [
    ['court follow-up', candidate('a', 'Ivan Toney due in court over alleged Soho nightclub assault'), true],
    ['adjournment follow-up', candidate('b', 'Ivan Toney case adjourned until September after assault charge'), true],
    ['unrelated football result', candidate('c', 'Ivan Toney scores twice in league victory'), false],
    ['incidental squad mention', candidate('d', 'World Cup squad discussion includes Ivan Toney'), false],
    ['unrelated venue story', candidate('e', 'Soho nightclub introduces new cocktail menu'), false],
    ['specific event without the person anchor', candidate('f',
      'Court hears assault charge arising from an incident at a Soho nightclub'), true],
  ]);
});

test('RWE requires offshore-wind story evidence and accepts a policy continuation', () => {
  const profile = {
    concepts: [
      { label: 'RWE', type: 'organization' },
      { label: 'RWE agreement to abandon US offshore wind projects', type: 'event' },
      { label: 'Trump administration rollback of US offshore wind projects', type: 'event' },
    ],
  };

  assertMatches(profile, [
    ['RWE withdrawal', candidate('a', 'RWE confirms withdrawal from another US offshore wind lease'), true],
    ['policy cancellation', candidate('b',
      'Trump administration announces further cancellation of offshore wind projects'), true],
    ['unrelated earnings', candidate('c', 'RWE quarterly profits rise'), false],
    ['unrelated solar project', candidate('d', 'RWE opens new German solar farm'), false],
    ['industry growth without rollback evidence', candidate('e',
      'US offshore wind industry reports record generation'), false],
  ]);
});

test('a discriminating single-concept phenomenon remains monitorable', () => {
  const profile = {
    concepts: [{ label: 'Ultra-processed foods', type: 'phenomenon' }],
  };

  assertMatches(profile, [
    ['health study', candidate('a', 'New study links ultra-processed foods to increased health risks'), true],
    ['unrelated nutrition', candidate('b', 'Nutritionists recommend eating more vegetables'), false],
    ['punctuation variant', candidate('c',
      'Food manufacturers respond to concerns over ultra processed foods'), true],
  ]);
});

test('Murkowski and Blanche require nomination or Justice Department evidence', () => {
  const profile = {
    concepts: [
      { label: 'Lisa Murkowski', type: 'person' },
      { label: 'Todd Blanche', type: 'person' },
      {
        label: 'Lisa Murkowski’s opposition to Todd Blanche’s attorney general nomination',
        type: 'relationship',
      },
      { label: 'Politicisation of the US Justice Department', type: 'phenomenon' },
    ],
  };

  assertMatches(profile, [
    ['nomination follow-up', candidate('a',
      'Lisa Murkowski renews opposition to Todd Blanche nomination for attorney general'), true],
    ['Justice Department follow-up', candidate('b',
      'Murkowski challenges Blanche over politicisation of the Justice Department'), true],
    ['unrelated Murkowski story', candidate('c', 'Lisa Murkowski visits Alaska fisheries'), false],
    ['unrelated Blanche story', candidate('d', 'Todd Blanche speaks at New York legal conference'), false],
  ]);
});

test('Jason Arday and Black Sea/Odesa regressions preserve relevant story matching', () => {
  const arday = {
    concepts: [
      { label: 'Plagiarism investigation', type: 'event' },
      { label: 'Jason Arday resignation', type: 'event' },
      { label: 'Jason Arday', type: 'person' },
      { label: 'University of Cambridge', type: 'organization' },
    ],
  };
  assertMatches(arday, [
    ['Arday resignation follow-up', candidate('a',
      'Jason Arday resignation followed Cambridge plagiarism investigation'), true],
    ['incidental university mention', candidate('b',
      'Cambridge university round-up mentions Jason Arday among former lecturers'), false],
  ]);

  const odesa = {
    concepts: [
      { label: 'Black Sea strike campaign', type: 'event' },
      { label: 'Russian strikes', type: 'event' },
      { label: 'Civilian infrastructure', type: 'phenomenon' },
      { label: 'Odesa', type: 'location' },
      { label: 'Russia', type: 'organization' },
      { label: 'Ukraine', type: 'location' },
    ],
  };
  assertMatches(odesa, [
    ['relevant strike follow-up', candidate('c', 'More Russian strikes hit Odesa in Black Sea campaign'), true],
    ['unrelated cruise story', candidate('d', 'Black Sea cruises announce summer itineraries from Odesa'), false],
  ]);
});

test('author/byline text never supplies story evidence', () => {
  const profile = {
    concepts: [
      { label: 'Carol Ruckdeschel', type: 'person' },
      { label: 'Cumberland Island conservation campaign', type: 'event' },
    ],
  };
  const item = {
    id: 'byline-only',
    title: 'Markets close higher after technology rally',
    excerpt: 'Investors assessed quarterly earnings.',
    author: 'Carol Ruckdeschel, Cumberland Island conservation campaign',
  };

  assert.equal(matchFeedItemToStory(item, profile).matched, false);
});

test('matching gates one Update while every candidate enters the snapshot and repeats deduplicate', () => {
  const profile = {
    concepts: [
      { label: 'Carol Ruckdeschel', type: 'person' },
      {
        label: 'Carol Ruckdeschel’s conservation and off-grid life on Cumberland Island',
        type: 'relationship',
      },
    ],
  };
  const checkedAt = '2026-08-07T12:00:00.000Z';
  const watch = {
    id: 'carol-watch',
    storyProfile: profile,
    monitoringSnapshot: { itemIds: ['existing'] },
    seenMonitoringItemIds: ['existing'],
    updates: [],
  };
  const relevant = {
    ...candidate('relevant', 'Carol Ruckdeschel renews conservation work on Cumberland Island'),
    url: 'https://future.example.com/relevant',
  };
  const incidental = {
    ...candidate('incidental', 'Conference guest list includes Carol Ruckdeschel among dozens of speakers'),
    url: 'https://future.example.com/incidental',
  };

  const first = applyFeedCheckResult(watch, {
    checkedAt,
    items: [relevant, incidental],
  });
  assert.equal(first.outcome, 'matching-items');
  assert.deepEqual(first.newItems.map(({ id }) => id), ['relevant', 'incidental']);
  assert.deepEqual(first.matchedItems.map(({ id }) => id), ['relevant']);
  assert.deepEqual(first.changes.updates.map(({ id }) => id), ['relevant']);
  assert.deepEqual(first.changes.monitoringSnapshot.itemIds, ['relevant', 'incidental']);

  const repeated = applyFeedCheckResult({ ...watch, ...first.changes }, {
    checkedAt: '2026-08-07T13:00:00.000Z',
    items: [relevant, incidental],
  });
  assert.equal(repeated.outcome, 'no-new-items');
  assert.deepEqual(repeated.changes.updates.map(({ id }) => id), ['relevant']);
});

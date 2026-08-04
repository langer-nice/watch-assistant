import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getBodaccBusinessEventLabel,
  getBodaccBusinessEventTranslationKey,
  getCurrentSituationPresentation,
} from './watch-update-presentation.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const update = (eventType) => ({
  id: 'bodacc-update',
  timestamp: '2026-08-04T09:00:00.000Z',
  sourceTitle: 'Modifications diverses · EXAMPLE',
  sourceName: 'BODACC',
  summary: 'Modification survenue sur le capital (augmentation).',
  status: 'new',
  rawMonitoringResult: { source: 'BODACC', eventType },
});

test('BODACC business events resolve to localized labels without hardcoded UI copy', async () => {
  const [enSource, frSource] = await Promise.all([
    read('../locales/en.json'),
    read('../locales/fr.json'),
  ]);
  const en = JSON.parse(enSource);
  const fr = JSON.parse(frSource);
  const classified = update('capital_increase');

  assert.equal(
    getBodaccBusinessEventTranslationKey(classified),
    'detail.businessEvents.capital_increase',
  );
  assert.equal(
    getBodaccBusinessEventLabel(classified, (key) => (
      key.split('.').reduce((value, part) => value?.[part], en)
    )),
    'Capital increased',
  );
  assert.equal(en.detail.businessEvents.capital_increase, 'Capital increased');
  assert.equal(fr.detail.businessEvents.capital_increase, 'Augmentation du capital');
});

test('Current Situation uses the event label and preserves the official description', () => {
  const presentation = getCurrentSituationPresentation({
    updates: [update('capital_increase')],
  }, {
    translateBusinessEvent: () => 'Capital increased',
  });

  assert.equal(presentation.title, 'Capital increased');
  assert.equal(
    presentation.summary,
    'Modification survenue sur le capital (augmentation).',
  );
});

test('unknown and non-BODACC events preserve the existing presentation', () => {
  const unknown = update('unknown_change');
  assert.equal(getBodaccBusinessEventTranslationKey(unknown), null);
  assert.equal(getBodaccBusinessEventLabel(unknown, () => 'must not be used'), '');
  assert.equal(
    getCurrentSituationPresentation({ updates: [unknown] }).title,
    'Modifications diverses · EXAMPLE',
  );

  const unrelated = {
    ...update('capital_increase'),
    rawMonitoringResult: { source: 'Example News', eventType: 'capital_increase' },
  };
  assert.equal(getBodaccBusinessEventTranslationKey(unrelated), null);
});

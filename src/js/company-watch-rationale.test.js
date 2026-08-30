import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  getCompanyWatchRationale,
  getWatchRationalePresentation,
  isLegacyCompanyNewsRationale,
  LEGACY_COMPANY_NEWS_RATIONALE,
} from './company-watch-rationale.js';
import { createPreviewTestWatches } from './preview-test-watches.js';

const loadMessages = (language) => readFile(
  new URL(`../locales/${language}.json`, import.meta.url),
  'utf8',
).then(JSON.parse);

const createTranslate = (messages) => (key, variables = {}) => {
  const value = key.split('.').reduce((current, part) => current?.[part], messages);
  return Object.entries(variables).reduce(
    (result, [name, replacement]) => result.replaceAll(`{${name}}`, replacement),
    value,
  );
};

const createCompanyWatch = (company = {}) => ({
  id: 'company-watch',
  inputType: 'company',
  company: { name: 'CEMEX GRANULATS', siren: '552005969', ...company },
  monitoringSource: { type: 'bodacc', title: 'BODACC', siren: '552005969' },
});

test('Company rationale is localized from the same canonical company identity', async () => {
  const [en, fr] = await Promise.all(['en', 'fr'].map(loadMessages));
  const watch = createCompanyWatch();
  const english = getCompanyWatchRationale(watch, createTranslate(en));
  const french = getCompanyWatchRationale(watch, createTranslate(fr));

  for (const rationale of [english, french]) {
    assert.match(rationale, /CEMEX GRANULATS/u);
    assert.match(rationale, /552005969/u);
    assert.match(rationale, /BODACC/u);
    assert.doesNotMatch(rationale, /undefined|null/u);
  }
  assert.match(english, /changes of directors|share-capital changes/u);
  assert.match(french, /changements de dirigeant|modifications du capital/u);
  assert.doesNotMatch(french, /future reporting|follow-up reporting/u);
  assert.notEqual(english, french);
  assert.deepEqual(watch.company, { name: 'CEMEX GRANULATS', siren: '552005969' });
});

test('legacy News fallback is replaced for Company Watches without rewriting user content', async () => {
  const en = await loadMessages('en');
  const translate = createTranslate(en);
  const company = createCompanyWatch();
  const userReason = 'I need to follow changes affecting this supplier.';
  const newsWatch = { inputType: 'url' };

  assert.equal(isLegacyCompanyNewsRationale(LEGACY_COMPANY_NEWS_RATIONALE), true);
  assert.match(
    getWatchRationalePresentation(company, LEGACY_COMPANY_NEWS_RATIONALE, translate),
    /official BODACC announcements/u,
  );
  assert.equal(getWatchRationalePresentation(company, userReason, translate), userReason);
  assert.equal(
    getWatchRationalePresentation(newsWatch, LEGACY_COMPANY_NEWS_RATIONALE, translate),
    LEGACY_COMPANY_NEWS_RATIONALE,
  );
});

test('missing Company identity uses safe localized fallbacks without fabrication', async () => {
  const [en, fr] = await Promise.all(['en', 'fr'].map(loadMessages));
  const cases = [
    createCompanyWatch({ name: '' }),
    createCompanyWatch({ siren: '' }),
    createCompanyWatch({ name: '', siren: '' }),
  ];

  for (const watch of cases) {
    for (const messages of [en, fr]) {
      const rationale = getCompanyWatchRationale(watch, createTranslate(messages));
      assert.match(rationale, /BODACC/u);
      assert.doesNotMatch(rationale, /undefined|null|\(SIREN \)/u);
      assert.doesNotMatch(rationale, /future reporting|follow-up reporting/u);
    }
  }
});

test('local Preview Company data uses the same localized rationale contract', async () => {
  const [en, fr] = await Promise.all(['en', 'fr'].map(loadMessages));
  const company = createPreviewTestWatches(new Date('2026-08-30T12:00:00.000Z'))
    .find(({ inputType }) => inputType === 'company');

  const english = getWatchRationalePresentation(company, company.whyFollowing, createTranslate(en));
  const french = getWatchRationalePresentation(company, company.whyFollowing, createTranslate(fr));
  assert.match(english, /ACME France \(SIREN 552005969\)/u);
  assert.match(french, /ACME France \(SIREN 552005969\)/u);
  assert.match(english, /official BODACC announcements/u);
  assert.match(french, /annonces officielles publiées au BODACC/u);
});

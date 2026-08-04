import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getAdministrativeStatusPresentation,
  normalizeAdministrativeStatus,
  normalizeCompanyIdentity,
} from './company-administrative-status.js';

const SIREN = '905266524';
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const lookup = (messages, key) => key
  .split('.')
  .reduce((value, part) => value?.[part], messages);

test('normalizes only active, ceased and unknown administrative statuses', () => {
  assert.equal(normalizeAdministrativeStatus('active'), 'active');
  assert.equal(normalizeAdministrativeStatus('ceased'), 'ceased');
  assert.equal(normalizeAdministrativeStatus('judicial_liquidation'), 'unknown');
});

test('accepts only normalized identity for the requested SIREN', () => {
  assert.deepEqual(normalizeCompanyIdentity({
    siren: SIREN,
    officialName: '  OFFICIAL   COMPANY ',
    administrativeStatus: 'active',
    rawStatus: 'A',
    source: 'recherche-entreprises',
  }, SIREN), {
    siren: SIREN,
    officialName: 'OFFICIAL COMPANY',
    administrativeStatus: 'active',
    rawStatus: 'A',
    source: 'recherche-entreprises',
  });
  assert.equal(normalizeCompanyIdentity({ siren: '552005969' }, SIREN), null);
});

test('unknown administrative status is omitted from presentation in English and French', async () => {
  const [en, fr] = await Promise.all([
    read('../locales/en.json').then(JSON.parse),
    read('../locales/fr.json').then(JSON.parse),
  ]);
  for (const messages of [en, fr]) {
    const translate = (key) => lookup(messages, key) ?? '';
    assert.equal(getAdministrativeStatusPresentation('active', translate).known, true);
    assert.equal(getAdministrativeStatusPresentation('ceased', translate).known, true);
    assert.deepEqual(getAdministrativeStatusPresentation('unknown', translate), {
      status: 'unknown', known: false, label: '', description: '', tone: 'error',
    });
  }
});

test('Review and Watch Detail distinguish administrative status from BODACC monitoring status', async () => {
  const [navigation, reviewHtml, detailHtml] = await Promise.all([
    read('./navigation.js'),
    read('../../new-watch.html'),
    read('../../watch-detail.html'),
  ]);
  const review = navigation.match(
    /const renderCompanyReviewStatus[\s\S]*?const renderReviewPresentation/,
  )?.[0] || '';
  const companyLookup = navigation.match(
    /const startCompanyReview[\s\S]*?const startUrlAnalysis/,
  )?.[0] || '';
  const detail = navigation.match(
    /const renderWatchDetail = \(\) => \{[\s\S]*?function scheduleFirstMonitoringPass/,
  )?.[0] || '';
  const home = navigation.match(
    /const renderHomeWatchCards[\s\S]*?const renderHomeBriefing/,
  )?.[0] || '';
  const allWatches = navigation.match(
    /const renderWatchList[\s\S]*?const renderWatchDetail/,
  )?.[0] || '';

  assert.match(reviewHtml, /id="companyReviewAdministrativeStatus"/);
  assert.match(reviewHtml, /companyStatus\.monitoringHeading/);
  assert.match(review, /getAdministrativeStatusPresentation/);
  assert.match(review, /administrativePresentation\.known/);
  assert.match(companyLookup, /name: baseline\.company\?\.officialName \|\| companyName/);
  assert.match(companyLookup, /baseline\.company\?\.administrativeStatus/);
  assert.match(detailHtml, /id="watchCompanyAdministrativeStatus"/);
  assert.match(detailHtml, /administrativeStatus\.heading/);
  assert.match(detailHtml, /companyStatus\.monitoringHeading/);
  assert.match(detail, /getAdministrativeStatusPresentation/);
  assert.match(detail, /getCompanyStatusPresentation/);
  assert.doesNotMatch(home, /getAdministrativeStatusPresentation|administrativeStatus/);
  assert.doesNotMatch(allWatches, /getAdministrativeStatusPresentation|administrativeStatus/);
});

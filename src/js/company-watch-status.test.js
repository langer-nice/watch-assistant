import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  COMPANY_STATUS_VALUES,
  deriveCompanyStatus,
  getCompanyStatusPresentation,
  isTerminalCompanyStatus,
} from './company-watch-status.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const lookup = (messages, key) => key
  .split('.')
  .reduce((value, part) => value?.[part], messages);
const translator = (messages) => (key) => lookup(messages, key) ?? '';

test('BODACC business events map deterministically to every supported company status', () => {
  const cases = [
    ['company_created', 'active'],
    ['judicial_proceedings', 'judicial_proceedings'],
    ['receivership', 'receivership'],
    ['judicial_liquidation', 'judicial_liquidation'],
    ['company_dissolved', 'dissolved'],
    ['company_struck_off', 'struck_off'],
    ['accounts_filed', 'unknown'],
  ];

  assert.deepEqual(COMPANY_STATUS_VALUES, [
    'active',
    'judicial_proceedings',
    'receivership',
    'judicial_liquidation',
    'dissolved',
    'struck_off',
    'unknown',
  ]);
  for (const [eventType, expected] of cases) {
    assert.equal(deriveCompanyStatus([{ eventType }]), expected);
  }
});

test('the newest status-bearing BODACC event replaces the previous official status', () => {
  assert.equal(deriveCompanyStatus([
    { eventType: 'company_struck_off' },
    { eventType: 'judicial_liquidation' },
    { eventType: 'company_created' },
  ], 'active'), 'struck_off');
  assert.equal(deriveCompanyStatus([
    { eventType: 'accounts_filed' },
  ], 'receivership'), 'receivership');
  assert.equal(deriveCompanyStatus([], 'dissolved'), 'dissolved');
});

test('English and French status presentation has complete parity', async () => {
  const [en, fr] = await Promise.all([
    read('../locales/en.json').then(JSON.parse),
    read('../locales/fr.json').then(JSON.parse),
  ]);

  for (const status of COMPANY_STATUS_VALUES) {
    const english = getCompanyStatusPresentation(status, translator(en));
    const french = getCompanyStatusPresentation(status, translator(fr));
    assert.ok(english.label && english.description);
    assert.ok(french.label && french.description);
    assert.equal(Boolean(english.followUp), Boolean(french.followUp));
  }
});

test('Review warnings are limited to dissolved and struck-off companies', async () => {
  const en = JSON.parse(await read('../locales/en.json'));
  const translate = translator(en);

  assert.equal(isTerminalCompanyStatus('dissolved'), true);
  assert.equal(isTerminalCompanyStatus('struck_off'), true);
  assert.equal(isTerminalCompanyStatus('active'), false);
  assert.equal(
    getCompanyStatusPresentation('dissolved', translate).warningTitle,
    'This company is already dissolved.',
  );
  assert.equal(
    getCompanyStatusPresentation('struck_off', translate).warningTitle,
    'This company has already been struck off.',
  );
  assert.equal(getCompanyStatusPresentation('active', translate).warningTitle, '');
});

test('Review, Home, All Watches and Watch Detail render the shared company status', async () => {
  const [navigation, reviewHtml, detailHtml] = await Promise.all([
    read('./navigation.js'),
    read('../../new-watch.html'),
    read('../../watch-detail.html'),
  ]);

  const review = navigation.match(
    /const renderCompanyReviewStatus[\s\S]*?const renderReviewPresentation/,
  )?.[0] || '';
  const initialBaseline = navigation.match(
    /const startCompanyReview[\s\S]*?const startUrlAnalysis/,
  )?.[0] || '';
  const home = navigation.match(
    /const renderHomeWatchCards[\s\S]*?const renderHomeBriefing/,
  )?.[0] || '';
  const allWatches = navigation.match(
    /const renderWatchList[\s\S]*?const renderWatchDetail/,
  )?.[0] || '';
  const detail = navigation.match(
    /const renderWatchDetail = \(\) => \{[\s\S]*?function scheduleFirstMonitoringPass/,
  )?.[0] || '';

  assert.match(reviewHtml, /id="companyReviewStatus"/);
  assert.match(reviewHtml, /id="companyReviewWarning"/);
  assert.match(review, /getCompanyStatusPresentation/);
  assert.match(review, /isTerminalCompanyStatus/);
  assert.match(initialBaseline, /await requestCompanyCheck\(monitoringSource\.siren\)/);
  assert.match(initialBaseline, /status: deriveCompanyStatus\(baseline\.items\)/);
  assert.match(home, /renderCompanyStatusBadge\(watch\)/);
  assert.match(allWatches, /renderCompanyStatusBadge\(watch\)/);
  assert.match(detailHtml, /id="watchCompanyStatus"/);
  assert.match(detail, /getCompanyStatusPresentation\(watch\.company\?\.status, t\)/);
});

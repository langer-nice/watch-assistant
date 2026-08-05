import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('unknown BODACC monitoring status is omitted while Current Situation remains', async () => {
  const [navigation, detailHtml] = await Promise.all([
    read('./navigation.js'),
    read('../../watch-detail.html'),
  ]);
  const reviewRenderer = navigation.match(
    /const renderCompanyReviewStatus[\s\S]*?const renderReviewPresentation/,
  )?.[0] || '';
  const detailRenderer = navigation.match(
    /const renderWatchDetail = \(\) => \{[\s\S]*?function scheduleFirstMonitoringPass/,
  )?.[0] || '';

  assert.match(reviewRenderer, /hasMeaningfulMonitoringStatus = presentation\.status !== 'unknown'/);
  assert.match(detailRenderer, /shouldShowCompanyMonitoringStatus/);
  assert.match(detailRenderer, /showCompanyMonitoringStatus/);
  assert.match(detailHtml, /id="current-situation"/);
  assert.match(detailRenderer, /const currentSituation = currentUpdate\.summary/);
  assert.match(detailRenderer, /hasCurrentSituation = setOptionalField/);
});

test('administrative badges reuse the shared status-label styles without a Company variant', async () => {
  const [navigation, reviewHtml, detailHtml, styles] = await Promise.all([
    read('./navigation.js'),
    read('../../new-watch.html'),
    read('../../watch-detail.html'),
    read('../scss/components/_status-label.scss'),
  ]);

  assert.match(reviewHtml, /class="status-label" id="companyReviewAdministrativeStatusBadge"/);
  assert.match(detailHtml, /class="status-label" id="watchCompanyAdministrativeStatusBadge"/);
  assert.match(navigation, /`status-label status-label--\$\{administrativePresentation\.tone\}`/);
  assert.match(navigation, /`status-label status-label--\$\{administrativeStatusPresentation\.tone\}`/);
  assert.doesNotMatch(styles, /company-status-badge/);
  assert.match(
    styles,
    /\.status-label--stable\s*\{[\s\S]*?color:\s*var\(--color-text-on-dark\)[\s\S]*?background:\s*var\(--color-status-success\)/,
  );
});

test('All Watch cards omit generic Monitoring and Monitoring setup badges', async () => {
  const navigation = await read('./navigation.js');
  const allWatches = navigation.match(
    /const renderWatchList = \(\) => \{[\s\S]*?const renderWatchDetail/,
  )?.[0] || '';

  assert.match(allWatches, /updatedIds\.has\(watch\.id\)[\s\S]*?\? 'updated'[\s\S]*?newIds\.has\(watch\.id\)[\s\S]*?\? 'new'/);
  assert.doesNotMatch(allWatches, /setupRequired|monitoringStatusBadge|statuses\.watching/);
});

test('administrative status support copy is concise in English and French', async () => {
  const [english, french] = await Promise.all([
    read('../locales/en.json').then(JSON.parse),
    read('../locales/fr.json').then(JSON.parse),
  ]);

  assert.equal(english.administrativeStatus.descriptions.active, 'Current official administrative status.');
  assert.equal(english.administrativeStatus.descriptions.ceased, 'Current official administrative status.');
  assert.equal(french.administrativeStatus.descriptions.active, 'Statut administratif officiel actuel.');
  assert.equal(french.administrativeStatus.descriptions.ceased, 'Statut administratif officiel actuel.');
  assert.equal(english.administrativeStatus.detailHeading, 'Official company status');
  assert.equal(english.companyStatus.detailMonitoringHeading, 'BODACC monitoring');
  assert.equal(
    english.administrativeStatus.detailDescriptions.active,
    'Official records indicate the company is currently active.',
  );
  assert.equal(french.administrativeStatus.detailHeading, 'Statut officiel de l’entreprise');
  assert.equal(french.companyStatus.detailMonitoringHeading, 'Surveillance BODACC');
});

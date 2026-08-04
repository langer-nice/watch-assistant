import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createBodaccMonitoringSource,
  parseCompanyWatchRequest,
} from './company-watch-request.js';
import { migrateWatchModel, WATCH_MODEL_VERSION } from './watch-model.js';
import { requestCompanyCheck } from './watch-monitoring.js';
import { getCompanyWatchTitle } from './company-watch-title.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const SIREN = '552005969';
const GARIBALDI_SIREN = '849703772';

test('the reported GARIBALDI request enters Company review and bypasses generic discovery', async () => {
  const navigation = await read('./navigation.js');
  const submitFlow = navigation.match(
    /form\.addEventListener\('submit',[\s\S]*?clarificationActions\?\.addEventListener/,
  )?.[0] || '';
  const companyBranch = submitFlow.slice(
    submitFlow.indexOf('if (companyRequest.recognized)'),
    submitFlow.indexOf('if (isUrl(request))'),
  );

  assert.deepEqual(parseCompanyWatchRequest(`Monitor LE GARIBALDI ${GARIBALDI_SIREN}`), {
    recognized: true,
    valid: true,
    siren: GARIBALDI_SIREN,
    companyName: 'LE GARIBALDI',
    reason: null,
  });
  assert.match(
    companyBranch,
    /startCompanyReview\([\s\S]*?companyRequest\.siren,[\s\S]*?companyRequest\.companyName/,
  );
  assert.doesNotMatch(
    companyBranch,
    /requestMonitoringSource|resolveUrlMonitoringSource|clarifyWatchRequest|monitoringSourceUnsupported|NO_COMPATIBLE_SOURCE/,
  );

  const requests = [];
  await requestCompanyCheck(GARIBALDI_SIREN, {
    fetchImpl: async (path, options) => {
      requests.push({ path, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ checkedAt: '2026-08-04T08:00:00.000Z', items: [] }) };
    },
  });
  assert.deepEqual(requests, [{
    path: '/api/check-company',
    body: { siren: GARIBALDI_SIREN },
  }]);
});

test('Company Watch review is localized and identifies the SIREN and official BODACC source', async () => {
  const [html, navigation, enSource, frSource] = await Promise.all([
    read('../../new-watch.html'),
    read('./navigation.js'),
    read('../locales/en.json'),
    read('../locales/fr.json'),
  ]);
  const en = JSON.parse(enSource);
  const fr = JSON.parse(frSource);

  for (const id of ['urlReviewHeading', 'urlReviewTitleLabel', 'urlReviewSummaryLabel']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  assert.equal(en.newWatch.companyReviewFound, 'Company monitoring');
  assert.equal(fr.newWatch.companyReviewFound, 'Surveillance d’entreprise');
  assert.match(en.newWatch.companyReviewSummary, /BODACC.*\{siren\}/);
  assert.match(fr.newWatch.companyReviewSummary, /BODACC.*\{siren\}/);
  assert.match(navigation, /inputType: 'company'/);
  assert.match(navigation, /const company = \{[\s\S]*?siren: monitoringSource\.siren,[\s\S]*?name: baseline\.company\?\.officialName \|\| companyName,[\s\S]*?administrativeStatus: normalizeAdministrativeStatus\([\s\S]*?baseline\.company\?\.administrativeStatus,[\s\S]*?status: deriveCompanyStatus\(baseline\.items\)/);
  assert.match(navigation, /title = getCompanyWatchTitle/);
  assert.match(navigation, /companyReviewSource/);
  assert.match(navigation, /reviewSource\.textContent = 'BODACC'/);
});

test('Company intent is handled before URL, clarification, OpenAI, or text-source discovery', async () => {
  const navigation = await read('./navigation.js');
  const submitFlow = navigation.match(
    /form\.addEventListener\('submit',[\s\S]*?clarificationActions\?\.addEventListener/,
  )?.[0] || '';
  const parseIndex = submitFlow.indexOf('parseCompanyWatchRequest(request)');
  const urlIndex = submitFlow.indexOf('if (isUrl(request))');
  const clarificationIndex = submitFlow.indexOf('clarifyWatchRequest(request');

  assert.ok(parseIndex >= 0 && parseIndex < urlIndex && urlIndex < clarificationIndex);
  assert.match(submitFlow, /companyRequest\.recognized[\s\S]*?companySirenGuidance/);
  assert.match(submitFlow, /companyRequest\.valid[\s\S]*?startCompanyReview/);
  const companyBranch = submitFlow.slice(
    submitFlow.indexOf('if (companyRequest.recognized)'),
    submitFlow.indexOf('if (isUrl(request))'),
  );
  assert.doesNotMatch(companyBranch, /analyseUrl|clarifyWatchRequest|requestMonitoringSource/);
});

test('Company Watch creation carries the approved shape into the existing transactional lifecycle', async () => {
  const navigation = await read('./navigation.js');
  const derivation = navigation.match(/const deriveWatchData[\s\S]*?const createWatchObject/)?.[0] || '';
  const completion = navigation.match(
    /const completeWatchCreation = async \(watch\) => \{[\s\S]*?const finishModalTransition/,
  )?.[0] || '';
  const createHandler = navigation.match(
    /reviewCreate\?\.addEventListener\('click',[\s\S]*?reviewCancel\?\.addEventListener/,
  )?.[0] || '';

  assert.match(derivation, /inputType: isCompanyRequest \? 'company'/);
  assert.match(derivation, /name: urlAnalysis\?\.company\?\.name \|\| null/);
  assert.match(derivation, /monitoringSource = companyMonitoringSource \|\|/);
  assert.equal((completion.match(/addWatch\(watch\)/g) || []).length, 1);
  assert.match(completion, /await activateWatchMonitoring\(watch\.id/);
  assert.match(completion, /deleteWatch\(watch\.id\)/);
  assert.match(completion, /getCreatedWatchDetailHref\(watch\.id\)/);
  assert.match(createHandler, /creationInProgress/);
  assert.match(createHandler, /createOptions\.monitoringSource = analysis\.monitoringSource/);
  assert.equal((createHandler.match(/completeWatchCreation\(createWatchObject\(/g) || []).length, 1);
  assert.match(createHandler, /catch \(error\)[\s\S]*?resetUrlFlow\(\{ clearInput: false \}\)/);

  const source = createBodaccMonitoringSource(SIREN);
  const migrated = migrateWatchModel({
    id: 'company-created',
    inputType: 'company',
    company: { siren: SIREN, name: null },
    monitoringSource: source,
  }).watch;
  assert.equal(migrated.watchModelVersion, WATCH_MODEL_VERSION);
  assert.deepEqual(migrated.company, {
    siren: SIREN,
    name: null,
    administrativeStatus: 'unknown',
    status: 'unknown',
  });
  assert.deepEqual(migrated.monitoringSource, source);
  assert.equal('url' in migrated.monitoringSource, false);
});

test('Company titles prefer company.name and retain the localized SIREN fallback', () => {
  const named = {
    inputType: 'company',
    title: `Company SIREN ${GARIBALDI_SIREN}`,
    company: { siren: GARIBALDI_SIREN, name: 'LE GARIBALDI' },
  };
  const unnamed = {
    ...named,
    company: { ...named.company, name: null },
  };
  const options = {
    storedTitle: named.title,
    formatFallback: (siren) => `Company SIREN ${siren}`,
  };

  assert.equal(getCompanyWatchTitle(named, options), 'LE GARIBALDI');
  assert.equal(getCompanyWatchTitle(unnamed, options), `Company SIREN ${GARIBALDI_SIREN}`);
});

test('Review, Home, All Watches and Watch Detail use the shared Company title helper', async () => {
  const navigation = await read('./navigation.js');
  const review = navigation.match(/const renderReviewPresentation[\s\S]*?const validateReviewSummary/)?.[0] || '';
  const home = navigation.match(/const renderHomeWatchCards[\s\S]*?const renderHomeBriefing/)?.[0] || '';
  const allWatches = navigation.match(/const renderWatchList[\s\S]*?const renderWatchDetail/)?.[0] || '';
  const detail = navigation.match(/const renderWatchDetail = \(\) => \{[\s\S]*?function scheduleFirstMonitoringPass/)?.[0] || '';

  assert.match(review, /getWatchDisplayTitle\(analysis\)/);
  assert.match(home, /const title = getWatchDisplayTitle\(watch\)/);
  assert.match(allWatches, /const storedTitle = getWatchDisplayTitle\(watch\)/);
  assert.match(detail, /titleEl\.textContent = getWatchDisplayTitle\(watch\)/);
});

test('Company review Edit preserves the request and Cancel creates nothing', async () => {
  const navigation = await read('./navigation.js');
  const editFlow = navigation.match(
    /const restoreCompanyRequestForEditing[\s\S]*?reviewSummary\?\.addEventListener/,
  )?.[0] || '';
  const cancelFlow = navigation.match(
    /reviewCancel\?\.addEventListener\('click',[\s\S]*?analysisCancel\?\.addEventListener/,
  )?.[0] || '';

  assert.match(editFlow, /resetUrlFlow\(\{ clearInput: false \}\)/);
  assert.match(editFlow, /input\?\.focus\(\)/);
  assert.doesNotMatch(editFlow, /addWatch|completeWatchCreation/);
  assert.match(cancelFlow, /resetUrlFlow\(\{ clearInput: true, trackCancellation: true \}\)/);
  assert.doesNotMatch(cancelFlow, /addWatch|completeWatchCreation/);
});

test('Watch Detail reuses the existing source and monitoring controls for Company Watches', async () => {
  const [navigation, styles] = await Promise.all([
    read('./navigation.js'),
    read('../scss/pages/_watch-detail.scss'),
  ]);
  const sourceRendering = navigation.match(
    /const companySiren = watch\.inputType === 'company'[\s\S]*?if \(originalSourceEl\)/,
  )?.[0] || '';
  const checkButton = styles.match(/\.watch-fact-check__button \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(sourceRendering, /detail\.companySiren/);
  assert.match(sourceRendering, /watch\.monitoringSource\?\.title \|\| 'BODACC'/);
  assert.match(sourceRendering, /hasOriginalSource = companySiren/);
  assert.match(sourceRendering, /companySourceUrl = companySiren \? getCompanyBodaccUrl\(watch\) : null/);
  assert.match(sourceRendering, /hasSourceLink = hasOriginalSource && Boolean\(sourceLinkUrl\)/);
  assert.match(checkButton, /box-shadow:\s*none/);
  assert.match(checkButton, /min-height:\s*2\.25rem/);
});

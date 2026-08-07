import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBodaccMonitoringSource,
  extractCompanyNameFromRequest,
  isValidSiren,
  parseCompanyWatchRequest,
} from './company-watch-request.js';

const SIREN = '552005969';
const GARIBALDI_SIREN = '849703772';

test('recognizes the reported English and French company-name requests', () => {
  for (const request of [
    `Monitor LE GARIBALDI ${GARIBALDI_SIREN}`,
    `Surveille LE GARIBALDI ${GARIBALDI_SIREN}`,
    `Surveille l’entreprise LE GARIBALDI SIREN ${GARIBALDI_SIREN}`,
  ]) {
    assert.deepEqual(parseCompanyWatchRequest(request), {
      recognized: true,
      valid: true,
      siren: GARIBALDI_SIREN,
      companyName: 'LE GARIBALDI',
      reason: null,
    });
  }
});

test('recognizes a company name and valid SIREN without requiring a monitoring verb', () => {
  const cases = [
    ['CEMEX GRANULATS 552005969', '552005969', 'CEMEX GRANULATS'],
    ['PALAIS SEGURANE 905329314', '905329314', 'PALAIS SEGURANE'],
    ['LPM MAX BAREL 905266524', '905266524', 'LPM MAX BAREL'],
    ['LE GARIBALDI 849703772', '849703772', 'LE GARIBALDI'],
    ['Cemex Granulats 552005969', '552005969', 'Cemex Granulats'],
  ];

  for (const [request, siren, companyName] of cases) {
    assert.deepEqual(parseCompanyWatchRequest(request), {
      recognized: true,
      valid: true,
      siren,
      companyName,
      reason: null,
    });
  }
});

test('recognizes English and French company-monitoring requests with a valid SIREN', () => {
  for (const request of [
    `Monitor company SIREN ${SIREN}`,
    `Surveille l’entreprise SIREN ${SIREN}`,
    `Track BODACC updates for ${SIREN}`,
    `Suis les annonces BODACC pour ${SIREN}`,
  ]) {
    assert.deepEqual(parseCompanyWatchRequest(request), {
      recognized: true,
      valid: true,
      siren: SIREN,
      companyName: null,
      reason: null,
    });
  }
});

test('normalizes spaces in a valid SIREN', () => {
  for (const request of [
    'Watch company 552 005 969',
    'Surveille la société 552\u00a0005\u202f969',
  ]) {
    assert.equal(parseCompanyWatchRequest(request).siren, SIREN);
  }
});

test('recognizes a valid standalone SIREN without requiring UI-specific intent', () => {
  for (const [request, expectedSiren] of [
    [SIREN, SIREN],
    ['552 005 969', SIREN],
    ['Company 552005969', SIREN],
    ['501570428', '501570428'],
    ['501 570 428', '501570428'],
    ['905266524', '905266524'],
    [GARIBALDI_SIREN, GARIBALDI_SIREN],
  ]) {
    assert.deepEqual(parseCompanyWatchRequest(request), {
      recognized: true,
      valid: true,
      siren: expectedSiren,
      companyName: null,
      reason: null,
    });
  }
});

test('a valid SIREN inside non-Company prose stays in the normal Watch flow', () => {
  for (const request of [`Reference ${SIREN}`, `The number is ${SIREN}`]) {
    assert.deepEqual(parseCompanyWatchRequest(request), {
      recognized: false,
      valid: false,
      siren: null,
      companyName: null,
      reason: null,
    });
  }
});

test('does not recognize an invalid standalone number as a Company Watch', () => {
  for (const request of ['123456789', '905266525', '12345678', '1234567890']) {
    assert.equal(parseCompanyWatchRequest(request).recognized, false);
  }
});

test('a URL containing nine digits remains outside the Company Watch flow', () => {
  for (const request of [
    `Monitor https://example.com/${GARIBALDI_SIREN}`,
    `Surveille www.example.com/${GARIBALDI_SIREN}`,
    `https://example.com/rss/${GARIBALDI_SIREN}.xml`,
    `https://news.example.com/story/${GARIBALDI_SIREN}`,
  ]) {
    assert.equal(parseCompanyWatchRequest(request).recognized, false);
  }
});

test('rejects missing, wrong-length, checksum-invalid, ambiguous and SIRET-only requests', () => {
  const cases = [
    ['Monitor company Acme', 'missing_siren'],
    ['Monitor company SIREN 12345678', 'invalid_length'],
    ['Monitor company SIREN 552005968', 'invalid_checksum'],
    ['Monitor company SIREN 552005969 and SIREN 732829320', 'multiple_sirens'],
    ['Monitor SIRET 55200596900018', 'siret_only'],
  ];
  for (const [request, reason] of cases) {
    assert.deepEqual(parseCompanyWatchRequest(request), {
      recognized: true,
      valid: false,
      siren: null,
      companyName: null,
      reason,
    });
  }
});

test('extracts only a meaningful company name from the user request', () => {
  assert.equal(
    extractCompanyNameFromRequest(
      `Surveille l’entreprise LE GARIBALDI SIREN ${GARIBALDI_SIREN}`,
      GARIBALDI_SIREN,
    ),
    'LE GARIBALDI',
  );
  assert.equal(extractCompanyNameFromRequest(`Monitor company ${SIREN}`, SIREN), null);
  assert.equal(extractCompanyNameFromRequest(`Track BODACC updates for ${SIREN}`, SIREN), null);
});

test('validates Luhn and creates only the approved BODACC source shape', () => {
  assert.equal(isValidSiren(SIREN), true);
  assert.equal(isValidSiren('552005968'), false);
  assert.deepEqual(createBodaccMonitoringSource('552 005 969'), {
    type: 'bodacc',
    provider: 'dila',
    siren: SIREN,
    title: 'BODACC',
    discovery: 'official-company',
  });
  assert.equal(createBodaccMonitoringSource('552005968'), null);
});

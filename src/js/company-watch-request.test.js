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

test('a valid SIREN without clear company-monitoring intent stays in the normal Watch flow', () => {
  for (const request of [SIREN, `Reference ${SIREN}`, `The number is ${SIREN}`]) {
    assert.deepEqual(parseCompanyWatchRequest(request), {
      recognized: false,
      valid: false,
      siren: null,
      companyName: null,
      reason: null,
    });
  }
});

test('a URL containing nine digits remains outside the Company Watch flow', () => {
  for (const request of [
    `Monitor https://example.com/${GARIBALDI_SIREN}`,
    `Surveille www.example.com/${GARIBALDI_SIREN}`,
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

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getCompanyBodaccUrl } from './company-watch-source.js';

const SIREN = '849703772';
const companyWatch = (overrides = {}) => ({
  inputType: 'company',
  company: { siren: SIREN },
  ...overrides,
});
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('uses an existing official BODACC publication URL when available', () => {
  const url = 'https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id%3AA20240002245';
  assert.equal(getCompanyBodaccUrl(companyWatch({
    monitoringSnapshot: { items: [{ url, sirens: [SIREN] }] },
  })), url);
});

test('prefers the latest stored official publication over the company search', () => {
  const olderUrl = 'https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id%3AA20240002245';
  const latestUrl = 'https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id%3AB20250003110';
  assert.equal(getCompanyBodaccUrl(companyWatch({
    updates: [
      { sourceUrl: olderUrl, rawMonitoringResult: { sirens: [SIREN] } },
      { sourceUrl: latestUrl, rawMonitoringResult: { sirens: [SIREN] } },
    ],
  })), latestUrl);
});

test('rejects a stored publication that is not proven to belong to the watched SIREN', () => {
  const unrelatedUrl = 'https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id%3AC20260073216';
  assert.equal(getCompanyBodaccUrl(companyWatch({
    monitoringSnapshot: {
      items: [{ url: unrelatedUrl, sirens: ['905329314'] }],
    },
  })), `https://www.bodacc.fr/explore/dataset/annonces-commerciales/table/?q=${SIREN}`);
  assert.equal(getCompanyBodaccUrl(companyWatch({
    monitoringSnapshot: { items: [{ url: unrelatedUrl }] },
  })), `https://www.bodacc.fr/explore/dataset/annonces-commerciales/table/?q=${SIREN}`);
});

test('constructs an official SIREN-filtered BODACC URL when no publication URL exists', () => {
  assert.equal(
    getCompanyBodaccUrl(companyWatch()),
    `https://www.bodacc.fr/explore/dataset/annonces-commerciales/table/?q=${SIREN}`,
  );
  assert.equal(getCompanyBodaccUrl({ inputType: 'url' }), null);
});

test('Company source reuses the existing media external-link component', async () => {
  const [navigation, detailHtml] = await Promise.all([
    read('./navigation.js'),
    read('../../watch-detail.html'),
  ]);
  const sourceRendering = navigation.match(
    /const companySiren = watch\.inputType === 'company'[\s\S]*?if \(originalSourceEl\)/,
  )?.[0] || '';

  assert.match(detailHtml, /class="detail-card__source-link"[\s\S]*?id="watchSourceLink"/);
  assert.equal((detailHtml.match(/id="watchSourceLink"/g) || []).length, 1);
  assert.match(sourceRendering, /getCompanyBodaccUrl\(watch\)/);
  assert.match(sourceRendering, /sourceLinkEl\.href = sourceLinkUrl/);
  assert.match(sourceRendering, /detail\.viewOfficialBodaccPublications/);
});

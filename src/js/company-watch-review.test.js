import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getCompanyReviewSummary } from './company-watch-review.js';

const SIREN = '849703772';
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const lookup = (messages, key) => key
  .split('.')
  .reduce((value, part) => value?.[part], messages);
const translator = (messages) => (key, variables = {}) => Object.entries(variables).reduce(
  (value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement),
  lookup(messages, key) || '',
);

test('English Company Review explains supported events in two concise paragraphs', async () => {
  const en = JSON.parse(await read('../locales/en.json'));
  const summary = getCompanyReviewSummary(SIREN, translator(en));

  assert.equal(summary, [
    `Monitoring official BODACC publications for SIREN ${SIREN}.`,
    '',
    'Detects director changes, capital changes, registered office changes, accounts filed, judicial proceedings and company dissolution.',
  ].join('\n'));
  assert.equal(summary.split('\n\n').length, 2);
  assert.doesNotMatch(summary, /•|all company changes/i);
});

test('French Company Review explains the same events in two concise paragraphs', async () => {
  const fr = JSON.parse(await read('../locales/fr.json'));
  const summary = getCompanyReviewSummary(SIREN, translator(fr));

  assert.equal(summary, [
    `Surveillance des annonces officielles du BODACC pour le SIREN ${SIREN}.`,
    '',
    'Détecte notamment les changements de dirigeant, les modifications du capital, les transferts de siège, les dépôts des comptes, les procédures judiciaires et les radiations.',
  ].join('\n'));
  assert.equal(summary.split('\n\n').length, 2);
  assert.doesNotMatch(summary, /•|tous les changements/i);
});

test('Company Review keeps the name, SIREN and BODACC source while creation stores its prior summary', async () => {
  const navigation = await read('./navigation.js');
  const reviewPresentation = navigation.match(
    /const renderReviewPresentation[\s\S]*?const validateReviewSummary/,
  )?.[0] || '';
  const companyReview = navigation.match(
    /const startCompanyReview[\s\S]*?const startUrlAnalysis/,
  )?.[0] || '';
  const createHandler = navigation.match(
    /reviewCreate\?\.addEventListener\('click',[\s\S]*?reviewCancel\?\.addEventListener/,
  )?.[0] || '';

  assert.match(reviewPresentation, /getWatchDisplayTitle\(analysis\)/);
  assert.match(reviewPresentation, /getCompanyReviewSummary\(siren, t\)/);
  assert.match(reviewPresentation, /reviewSource\.textContent = 'BODACC'/);
  assert.match(companyReview, /companyReviewSummary.*siren: monitoringSource\.siren/);
  assert.match(createHandler, /pendingAnalysis\.inputType === 'company'[\s\S]*?pendingAnalysis\.summary/);
});

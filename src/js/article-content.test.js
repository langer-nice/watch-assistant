import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanArticleContentForAnalysis,
  sanitizeMalformedCurrencyText,
} from './article-content.js';

test('removes credit, byline, and interface entries while preserving factual captions', () => {
  const cleaned = cleanArticleContentForAnalysis([
    'Image source, Northstar Visuals',
    'Getty Images',
    'Reuters',
    'Image source: Meridian Photo Agency Image caption: Swimmers enter the river after safety checks.',
    'Photograph: Clara Morgan',
    'By Maya Reporter, Environment correspondent',
    'Related stories',
    'The river remained open after inspectors completed water tests.',
  ].join('\n\n'));

  assert.equal(cleaned, [
    'Swimmers enter the river after safety checks.',
    'The river remained open after inspectors completed water tests.',
  ].join('\n\n'));
  assert.doesNotMatch(cleaned, /Northstar|Getty Images|Reuters|Meridian|Clara Morgan|Maya Reporter|Related stories/);
});

test('removes corrupted currency figures without changing valid financial formats', () => {
  assert.equal(
    sanitizeMalformedCurrencyText('The film had already earned $?6.'),
    'The film had already earned an unspecified amount.',
  );
  assert.equal(
    sanitizeMalformedCurrencyText('Budgets were $6 million, $6m, €6 million, and £6.5 million.'),
    'Budgets were $6 million, $6m, €6 million, and £6.5 million.',
  );
  assert.equal(
    cleanArticleContentForAnalysis('The distributor reported earnings of £�?6 million.'),
    'The distributor reported earnings of an unspecified amount.',
  );
});

test('removes access, subscription and advertising prompts while preserving editorial evidence', () => {
  const cleaned = cleanArticleContentForAnalysis([
    'La boulangerie Azur fait l’objet d’une fermeture administrative à Nice.',
    'Pourquoi s’abonner ? Je m’abonne. Je me connecte. Regarder une publicité.',
    'La police a constaté plusieurs manquements lors du contrôle.',
    'Profitez de tous nos articles.',
    'Subscribe to continue. Already a subscriber? Sign in.',
  ].join('\n\n'));

  assert.equal(cleaned, [
    'La boulangerie Azur fait l’objet d’une fermeture administrative à Nice.',
    'La police a constaté plusieurs manquements lors du contrôle.',
  ].join('\n\n'));
});

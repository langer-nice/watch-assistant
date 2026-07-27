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

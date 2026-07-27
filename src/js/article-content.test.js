import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanArticleContentForAnalysis } from './article-content.js';

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

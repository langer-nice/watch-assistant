import assert from 'node:assert/strict';
import test from 'node:test';
import { localizedGeneratedMediaTitle } from './media-watch-title.js';

test('a generated media title follows the interface language without changing its saved definition', () => {
  const watch = {
    inputType: 'text',
    request: 'Dis-moi quand Ed Sheeran est mentionné dans les médias',
    title: 'Ed Sheeran dans les médias',
    mediaMention: { subjects: ['Ed Sheeran'], matchMode: 'all' },
  };
  const before = JSON.stringify(watch);
  assert.equal(localizedGeneratedMediaTitle(watch, 'en'), 'Ed Sheeran media mentions');
  assert.equal(localizedGeneratedMediaTitle(watch, 'fr'), 'Ed Sheeran dans les médias');
  assert.equal(JSON.stringify(watch), before);
  assert.equal(localizedGeneratedMediaTitle({ ...watch, title: 'My favourite artist' }, 'fr'), null);
  assert.equal(localizedGeneratedMediaTitle({ ...watch, titleKey: 'watchData.example' }, 'en'), null);
  assert.equal(localizedGeneratedMediaTitle({
    ...watch,
    request: 'Tell me when Ed Sheeran is mentioned in the media',
    title: 'Ed Sheeran media mentions',
  }, 'fr'), 'Ed Sheeran dans les médias');
});

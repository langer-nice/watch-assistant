import test from 'node:test';
import assert from 'node:assert/strict';
import { getLocalizedWatchCopy, translateStoredWatchCopy } from './watch-copy-translation.js';
import { translateWatchCopy, createWatchTranslationMiddleware } from '../../server/watch-translation-api.js';

test('translates old text Watch copy without changing its source wording', async () => {
  const watch = { id: 'schengen', inputType: 'text', title: 'There is a change to the Schengen rule going from France to the UK', monitoringSummary: 'Monitoring there is a change to the Schengen rule going from France to the UK.' };
  let saved;
  await translateStoredWatchCopy(watch, 'fr', {
    fetchImpl: async (path, options) => {
      assert.equal(path, '/api/watch-translation');
      assert.equal(JSON.parse(options.body).title, watch.title);
      return { ok: true, json: async () => ({ title: 'Changement des règles Schengen pour aller de France au Royaume-Uni', summary: 'Surveillance des changements des règles Schengen pour aller de France au Royaume-Uni.' }) };
    },
    update: (id, language, copy) => { saved = { id, language, copy }; },
  });
  assert.equal(saved.copy.sourceTitle, watch.title);
  const localized = { ...watch, localizedCopy: { fr: saved.copy } };
  assert.match(getLocalizedWatchCopy(localized, 'fr', 'title'), /Schengen/);
  assert.equal(getLocalizedWatchCopy(localized, 'en', 'title'), null);
  assert.equal(getLocalizedWatchCopy({ ...localized, title: 'Edited title' }, 'fr', 'title'), null);
});

test('model receives constrained translation instructions and structured output', async () => {
  const copy = await translateWatchCopy({
    title: 'A flight under £100 to the UK', summary: 'Monitoring flights under £100 to the UK.',
    language: 'fr', apiKey: 'test', model: 'test-model',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const request = JSON.parse(options.body);
      assert.match(request.instructions, /thresholds/);
      assert.equal(request.text.format.type, 'json_schema');
      return { ok: true, json: async () => ({ output_text: JSON.stringify({ title: 'Un vol de moins de £100 vers le Royaume-Uni', summary: 'Surveillance des vols de moins de £100 vers le Royaume-Uni.' }) }) };
    },
  });
  assert.match(copy.title, /£100/);
});

test('translation endpoint rejects unsupported language and oversized input', async () => {
  const handler = createWatchTranslationMiddleware({ apiKey: 'test' });
  const response = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  await handler({ url: '/api/watch-translation', method: 'POST', body: { title: 'A', language: 'de' } }, response);
  assert.equal(response.statusCode, 400);
  await handler({ url: '/api/watch-translation', method: 'POST', body: { title: 'A'.repeat(501), language: 'fr' } }, response);
  assert.equal(response.statusCode, 400);
});

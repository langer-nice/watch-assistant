import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { validatePublicUrl } from './public-url-security.js';
import {
  DIAGNOSTIC_ARTICLES,
  createArticleAnalysisDiagnosticsMiddleware,
  describeNormalization,
  isArticleDiagnosticsAvailable,
  runArticleAnalysisDiagnostic,
} from './article-analysis-diagnostics.js';
import { createSourceDerivedFallback } from '../src/js/url-analysis.js';

const url = DIAGNOSTIC_ARTICLES[0].url;
const articleText = 'Sue Kreitzman is an artist in London. Her Mile End house is filled with art and is described as a living installation.';
const page = {
  title: 'The artist who turned her home into a living work of art',
  description: 'Sue Kreitzman has transformed her London home.',
  articleText,
  sourceUrl: url,
  siteName: 'BBC News',
  articleBodyCount: 1,
  includedArticleBodyCount: 1,
  extractionMethod: 'json_ld_article_body',
};
const aiValue = {
  watchTitle: 'Sue Kreitzman living art home',
  watchingFor: 'Monitor reporting about Sue Kreitzman and her living art installation.',
  description: 'Tracks Sue Kreitzman and her art-filled home.',
  storyFingerprint: [{ label: 'Sue Kreitzman', type: 'person' }],
  storyProfile: {
    storySummary: 'Sue Kreitzman has transformed her London home into a living art installation.',
    primaryPeople: ['Sue Kreitzman'], otherPeople: [], peopleRoles: [], locations: ['London'], organizations: [], eventTypes: [], distinctiveFacts: ['Her Mile End house is filled with art.'], aliases: [], uncertaintyPhrases: [],
  },
  analysisProvider: 'openai', analysisStatus: 'success', fallbackReasonCode: null,
};

const dependencies = (overrides = {}) => ({
  apiKey: 'sk-never-return-this',
  validateUrl: async (value) => new URL(value),
  fetchPageMetadataImpl: async () => page,
  generateWatchSuggestionImpl: async (options) => {
    options.onDiagnostic?.({ stage: 'parsed', value: aiValue });
    options.onDiagnostic?.({ stage: 'provider_attempt', attempt: 1, attempted: true, succeeded: true, durationMs: 42, outcomeCode: 'success', retryOccurred: false, retryScheduled: false, aborted: false });
    return aiValue;
  },
  ...overrides,
});

const invoke = async ({ path = '/api/article-analysis-diagnostics', method = 'POST', body = { url }, environment = { VERCEL_ENV: 'preview' }, options = {} } = {}) => {
  const request = Readable.from(method === 'POST' ? [JSON.stringify(body)] : []);
  request.method = method; request.url = path;
  let responseBody = ''; const headers = {};
  const response = { statusCode: 200, setHeader(name, value) { headers[name] = value; }, end(value = '') { responseBody = value; } };
  await createArticleAnalysisDiagnosticsMiddleware({ environment, ...dependencies(), ...options })(request, response, () => {});
  return { status: response.statusCode, headers, text: responseBody, body: headers['Content-Type']?.startsWith('application/json') ? JSON.parse(responseBody) : null };
};

test('diagnostic page and endpoint are unavailable in production but available locally and in Preview', async () => {
  assert.equal(isArticleDiagnosticsAvailable({ VERCEL_ENV: 'production', NODE_ENV: 'development' }), false);
  assert.equal(isArticleDiagnosticsAvailable({ VERCEL_ENV: 'preview', NODE_ENV: 'production' }), true);
  assert.equal(isArticleDiagnosticsAvailable({ NODE_ENV: 'development' }), true);
  for (const path of ['/api/article-analysis-diagnostics', '/api/article-analysis-diagnostics-page']) {
    const result = await invoke({ path, method: path.endsWith('-page') ? 'GET' : 'POST', environment: { VERCEL_ENV: 'production' } });
    assert.equal(result.status, 404);
    assert.equal(result.text, 'Not found');
  }
  const pageResult = await invoke({ path: '/api/article-analysis-diagnostics-page', method: 'GET' });
  assert.equal(pageResult.status, 200);
  assert.match(pageResult.text, /Article Analysis Diagnostics/);
  assert.equal((pageResult.text.match(/data-case-index=/g) || []).length, 6);
});

test('rejects missing, malformed, unsupported and non-allowlisted URLs', async () => {
  for (const value of [undefined, 'not a url', 'file:///etc/passwd', 'http://127.0.0.1/private', 'https://example.com/proxy']) {
    const result = await invoke({ body: value === undefined ? {} : { url: value } });
    assert.equal(result.status, 400);
    assert.match(result.body.safeErrorCode, /missing_url|malformed_url|unsupported_url_scheme|diagnostic_url_not_allowed/);
  }
});

test('the existing public URL validator still rejects loopback, private, link-local and reserved destinations', async () => {
  const unsafe = ['127.0.0.1', '10.0.0.2', '169.254.169.254', '192.0.2.10'];
  for (const address of unsafe) {
    await assert.rejects(validatePublicUrl(`http://${address}/article`), /Local URLs|public address/);
  }
  await assert.rejects(validatePublicUrl('ftp://example.com/a'), /HTTP and HTTPS/);
});

test('runs the reused pipeline and returns explicit safe AI provenance with distinct normalization stages', async () => {
  const result = await runArticleAnalysisDiagnostic(url, dependencies());
  assert.equal(result.ok, true);
  assert.equal(result.provenance, 'ai');
  assert.equal(result.openAI.attempted, true);
  assert.equal(result.openAI.succeeded, true);
  assert.equal(result.openAI.attempts[0].durationMs, 42);
  assert.equal(result.openAI.retryOccurred, false);
  assert.deepEqual(result.openAI.preNormalizationStoryFingerprint, [{ label: 'Sue Kreitzman', type: 'person' }]);
  assert.deepEqual(result.openAI.parsedStructuredFields.primaryPeople, ['Sue Kreitzman']);
  assert.deepEqual(result.openAI.parsedStructuredFields.works, []);
  assert.deepEqual(result.normalization.after, [{ label: 'Sue Kreitzman', type: 'person' }]);
  assert.equal(result.finalResult.zeroIdentifiersIsSuccessfulAi, false);
  assert.ok(result.extraction.analysisExcerpt.length <= 1200);
  assert.equal(result.extraction.analysisExcerpt, articleText);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /sk-never-return-this|Authorization|stack|raw provider/i);
});

test('successful AI analysis with zero identifiers remains AI and never invokes fallback', async () => {
  let fallbackCalled = false;
  const emptyAi = { ...aiValue, storyFingerprint: [], storyProfile: { ...aiValue.storyProfile, primaryPeople: [] } };
  const result = await runArticleAnalysisDiagnostic(url, dependencies({
    generateWatchSuggestionImpl: async ({ onDiagnostic }) => { onDiagnostic?.({ stage: 'provider', attempted: true, succeeded: true, outcomeCode: 'success' }); onDiagnostic?.({ stage: 'parsed', value: emptyAi }); return emptyAi; },
    fallbackImpl: () => { fallbackCalled = true; },
  }));
  assert.equal(result.provenance, 'ai');
  assert.equal(result.finalResult.zeroIdentifiersIsSuccessfulAi, true);
  assert.equal(fallbackCalled, false);
});

test('provider failure returns stable fallback provenance and candidate origin metadata', async () => {
  const result = await runArticleAnalysisDiagnostic(url, dependencies({
    generateWatchSuggestionImpl: async () => { const error = new Error('secret provider detail'); error.code = 'provider_auth_error'; throw error; },
    fallbackImpl: createSourceDerivedFallback,
  }));
  assert.equal(result.provenance, 'fallback');
  assert.equal(result.fallbackReasonCode, 'provider_auth_error');
  assert.equal(result.finalResult.limitedFallbackAnalysisWarning, true);
  assert.notEqual(result.classification, 'no_material_problem');
  assert.ok(Array.isArray(result.fallback.candidates));
  result.fallback.candidates.forEach((candidate) => {
    assert.match(candidate.rule, /^[a-z0-9_]+$/);
    assert.match(candidate.acceptanceRule, /^[a-z0-9_]+$/);
    assert.ok(candidate.sourceExcerpt.length <= 220);
    assert.equal(typeof candidate.classified, 'boolean');
    assert.equal(typeof candidate.reclassified, 'boolean');
  });
  assert.doesNotMatch(JSON.stringify(result), /secret provider detail/);
});

test('diagnostics safely expose retry attempts and validation stages without raw provider data', async () => {
  const result = await runArticleAnalysisDiagnostic(url, dependencies({
    generateWatchSuggestionImpl: async ({ onDiagnostic }) => {
      onDiagnostic?.({ stage: 'provider_attempt', attempt: 1, attempted: true, succeeded: false, durationMs: 20001, outcomeCode: 'provider_timeout', retryOccurred: false, retryScheduled: true, aborted: true });
      onDiagnostic?.({ stage: 'provider_attempt', attempt: 2, attempted: true, succeeded: false, durationMs: 31, outcomeCode: 'provider_schema_invalid', retryOccurred: true, retryScheduled: false, aborted: false, validation: { stage: 'structured_schema', path: 'storyFingerprint[0]', rule: 'identifier_shape_invalid', description: 'A Story Identifier had an invalid label or type.' } });
      const error = new Error('raw provider payload and secret header'); error.code = 'provider_schema_invalid'; throw error;
    },
    fallbackImpl: createSourceDerivedFallback,
  }));
  assert.equal(result.provenance, 'fallback');
  assert.equal(result.openAI.retryOccurred, true);
  assert.equal(result.openAI.aborted, true);
  assert.equal(result.openAI.attempts.length, 2);
  assert.deepEqual(result.openAI.validation, {
    stage: 'structured_schema', path: 'storyFingerprint[0]', rule: 'identifier_shape_invalid',
    description: 'A Story Identifier had an invalid label or type.',
  });
  assert.doesNotMatch(JSON.stringify(result), /raw provider payload|secret header|Authorization|stack/);
  assert.notEqual(result.classification, 'no_material_problem');
});

test('an empty fallback fingerprint is classified as fallback_generation_failure', async () => {
  const emptyFallback = {
    watchTitle: page.title, watchingFor: 'Fallback analysis could not identify a stable concept.',
    description: 'Fallback analysis could not identify a stable concept.', storyFingerprint: [], keywords: [],
    storyProfile: { storySummary: 'Fallback analysis could not identify a stable concept.', primaryPeople: [], otherPeople: [], peopleRoles: [], locations: [], organizations: [], eventTypes: [], distinctiveFacts: [], aliases: [], uncertaintyPhrases: [] },
    analysisProvider: 'deterministic', analysisStatus: 'fallback', fallbackReasonCode: 'provider_timeout',
  };
  const result = await runArticleAnalysisDiagnostic(url, dependencies({
    generateWatchSuggestionImpl: async ({ onDiagnostic }) => { onDiagnostic?.({ stage: 'provider_attempt', attempt: 1, attempted: true, succeeded: false, durationMs: 20000, outcomeCode: 'provider_timeout' }); const error = new Error('timeout'); error.code = 'provider_timeout'; throw error; },
    fallbackImpl: (_page, _url, { diagnosticCollector }) => { diagnosticCollector?.({ candidates: [], normalizedFingerprint: [], sourceText: articleText, sourceBlocks: [articleText] }); return emptyFallback; },
  }));
  assert.equal(result.classification, 'fallback_generation_failure');
});

test('normalization diagnostics report stable retained, removed and transformed rules', () => {
  const trace = describeNormalization([
    { label: 'Sue Kreitzman', type: 'person' },
    { label: 'Advice for focus', type: 'event' },
  ], [{ label: 'Sue Kreitzman', type: 'person' }]);
  assert.equal(trace.transformations[0].action, 'retained');
  assert.equal(trace.transformations[0].rule, 'automatic_identifier_retained');
  assert.equal(trace.transformations[1].action, 'removed');
  assert.match(trace.transformations[1].rule, /^[a-z0-9_]+$/);
});

test('normalization diagnostics retain overlapping event and location with stable rules', () => {
  const values = [
    { label: 'Festival Center', type: 'location' },
    { label: 'Festival Center shooting', type: 'event' },
    { label: 'Brain fog', type: 'symptom' },
    { label: 'Perimenopause', type: 'condition' },
  ];
  const trace = describeNormalization(values, values);
  assert.equal(trace.transformations.every(({ action }) => action === 'retained'), true);
  assert.equal(trace.transformations.every(({ rule }) => rule === 'automatic_identifier_retained'), true);
});

test('page requires explicit actions, prevents duplicate runs, keeps failures independent and never persists diagnostics', async () => {
  const { createArticleAnalysisDiagnosticsPage } = await import('./article-analysis-diagnostics-page.js');
  const html = createArticleAnalysisDiagnosticsPage();
  assert.doesNotMatch(html, /runAll\.click|DOMContentLoaded[^]*run\(/);
  assert.match(html, /if\(running\.has\(index\)\)return/);
  assert.match(html, /for\(let index=0;index<articles\.length;index\+=1\)await run\(index\)/);
  assert.match(html, /results\.set\(index,value\)/);
  assert.match(html, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
});

test('diagnostic routes are absent from normal navigation and production analysis functions are imported', async () => {
  const [navigation, diagnostics] = await Promise.all([
    readFile(new URL('../src/js/navigation.js', import.meta.url), 'utf8'),
    readFile(new URL('./article-analysis-diagnostics.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(navigation, /article-analysis-diagnostics/);
  assert.match(diagnostics, /fetchPageMetadata/);
  assert.match(diagnostics, /generateWatchSuggestion/);
  assert.match(diagnostics, /createSourceDerivedFallback/);
  assert.match(diagnostics, /normalizeAutomaticStoryFingerprint/);
  assert.match(diagnostics, /createStoryProfile/);
  assert.doesNotMatch(diagnostics, /watch-storage|localStorage|saveWatch|createWatch/);
});

import { interpretationSchema, monitoringPlanSchema, matchesStructuredSchema, validateInterpretation } from './watch-interpretation.js';
import { compileMonitoringPlan, validateCompiledMonitoringPlan } from './watch-capabilities.js';
import { canonicalJSON, contentFingerprint } from './structured-fingerprint.js';

export const WATCH_DEFINITION_VERSION = 'watch-definition.v1';
export const WATCH_DEFINITION_MAX_BYTES = 32768;
export const WATCH_DEFINITION_VALIDATOR = 'watch-definition-validator.v1';
export const WATCH_DEFINITION_COMPILER = 'watch-definition-compiler.v1';
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const enumeration = (...values) => ({ type: 'string', enum: values });
const omitted = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
// Request/language, graph, adapter, criteria and fingerprints each have one stored owner.
const inheritedPlanFields = ['originalRequest', 'subjects', 'conditions', 'condition', 'topics', 'exclusions', 'geographic', 'recurrence'];
const compactPlan = plan => omitted(plan, inheritedPlanFields);
const hash = { type: 'string', minLength: 64, maxLength: 64, pattern: '^[a-f0-9]{64}$' };
export const watchDefinitionSchema = object({
  definitionVersion: enumeration(WATCH_DEFINITION_VERSION), inputType: enumeration('text'),
  request: interpretationSchema.properties.originalRequest,
  category: enumeration('general', 'travel', 'news', 'property', 'price', 'events', 'entertainment', 'finance'),
  interpretation: object(omitted(interpretationSchema.properties, ['originalRequest'])),
  plan: object(omitted(monitoringPlanSchema.anyOf[1].properties, inheritedPlanFields)),
  metadata: object({ validatorVersion: enumeration(WATCH_DEFINITION_VALIDATOR),
    compilerVersion: enumeration(WATCH_DEFINITION_COMPILER), planFingerprint: hash }),
});
export const hasDefinitionVersion = value => value !== null && typeof value === 'object'
  && Object.hasOwn(value, 'definitionVersion');
const fail = (code = 'INVALID_WATCH_DEFINITION') => { throw Object.assign(new Error('Structured Watch definition is invalid.'), { code }); };
// PostgreSQL JSONB rejects NUL and unpaired UTF-16 surrogates; never repair source text.
const jsonbSafe = value => typeof value === 'string'
  ? !/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)
  : value && typeof value === 'object' ? Object.values(value).every(jsonbSafe) : true;
// Match PostgreSQL jsonb::text byte accounting, including separators, without key-order dependency.
const jsonbText = value => Array.isArray(value) ? `[${value.map(jsonbText).join(', ')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).map(([key, child]) => `${JSON.stringify(key)}: ${jsonbText(child)}`).join(', ')}}`
    : JSON.stringify(value);
export const watchDefinitionSize = value => new TextEncoder().encode(jsonbText(value)).length;
export const structuredMonitoringSource = criteria => {
  if (criteria.kind === 'media_literal') {
    const url = new URL('https://news.google.com/rss/search');
    for (const [key, value] of Object.entries({ q: criteria.query, hl: 'en-GB', gl: 'GB', ceid: 'GB:en' })) url.searchParams.set(key, value);
    return { type: 'feed', url: url.href, query: criteria.query };
  }
  if (criteria.kind === 'ecb_threshold') return { type: 'currency', provider: 'ecb', url: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml' };
  if (criteria.kind === 'bodacc_siren') return { type: 'bodacc', provider: 'dila', siren: criteria.siren, title: 'BODACC', discovery: 'official-company' };
  return fail();
};

// Full deterministic verification, shared by server and browser. No legacy request parser.
// Metadata is content provenance, NOT proof of owner approval or write authorization.
export const validateWatchDefinition = (value, source) => {
  if (!hasDefinitionVersion(value) || value.definitionVersion !== WATCH_DEFINITION_VERSION) fail('UNSUPPORTED_WATCH_VERSION');
  if (!matchesStructuredSchema(value, watchDefinitionSchema) || !jsonbSafe(value) || watchDefinitionSize(value) > WATCH_DEFINITION_MAX_BYTES) fail();
  try {
    const interpretation = validateInterpretation({ ...value.interpretation, originalRequest: value.request }, value.request);
    const expected = compileMonitoringPlan(interpretation, { structured: true, roleResolution:value.plan?.criteria?.roleResolution });
    if (canonicalJSON(value.plan) !== canonicalJSON(compactPlan(expected))
      || value.metadata.planFingerprint !== contentFingerprint(expected)) fail();
    if (source !== undefined && canonicalJSON(source) !== canonicalJSON(structuredMonitoringSource(expected.criteria))) fail('WATCH_SOURCE_MISMATCH');
  } catch (error) {
    if (['INVALID_WATCH_DEFINITION', 'WATCH_SOURCE_MISMATCH'].includes(error.code)) throw error;
    fail();
  }
  return structuredClone(value);
};

// Foundation only: callers still need authenticated confirmation in the next increment.
export const createWatchDefinition = (interpretation, plan, { category = interpretation?.domain === 'currency' ? 'finance' : interpretation?.domain === 'media_news' ? 'news' : 'general' } = {}) => {
  const validated = validateInterpretation(interpretation);
  validateCompiledMonitoringPlan(plan, validated, { structured: true });
  return validateWatchDefinition({ definitionVersion: WATCH_DEFINITION_VERSION, inputType: 'text', request: validated.originalRequest,
    category, interpretation: omitted(validated, ['originalRequest']), plan: compactPlan(plan),
    metadata: { validatorVersion: WATCH_DEFINITION_VALIDATOR, compilerVersion: WATCH_DEFINITION_COMPILER,
      planFingerprint: contentFingerprint(plan) } });
};
export const monitoringPlanForDefinition = value => {
  const definition = validateWatchDefinition(value);
  return compileMonitoringPlan({ ...definition.interpretation, originalRequest: definition.request }, { structured: true });
};
// Runtime Watches have identity/state outside the strictly allowlisted definition.
export const definitionFromWatch = watch => Object.fromEntries(Object.keys(watchDefinitionSchema.properties)
  .filter(key => Object.hasOwn(watch, key)).map(key => [key, watch[key]]));

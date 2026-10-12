import { hasDefinitionVersion, definitionFromWatch, validateWatchDefinition } from './watch-definition.js';

// A projection for the shared literal matcher, never a second stored definition.
export const structuredMediaCriteria = (watch, source = watch?.monitoringSource) => {
  if (!source) throw Object.assign(new Error('Missing approved source.'), { code: 'WATCH_SOURCE_MISMATCH', statusCode: 422 });
  const definition = validateWatchDefinition(definitionFromWatch(watch), source);
  const plan = definition.plan;
  if (plan.domain !== 'media_news' || plan.adapter !== 'google_news_literal_v1'
    || plan.criteria.kind !== 'media_literal') {
    throw Object.assign(new Error('Structured adapter is not enabled.'), { code: 'STRUCTURED_EXECUTION_DISABLED', statusCode: 409 });
  }
  return structuredClone(plan.criteria);
};
export const canExecuteStructuredMedia = watch => {
  if (!hasDefinitionVersion(watch)) return false;
  try { structuredMediaCriteria(watch); return true; } catch { return false; }
};

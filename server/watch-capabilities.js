import { createHash } from 'node:crypto';
import { validateInterpretation, validateMonitoringPlan } from '../src/js/watch-interpretation.js';
import { parseMediaMentionRequest } from '../src/js/media-mention-request.js';
import { mediaMentionSearchQuery, mediaSubjectAliases } from '../src/js/media-subject-aliases.js';
import { normalizeDecimal, parseCurrencyRequest, sameCurrencyCriteria, requestedCurrencyPolicy } from '../src/js/currency-watch.js';
import { parseCompanyWatchRequest } from '../src/js/company-watch-request.js';

const freeze = value => { Object.values(value).forEach(child => { if (child && typeof child === 'object') freeze(child); }); return Object.freeze(value); };
export const capabilityRegistry = freeze({ version: 'capabilities.v1', capabilities: [
  { adapter: 'google_news_literal_v1', domain: 'media_news', predicates: ['news_about', 'mentions_together', 'topic'],
    subjectTypes: ['person', 'organization', 'product', 'event', 'topic', 'place'], operators: ['and', 'not_literal'],
    constraints: ['literal_topics', 'literal_exclusions'], recurrence: ['unspecified', 'per_new_item'], resolution: 'individual_literal_name',
    implementation: 'src/js/watch-monitoring.js:matchFeedItemToMediaMention',
    limitations: ['literal_title_excerpt_only', 'approved_aliases_only', 'first_20_feed_items', 'non_exhaustive_coverage', 'baseline_before_alerts', 'edition_preference_not_geography'] },
  { adapter: 'ecb_reference_v1', domain: 'currency', predicates: ['numeric'], subjectTypes: ['currency'], operators: [],
    constraints: ['GBP_EUR', 'unit_base', 'gt', 'gte'], recurrence: ['once', 'crossing', 'changed_reference_observation'], resolution: 'explicit_currency_codes',
    implementation: 'src/js/currency-watch.js:evaluateCurrencyRate/applyCurrencyCheckResult',
    limitations: ['published_reference_rates_only', 'no_continuous_market_monitoring', 'one_observation_per_publication_date', 'daily_policy_requires_changed_rate'] },
  { adapter: 'bodacc_siren_v1', domain: 'official_company', predicates: ['official_registry_filing'], subjectTypes: ['organization'], operators: [],
    constraints: ['explicit_BODACC', 'valid_single_SIREN', 'France'], recurrence: ['unspecified', 'per_new_item'], resolution: 'request_supplied_SIREN',
    implementation: 'server/bodacc-api.js:fetchBodaccAnnouncements',
    limitations: ['BODACC_not_all_company_events', 'first_100_notices', 'company_identity_requires_source_verification', 'baseline_before_alerts'] },
] });
const canonical = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const interpretationFingerprint = value => createHash('sha256').update(canonical(value)).digest('hex');
const normal = value => value.trim().replace(/\s+/gu, ' ');
const same = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
// Reuse the legacy component grammar to reject query operators/qualifiers. This
// never rewrites the stored request or invokes legacy creation validation.
const safeLiteral = value => {
  if (/https?:\/\/|www\./iu.test(value)) return false;
  const parsed = parseMediaMentionRequest(`Monitor news about ${value}`);
  return parsed.recognized && parsed.query === value && !parsed.topics && !parsed.exclusions && !parsed.locale;
};

export const assessCapabilities = input => {
  let v;
  try { v = validateInterpretation(input); }
  catch (error) {
    const invalidReference = Array.isArray(input?.subjects) && input.subjects.length <= 16 && Array.isArray(input?.conditions)
      && input.conditions.length <= 32 && input.conditions.some(n => n?.op === 'predicate' && Array.isArray(n.subjects)
        && n.subjects.length <= 16 && n.subjects.some(id => !input.subjects.some(s => s?.id === id)));
    return { status: 'invalid_interpretation', registryVersion: capabilityRegistry.version,
      issues: [{ code: invalidReference ? 'invalid_subject_reference' : error.reason?.toLowerCase() || 'invalid_interpretation', field: 'interpretation' }],
      clarifications: [], plan: null, alternative: null };
  }
  const issues = [], clarifications = [];
  const add = (code, field) => { if (!issues.some(i => i.code === code && i.field === field)) issues.push({ code, field }); };
  const ask = (code, field, options = []) => { if (!clarifications.some(i => i.code === code && i.field === field)) clarifications.push({ code, field, options }); };
  const subjects = new Map(v.subjects.map(s => [s.id, s]));
  const nodes = new Map(v.conditions.map(n => [n.id, n]));
  const capability = capabilityRegistry.capabilities.find(c => c.domain === v.domain);
  v.ambiguities.forEach(a => ask(a.field === 'recurrence' ? 'ambiguous_recurrence' : 'ambiguous_requirement', a.field,
    a.field === 'recurrence' ? ['once', 'crossing', 'per_observation'] : []));
  v.unresolvedRequirements.forEach((_, i) => add('unresolved_requirement', `/unresolvedRequirements/${i}`));
  v.temporal.forEach((_, i) => add('unsupported_temporal_constraint', `/temporal/${i}`));
  v.subjects.forEach((s, i) => {
    if (s.kind !== 'individual') add('unsupported_group_membership', `/subjects/${i}`);
    else if (capability && !capability.subjectTypes.includes(s.type)) add('unsupported_subject_type', `/subjects/${i}`);
  });
  v.conditions.forEach((n, i) => { if (n.op === 'or') add('unsupported_independent_or', `/conditions/${i}`); });
  if (!capability && !(v.domain === 'unknown' && clarifications.length)) add('unsupported_source_type', 'domain');
  const referenced = new Set(v.conditions.flatMap(n => n.op === 'predicate' ? n.subjects : []));
  v.subjects.forEach((s, i) => { if (!referenced.has(s.id) && !v.subjects.some(g => g.members.includes(s.id))
    && !(clarifications.length && !v.conditions.length)) add('unbound_subject', `/subjects/${i}`); });
  let criteria;
  if (v.domain === 'media_news') {
    const positive = [], topics = [], excluded = [];
    const literal = (text, list, field) => {
      const label = normal(text);
      if (!safeLiteral(label)) add('unsupported_constraint', field);
      else if (!list.some(item => same(item, label))) list.push(label);
    };
    const read = (key, negative = false) => {
      const n = nodes.get(key); if (!n) return;
      const field = `/conditions/${v.conditions.indexOf(n)}`;
      if (n.op === 'and' && !negative) { n.args.forEach(child => read(child)); return; }
      if (n.op === 'not' && !negative) { read(n.args[0], true); return; }
      if (n.op !== 'predicate') { add(n.op === 'or' ? 'unsupported_independent_or' : 'unsupported_boolean_combination', field); return; }
      if (n.kind === 'news_about' || (!negative && n.kind === 'mentions_together')) {
        n.subjects.forEach(id => { const s = subjects.get(id); if (s.kind === 'individual') literal(s.label, negative ? excluded : positive, field); });
      } else if (n.kind === 'topic') {
        if (!v.evidence.some(e => e.path === field && e.text.includes(n.value))) add('unsupported_constraint', field);
        else literal(n.value, negative ? excluded : topics, field);
      } else add(['event', 'relationship'].includes(n.kind) ? 'unsupported_event_detection' : 'unsupported_constraint', field);
    };
    if (v.condition) read(v.condition);
    v.exclusions.forEach(key => read(key, true));
    v.topics.forEach((t, i) => { if (t.role === 'required') {
      if (!v.evidence.some(e => e.path === `/topics/${i}` && e.text.includes(t.label))) add('unsupported_constraint', `/topics/${i}`);
      else literal(t.label, topics, `/topics/${i}`);
    } });
    v.geographic.forEach((_, i) => add('unsupported_geographic_constraint', `/geographic/${i}`));
    if (!['unspecified', 'per_new_item'].includes(v.recurrence)) add('unsupported_recurrence', 'recurrence');
    if (positive.length > 8 || topics.length > 8 || excluded.length > 8) add('unsupported_constraint', 'criteria');
    if (!positive.length && !issues.length && !clarifications.length) add('unsupported_predicate', 'condition');
    if (positive.some(p => excluded.some(x => mediaSubjectAliases(p).some(alias => mediaSubjectAliases(x).some(other => same(alias, other)))))
      || topics.some(t => excluded.some(x => same(t, x)))) return { status: 'invalid_interpretation', registryVersion: capabilityRegistry.version,
        issues: [{ code: 'contradictory_criteria', field: 'conditions' }], clarifications: [], plan: null, alternative: null };
    if (v.topics.some(t => t.role === 'coverage_focus' && topics.some(required => same(required, normal(t.label))))) return {
      status: 'invalid_interpretation', registryVersion: capabilityRegistry.version,
      issues: [{ code: 'contradictory_topic_role', field: 'topics' }], clarifications: [], plan: null, alternative: null };
    if (positive.length) criteria = { kind: 'media_literal', subjects: positive, matchMode: 'all', topics, exclusions: excluded,
      query: mediaMentionSearchQuery({ subjects: positive, topics, exclusions: excluded }), edition: 'GB:en' };
    if (criteria?.query.length > 500) add('unsupported_constraint', 'criteria.query');
  } else if (v.domain === 'currency') {
    const n = nodes.get(v.condition);
    if (v.conditions.length !== 1 || n?.op !== 'predicate' || n.kind !== 'numeric') add('unsupported_boolean_combination', 'conditions');
    else if (!['gt', 'gte'].includes(n.operator)) add('unsupported_threshold', 'conditions');
    else {
      const base = subjects.get(n.subjects[0]), quote = subjects.get(n.subjects[1]);
      const c = { base: base.canonicalCode, quote: quote.canonicalCode, operator: n.operator, target: normalizeDecimal(n.amount) };
      const legacy = parseCurrencyRequest(v.originalRequest);
      if (legacy && !sameCurrencyCriteria(c, legacy)) add('unsupported_threshold', 'conditions');
      // Preserve the legacy guard against extra numeric conditions or a nonunit base.
      const numbers = v.originalRequest.match(/[0-9]+(?:[.,][0-9]+)?/gu) || [];
      if (numbers.length > 2 || (numbers.length === 2 && numbers[0] !== '1')) add('unsupported_threshold', 'conditions');
      const span = v.evidence.find(e => e.path === `/subjects/${v.subjects.indexOf(base)}/label`);
      const amount = v.originalRequest.slice(0, span.start).match(/(\d+(?:[.,]\d+)?)\s*$/u)?.[1];
      if (amount) { try { if (normalizeDecimal(amount) !== '1') add('unsupported_constraint', 'unit_base'); }
        catch { add('unsupported_constraint', 'unit_base'); } }
      let policy;
      if (v.recurrence === 'unspecified') ask('ambiguous_recurrence', 'recurrence', ['once', 'crossing', 'per_observation']);
      else if (['once', 'crossing'].includes(v.recurrence)) policy = v.recurrence;
      else if (v.recurrence === 'per_observation' && requestedCurrencyPolicy(v.originalRequest) === 'daily') policy = 'daily';
      else add('unsupported_recurrence', 'recurrence');
      if (policy) criteria = { kind: 'ecb_threshold', ...c, policy };
    }
    v.topics.forEach((_, i) => add('unsupported_constraint', `/topics/${i}`));
    v.exclusions.forEach((_, i) => add('unsupported_constraint', `/exclusions/${i}`));
    v.geographic.forEach((_, i) => add('unsupported_geographic_constraint', `/geographic/${i}`));
  } else if (v.domain === 'official_company') {
    const n = nodes.get(v.condition);
    if (v.conditions.length !== 1 || n?.op !== 'predicate' || n.kind !== 'event') add('unsupported_boolean_combination', 'conditions');
    else if (n.value === 'official_registration_change' && /\bBODACC\b/iu.test(v.originalRequest)) add('unsupported_event_detection', 'condition');
    else if (n.value !== 'official_registry_filing' || !/\bBODACC\b/iu.test(v.originalRequest)) add('unsupported_source_type', 'condition');
    if (v.subjects.length !== 1 || v.subjects[0]?.type !== 'organization') add('unsupported_subject_resolution', 'subjects');
    const company = parseCompanyWatchRequest(v.originalRequest);
    if (!company.valid) ask('missing_company_identifier', 'SIREN', ['valid_single_SIREN']);
    v.geographic.forEach((g, i) => { if (g.appliesTo !== 'source' || !['fr', 'france'].includes(g.label.toLowerCase())) add('unsupported_geographic_constraint', `/geographic/${i}`); });
    v.topics.forEach((_, i) => add('unsupported_constraint', `/topics/${i}`));
    v.exclusions.forEach((_, i) => add('unsupported_constraint', `/exclusions/${i}`));
    if (!['unspecified', 'per_new_item'].includes(v.recurrence)) add('unsupported_recurrence', 'recurrence');
    if (company.valid) criteria = { kind: 'bodacc_siren', siren: company.siren, country: 'FR' };
  } else v.conditions.forEach((n, i) => { if (n.op === 'predicate') add(['event', 'relationship'].includes(n.kind)
    ? 'unsupported_event_detection' : 'unsupported_predicate', `/conditions/${i}`); });
  const result = { status: issues.length ? 'unsupported' : clarifications.length ? 'clarification_required' : 'supported',
    registryVersion: capabilityRegistry.version, issues, clarifications, plan: null, alternative: null };
  if (v.domain === 'media_news' && issues.length && issues.every(i => i.code === 'unsupported_independent_or')
    && !clarifications.length && !v.exclusions.length && v.conditions.every(n => n.op === 'or' || (n.op === 'predicate' && n.kind === 'news_about'))
    && !v.subjects.some(s => s.kind !== 'individual')) {
    result.alternative = { kind: 'separate_subject_requests', subjects: v.subjects.map(s => s.id), requiresConfirmation: true };
  }
  if (result.status === 'supported') {
    result.plan = validateMonitoringPlan({ schemaVersion: 'monitoring-plan.v1', interpretationVersion: v.schemaVersion,
      registryVersion: capabilityRegistry.version, interpretationRef: interpretationFingerprint(v), originalRequest: v.originalRequest,
      status: 'supported', executable: false, domain: v.domain, adapter: capability.adapter,
      subjects: v.subjects.map(s => ({ ...s, label: normal(s.label) })), conditions: v.conditions, condition: v.condition,
      topics: v.topics, exclusions: v.exclusions, geographic: v.geographic, recurrence: v.recurrence,
      criteria, limitations: capability.limitations });
  }
  return result;
};

export const compileMonitoringPlan = interpretation => {
  const assessment = assessCapabilities(interpretation);
  if (assessment.status !== 'supported') throw Object.assign(new Error('No supported monitoring plan.'), { code: 'MONITORING_PLAN_NOT_SUPPORTED', assessment });
  return assessment.plan;
};
export const validateCompiledMonitoringPlan = (plan, interpretation) => {
  validateMonitoringPlan(plan);
  const expected = compileMonitoringPlan(interpretation);
  if (canonical(plan) !== canonical(expected)) throw Object.assign(new Error('Monitoring plan does not match its interpretation.'), { code: 'INVALID_MONITORING_PLAN' });
  return structuredClone(plan);
};

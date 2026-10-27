import { interpretationSchema, matchesStructuredSchema } from '../src/js/watch-interpretation.js';

const fail = () => { throw Object.assign(new Error('Structured interpretation failed validation.'),
  { code: 'INTERPRETATION_FAILED', statusCode: 502 }); };
const requireSafe = condition => { if (!condition) fail(); };
// A bounded semantic vocabulary rule, not an execution route or company allowlist.
// Unknown meanings keep their existing path; no provider/model/adapter is selected here.
const publication = /^(?:Tell me|Let me know|Notify me|Alert me) when [\s\S]*\b(?:publishes|releases|announces)\b[\s\S]*\bearnings\s+(?:results|report)\b/iu;
const publicationRequest = /^(?:Tell me|Let me know|Notify me|Alert me) when (?<entity>.+?) (?<verb>publishes|releases|announces) its (?<period>Q[1-4] \d{4}) earnings (?<object>results|report)(?:, including (?<focus>.+?))?\.$/u;
const eventValues = new Set(['earnings_results_publication', 'earnings_release', 'earnings_announcement',
  'earnings_results', 'earnings_report', 'official_company_announcement']);
const empty = values => values.length === 0;
const span = (request, text) => {
  const start = request.indexOf(text);
  requireSafe(start >= 0 && request.indexOf(text, start + 1) < 0);
  return { text, start, end: start + text.length };
};

// Input is a schema-checked reconstructed draft, before semantic validation.
// Only source-supported representation differences are normalized. All existing
// evidence is checked before redundant representations can be replaced.
export const canonicalizeWatchInterpretation = (value, request = value?.originalRequest) => {
  if (typeof request !== 'string' || !publication.test(request)) return value;
  requireSafe(matchesStructuredSchema(value, interpretationSchema) && value.originalRequest === request);
  const match = publicationRequest.exec(request);
  requireSafe(match);
  const { entity, period, focus } = match.groups;
  requireSafe(!/\b(?:and|or|not|except|excluding|either|maybe|perhaps)\b|[&,;/]/iu.test(entity));
  requireSafe(value.subjects.length === 1 && value.conditions.length === 1
    && empty(value.exclusions) && empty(value.geographic)
    && empty(value.ambiguities) && empty(value.unresolvedRequirements));
  const subject = value.subjects[0], node = value.conditions[0];
  requireSafe(subject.kind === 'individual' && subject.type === 'organization' && subject.label === entity
    && empty(subject.members) && empty(subject.membership) && subject.quantifier === null && subject.canonicalCode === null);
  requireSafe(subject.id !== node.id && value.condition === node.id && node.op === 'predicate'
    && node.subjects.length === 1 && node.subjects[0] === subject.id
    && node.operator === null && node.amount === null && node.unit === null
    && ((node.kind === 'news_about' && node.value === null) || (node.kind === 'event' && eventValues.has(node.value))));
  requireSafe(['ongoing_news', 'event', 'change', 'unknown'].includes(value.intent)
    && ['media_news', 'official_company', 'other', 'unknown'].includes(value.domain));
  for (const evidence of value.evidence) {
    requireSafe(evidence.end > evidence.start && request.slice(evidence.start, evidence.end) === evidence.text);
    // Validate pointers even for direct helper calls, not only reconstruction callers.
    let target = value;
    for (const key of evidence.path.slice(1).split('/')) {
      requireSafe(target != null && Object.hasOwn(target, key)); target = target[key];
    }
  }
  const grounded = path => value.evidence.some(e => e.path === path);
  requireSafe(value.evidence.some(e => e.path === '/subjects/0/label' && e.text === entity)
    && grounded('/conditions/0'));
  requireSafe(value.temporal.length <= 1 && value.temporal.every((t, i) =>
    t.text === period && t.relation === 'unspecified' && t.start === null && t.end === null && t.timezone === null
    && grounded(`/temporal/${i}`)));

  const labels = focus ? focus.split(/,\s*|\s+or\s+/u).map(text => text.trim()) : [];
  requireSafe(labels.length <= 8 && labels.every(text => text && !/\b(?:only|except|excluding|without|must|before|after|from|official|source|daily|every|and)\b/iu.test(text)));
  requireSafe(new Set(labels).size === labels.length);
  // Every supplied topic must map to a source detail. Inferred required roles
  // can become coverage_focus only because the source explicitly says including.
  requireSafe(value.topics.every((topic, i) => labels.includes(topic.label) && grounded(`/topics/${i}`)));
  const entitySpan = span(request, entity), periodSpan = span(request, period);
  const clause = request.slice(entitySpan.start, focus ? request.indexOf(', including ') : -1);
  const evidence = [
    { path: '/subjects/0/label', ...entitySpan },
    { path: '/conditions/0', ...span(request, clause) },
    { path: '/temporal/0', ...periodSpan },
    ...labels.map((label, i) => ({ path: `/topics/${i}`, ...span(request, label) })),
  ];
  return { ...value, intent: 'event', domain: 'media_news',
    subjects: [{ ...subject, id: 's1' }],
    conditions: [{ ...node, id: 'c1', kind: 'event', subjects: ['s1'], value: 'earnings_results_publication' }],
    condition: 'c1', topics: labels.map(label => ({ label, role: 'coverage_focus' })),
    temporal: [{ text: period, relation: 'unspecified', start: null, end: null, timezone: null }], evidence };
};

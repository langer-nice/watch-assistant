// Meaning only: this contract cannot authorize execution or supply provider URLs.
const str = (maxLength = 200) => ({ type: 'string', minLength: 1, maxLength });
const enumeration = (...values) => ({ type: 'string', enum: values });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const array = (items, maxItems = 16, minItems = 0) => ({ type: 'array', items, minItems, maxItems });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const id = { ...str(32), pattern: '^[a-z][a-z0-9_]*$' };
const references = array(id);
const membership = object({ attribute: enumeration('nationality', 'sport', 'tour', 'country_association', 'industry', 'other'), operator: enumeration('eq', 'in'), values: array(str(), 8, 1) });
const subjectFields = { id,
  type: enumeration('person', 'organization', 'product', 'event', 'topic', 'currency', 'place', 'unknown'),
  label: str(), canonicalCode: nullable(enumeration('GBP', 'EUR')) };
const groupFields = { ...subjectFields, canonicalCode: { type: 'null' },
  type: enumeration('person', 'organization', 'product', 'event', 'topic', 'place', 'unknown') };
const subject = { anyOf: [
  object({ ...subjectFields, kind: enumeration('individual'), membership: array(membership, 0), members: array(id, 0), quantifier: { type: 'null' } }),
  object({ ...groupFields, kind: enumeration('open_group'), membership: array(membership, 8, 1), members: references, quantifier: enumeration('any', 'all') }),
  object({ ...groupFields, kind: enumeration('closed_group'), membership: array(membership, 0), members: array(id, 16, 2), quantifier: enumeration('any', 'all') }),
] };
const evidencePath = { ...str(160), pattern: '^/(?:subjects/[0-9]+/(?:label|membership/[0-9]+)|conditions/[0-9]+|topics/[0-9]+|temporal/[0-9]+|geographic/[0-9]+|unresolvedRequirements/[0-9]+|recurrence)$' };
const predicate = object({ id, op: enumeration('predicate'),
  kind: enumeration('news_about', 'mentions_together', 'event', 'relationship', 'numeric', 'topic', 'temporal', 'geographic'),
  subjects: references, value: nullable(str()), operator: nullable(enumeration('gt', 'gte', 'lt', 'lte', 'eq')),
  amount: nullable({ ...str(26), pattern: '^-?\\d{1,12}(?:\\.\\d{1,12})?$' }), unit: nullable(str(80)) });
const condition = { anyOf: [predicate,
  object({ id, op: enumeration('and', 'or'), args: array(id, 16, 2) }),
  object({ id, op: enumeration('not'), args: array(id, 1, 1) })] };

export const interpretationSchema = object({
  schemaVersion: enumeration('interpretation.v1'), originalRequest: str(500),
  language: enumeration('en', 'fr', 'mixed', 'und'),
  intent: enumeration('ongoing_news', 'event', 'numeric_condition', 'change', 'unknown'),
  domain: enumeration('media_news', 'currency', 'official_company', 'ticket_availability', 'other', 'unknown'),
  subjects: array(subject), conditions: array(condition, 32), condition: nullable(id),
  topics: array(object({ label: str(), role: enumeration('required', 'coverage_focus') })),
  temporal: array(object({ text: str(), relation: enumeration('before', 'after', 'between', 'at', 'relative', 'unspecified'),
    start: nullable(str(80)), end: nullable(str(80)), timezone: nullable(str(80)) }), 8),
  geographic: array(object({ label: str(), appliesTo: enumeration('subject', 'event', 'source', 'content_language') }), 8),
  exclusions: references,
  recurrence: enumeration('once', 'crossing', 'per_observation', 'per_new_item', 'unspecified'),
  ambiguities: array(object({ field: str(), alternatives: array(str(), 8, 2), question: str(300) }), 8),
  unresolvedRequirements: array(object({ text: str(), reason: str() }), 16),
  evidence: array(object({ path: evidencePath, start: { type: 'integer', minimum: 0, maximum: 499 },
    end: { type: 'integer', minimum: 1, maximum: 500 }, text: str(500) }), 96),
});
// Original wording is server-owned, never copied or rewritten by the model.
export const interpretationOutputSchema = object(Object.fromEntries(
  Object.entries(interpretationSchema.properties).filter(([key]) => key !== 'originalRequest'),
));
// Models quote source text; only application code computes offsets. A unique
// exact context may disambiguate a repeated quote; otherwise fail closed.
interpretationOutputSchema.properties.evidence = array(object({ path: evidencePath,
  quote: str(500), context: nullable(str(500)) }), 96);
// Future boundary only; no adapter, source, approval or compiler exists in this phase.
const pendingPlanSchema = object({ schemaVersion: enumeration('monitoring-plan.v1'),
  interpretationVersion: enumeration('interpretation.v1'), originalRequest: str(500),
  status: enumeration('not_assessed'), executable: { type: 'boolean', enum: [false] } });
const mediaCriteria = object({ kind: enumeration('media_literal'), subjects: array(str(), 8, 1),
  matchMode: enumeration('all'), topics: array(str(), 8), exclusions: array(str(), 8), query: str(500),
  edition: enumeration('GB:en') });
const currencyCriteria = object({ kind: enumeration('ecb_threshold'), base: enumeration('GBP', 'EUR'), quote: enumeration('GBP', 'EUR'),
  operator: enumeration('gt', 'gte'), target: { ...str(25), pattern: '^\\d{1,12}(?:\\.\\d{1,12})?$' }, policy: enumeration('once', 'crossing', 'daily') });
const companyCriteria = object({ kind: enumeration('bodacc_siren'), siren: { ...str(9), pattern: '^\\d{9}$' }, country: enumeration('FR') });
const compiledPlanSchema = object({ schemaVersion: enumeration('monitoring-plan.v1'), interpretationVersion: enumeration('interpretation.v1'),
  registryVersion: enumeration('capabilities.v1'), originalRequest: str(500),
  interpretationRef: { ...str(64), pattern: '^[a-f0-9]{64}$' }, status: enumeration('supported'), executable: { type: 'boolean', enum: [false] },
  domain: enumeration('media_news', 'currency', 'official_company'),
  adapter: enumeration('google_news_literal_v1', 'ecb_reference_v1', 'bodacc_siren_v1'),
  subjects: array(subject), conditions: array(condition, 32), condition: id,
  topics: interpretationSchema.properties.topics, exclusions: references,
  geographic: interpretationSchema.properties.geographic,
  recurrence: interpretationSchema.properties.recurrence,
  criteria: { anyOf: [mediaCriteria, currencyCriteria, companyCriteria] }, limitations: array(str(100), 16, 1),
});
export const monitoringPlanSchema = { anyOf: [pendingPlanSchema, compiledPlanSchema] };

const fail = reason => { throw Object.assign(new Error('Structured interpretation failed validation.'),
  { code: 'INTERPRETATION_FAILED', statusCode: 502, ...(reason ? { reason } : {}) }); };
const conforms = (value, schema) => {
  if (schema.anyOf) return schema.anyOf.some(candidate => conforms(value, candidate));
  if (schema.enum && !schema.enum.includes(value)) return false;
  switch (schema.type) {
    case 'null': return value === null;
    case 'boolean': return typeof value === 'boolean';
    case 'integer': return Number.isSafeInteger(value) && value >= schema.minimum && value <= schema.maximum;
    case 'string': return typeof value === 'string' && value.trim().length >= (schema.minLength ?? 0)
      && value.length <= (schema.maxLength ?? Infinity) && (!schema.pattern || new RegExp(schema.pattern, 'u').test(value));
    case 'array': return Array.isArray(value) && value.length >= schema.minItems && value.length <= schema.maxItems
      && value.every(item => conforms(item, schema.items));
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value)
      && Object.keys(value).length === schema.required.length
      && schema.required.every(key => Object.hasOwn(value, key) && conforms(value[key], schema.properties[key]));
    default: return false;
  }
};
// Shared strict schema checking; interpretation-specific evidence checks remain below.
export { conforms as matchesStructuredSchema };
const unique = values => new Set(values).size === values.length;
const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
const countryWords = { IT: ['italian', 'italians', 'italien', 'italiens', 'italienne', 'italiennes'],
  FR: ['french', 'francais', 'francaise', 'francaises'], GB: ['british', 'britannique', 'britanniques'],
  US: ['american', 'americain', 'americaine', 'americains', 'americaines'] };
const pointer = (value, path) => {
  if (!/^\/(?:[a-zA-Z]+|\d+)(?:\/(?:[a-zA-Z]+|\d+))*$/u.test(path)) fail();
  for (const key of path.slice(1).split('/')) {
    if (value == null || !Object.hasOwn(value, key)) fail();
    value = value[key];
  }
  return value;
};

export const reconstructInterpretation = (output, request) => {
  if (typeof request !== 'string' || !conforms(output, interpretationOutputSchema)) fail();
  const locate = (text, source) => {
    const start = source.indexOf(text);
    if (start < 0 || source.indexOf(text, start + 1) >= 0) fail();
    return start;
  };
  const value = { ...structuredClone(output), originalRequest: request };
  value.evidence = output.evidence.map(({ path, quote, context }) => {
    pointer(value, path);
    const start = context === null ? locate(quote, request) : locate(context, request) + locate(quote, context);
    return { path, text: quote, start, end: start + quote.length };
  });
  // Only lexical/canonical equivalents are normalized, never semantic shapes.
  for (const s of value.subjects) for (const m of s.membership) {
    m.values = m.values.map(raw => {
      const word = fold(raw);
      if (['nationality', 'country_association'].includes(m.attribute)) {
        return Object.keys(countryWords).find(code => countryWords[code].includes(word))
          || (/^[a-z]{2}$/u.test(word) ? word.toUpperCase() : raw);
      }
      if (m.attribute === 'tour' && ['atp', 'wta'].includes(word)) return word.toUpperCase();
      if (m.attribute === 'sport' && word === 'tennis') return 'tennis';
      if (m.attribute === 'industry' && ['fashion', 'mode'].includes(word)) return 'fashion';
      return raw;
    }).sort();
  }
  return validateInterpretation(value, request);
};

export const validateInterpretation = (value, request = value?.originalRequest) => {
  if (!conforms(value, interpretationSchema) || value.originalRequest !== request) fail();
  const subjects = new Map(value.subjects.map(s => [s.id, s]));
  const nodes = new Map(value.conditions.map(n => [n.id, n]));
  if (subjects.size !== value.subjects.length || nodes.size !== value.conditions.length
    || [...subjects.keys()].some(key => nodes.has(key))) fail();
  // Meaning consistency only, never capability approval or domain rewriting.
  const predicates = value.conditions.filter(n => n.op === 'predicate');
  const news = predicates.some(n => ['news_about', 'mentions_together'].includes(n.kind));
  const officialEvents = new Set(['official_company_announcement', 'official_registry_filing', 'official_registration_change']);
  const official = predicates.some(n => n.kind === 'event' && officialEvents.has(n.value));
  if ((value.intent === 'ongoing_news' && value.domain !== 'media_news')
    || (news && value.domain !== 'media_news')
    || (value.domain === 'official_company' && (!['event', 'change'].includes(value.intent) || !official))
    || (value.domain === 'currency' && (value.intent !== 'numeric_condition' || !predicates.some(n => n.kind === 'numeric')))
    || (value.domain === 'ticket_availability' && value.intent !== 'event')) fail('DOMAIN_PREDICATE_CONFLICT');
  for (const evidence of value.evidence) {
    pointer(value, evidence.path);
    if (evidence.end <= evidence.start || request.slice(evidence.start, evidence.end) !== evidence.text) fail();
  }
  const grounded = path => value.evidence.some(e => e.path === path);
  value.subjects.forEach((s, index) => {
    if (!grounded(`/subjects/${index}/label`)
      || !value.evidence.some(e => e.path === `/subjects/${index}/label` && fold(e.text) === fold(s.label))) fail();
    if (!unique(s.members) || s.members.some(key => !subjects.has(key) || key === s.id)
      || s.members.some(key => subjects.get(key).kind !== 'individual')) fail();
    if (s.kind === 'individual' && (s.members.length || s.membership.length || s.quantifier !== null)) fail();
    if (s.kind !== 'individual' && (!s.quantifier || (s.kind === 'open_group' ? !s.membership.length : (!s.members.length || s.membership.length)))) fail();
    if (s.canonicalCode && (s.type !== 'currency' || !new RegExp(s.canonicalCode === 'GBP'
      ? '^(?:gbp|pounds?(?: sterling)?|sterling|livres?(?: sterling)?|£)$'
      : '^(?:eur|euros?|€)$', 'u').test(fold(s.label)))) fail();
    s.membership.forEach((m, i) => {
      const path = `/subjects/${index}/membership/${i}`;
      if (!grounded(path) || !unique(m.values) || (m.operator === 'eq' && m.values.length !== 1)) fail();
      const spans = value.evidence.filter(e => e.path === path).map(e => e.text).join(' ');
      const words = fold(spans).match(/[\p{L}\p{N}]+/gu) || [];
      if (['nationality', 'country_association'].includes(m.attribute) && m.values.some(code =>
        !/^[A-Z]{2}$/u.test(code) || (!new RegExp(`(?:^|[^\\p{L}\\p{N}])${code}(?:$|[^\\p{L}\\p{N}])`, 'u').test(spans)
          && !(countryWords[code] || []).some(word => words.includes(word))))) fail();
      if (['sport', 'tour', 'industry'].includes(m.attribute) && m.values.some(v =>
        !words.includes(fold(v)) && !(m.attribute === 'industry' && v === 'fashion' && words.includes('mode')))) fail();
    });
    if (!unique(s.membership.map(m => m.attribute))) fail();
    if (s.membership.some(m => m.attribute === 'other') && !value.unresolvedRequirements.length) fail();
  });
  const visiting = new Set(), reached = new Set();
  const walk = (key, depth = 0) => {
    if (!nodes.has(key) || depth > 8 || visiting.has(key)) fail();
    if (reached.has(key)) return;
    visiting.add(key);
    const node = nodes.get(key);
    if (node.op !== 'predicate') {
      if (!unique(node.args)) fail();
      node.args.forEach(child => walk(child, depth + 1));
      // Reject direct A AND NOT A, and A OR NOT A (a silently universal scope).
      const negated = node.args.filter(child => nodes.get(child)?.op === 'not').map(child => nodes.get(child).args[0]);
      if (negated.some(child => node.args.includes(child))) fail();
    }
    visiting.delete(key); reached.add(key);
  };
  if (value.condition) walk(value.condition);
  value.exclusions.forEach(key => walk(key));
  if (!unique(value.exclusions) || (value.condition && value.exclusions.includes(value.condition)) || reached.size !== nodes.size) fail();
  if ((!value.condition || !value.subjects.length) && !value.ambiguities.length && !value.unresolvedRequirements.length) fail();
  if (value.recurrence !== 'unspecified') {
    const cues = {
      once: /\b(?:once|one time|une seule fois)\b/iu,
      crossing: /\b(?:cross(?:es|ing)?|franchit|franchissement)\b/iu,
      per_observation: /\b(?:each observation|every observation|every published rate|chaque observation|chaque publication)\b/iu,
      per_new_item: /\b(?:each new article|every new article|each new item|chaque nouvel article|chaque nouvelle publication)\b/iu,
    };
    if (!value.evidence.some(e => e.path === '/recurrence' && cues[value.recurrence].test(e.text))) fail();
  }
  if (value.domain === 'currency' && /\b(?:whenever|each time|every time|chaque fois)\b/iu.test(request)
    && value.recurrence === 'unspecified' && !value.ambiguities.some(a => a.field === 'recurrence')) fail();
  // Obvious negative qualifiers cannot disappear even when an AI returns valid JSON.
  if (/\b(?:excluding|except|without|sauf|sans|hors)\b/iu.test(request)
    && !value.exclusions.length && !value.conditions.some(n => n.op === 'not')
    && !value.unresolvedRequirements.length && !value.ambiguities.length) fail();
  value.conditions.forEach((n, index) => {
    if (!grounded(`/conditions/${index}`)) fail();
    if (n.op !== 'predicate') return;
    if (!n.subjects.length || !unique(n.subjects) || n.subjects.some(key => !subjects.has(key))) fail();
    if (n.kind === 'news_about' && n.subjects.length !== 1) fail();
    if (n.kind === 'news_about' && n.value !== null) fail();
    if (['news_about', 'mentions_together', 'relationship'].includes(n.kind)
      && n.subjects.some(key => !value.evidence.some(e => e.path === `/conditions/${index}`
        && fold(e.text).includes(fold(subjects.get(key).label))))) fail('CONDITION_EVIDENCE_MISMATCH');
    if (n.kind === 'event' && officialEvents.has(n.value)) {
      // An organization name alone never establishes an official-source request.
      const spans = value.evidence.filter(e => e.path === `/conditions/${index}`).map(e => e.text).join(' ');
      if (!/\b(?:official|officiels?|officielles?|issuer|emetteur|registry|registre|bodacc)\b/u.test(fold(spans))) fail('OFFICIAL_SOURCE_UNGROUNDED');
      if (n.subjects.some(key => subjects.get(key).type !== 'organization')) fail('DOMAIN_PREDICATE_CONFLICT');
    }
    if (n.kind === 'numeric') {
      if (!n.operator || !n.amount || !n.unit || (value.domain === 'currency' && Number(n.amount) <= 0)) fail();
      const span = value.evidence.filter(e => e.path === `/conditions/${index}`).map(e => e.text).join(' ');
      const normalize = number => number.replace(',', '.').replace(/^0+(?=\d)/u, '').replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '');
      if (!(span.match(/-?\d+(?:[.,]\d+)?/gu) || []).some(number => normalize(number) === normalize(n.amount))) fail();
      const comparisonText = fold(span);
      const strictAbove = /\b(?:above|greater than|more than|depasse|depassent|superieur a)\b|(?<![>=])>(?!=)/u.test(comparisonText);
      const atLeast = /\b(?:at least|au moins)\b|>=|≥/u.test(comparisonText);
      const strictBelow = /\b(?:below|less than|inferieur a)\b|(?<![<=])<(?!=)/u.test(comparisonText);
      if ((strictAbove && !atLeast && n.operator !== 'gt') || (atLeast && !strictAbove && n.operator !== 'gte')
        || (strictBelow && n.operator !== 'lt')) fail();
      if (value.domain === 'currency' && (n.subjects.length !== 2 || n.unit !== subjects.get(n.subjects[1]).canonicalCode
        || n.subjects.some(key => !subjects.get(key).canonicalCode)
        || subjects.get(n.subjects[0]).canonicalCode === subjects.get(n.subjects[1]).canonicalCode || n.value !== 'exchange_rate')) fail();
      if (value.domain === 'currency') {
        const amountAt = comparisonText.search(/\d/u);
        const baseAt = comparisonText.indexOf(fold(subjects.get(n.subjects[0]).label));
        const quoteAt = comparisonText.indexOf(fold(subjects.get(n.subjects[1]).label));
        // For explicit "base ... amount quote" wording, reject inverted pairs.
        if (amountAt >= 0 && quoteAt >= 0 && quoteAt < amountAt && baseAt > amountAt) fail();
      }
    } else if (n.operator !== null || n.amount !== null || n.unit !== null) fail();
    if (['event', 'relationship', 'topic', 'temporal', 'geographic'].includes(n.kind) && !n.value) fail();
    if (['mentions_together', 'relationship'].includes(n.kind) && n.subjects.length < 2) fail();
  });
  for (const key of ['topics', 'temporal', 'geographic', 'unresolvedRequirements']) {
    value[key].forEach((_, index) => { if (!grounded(`/${key}/${index}`)) fail(); });
  }
  if (value.topics.some(t => /^(?:news|updates|actualites?|informations?)$/u.test(fold(t.label)))) fail();
  if (value.topics.some(t => t.role === 'required' && value.subjects.some(s => s.membership.some(m =>
    m.values.some(v => fold(v) === fold(t.label)))))) fail();
  for (const [key, field] of [['geographic', 'label'], ['temporal', 'text'], ['unresolvedRequirements', 'text']]) {
    value[key].forEach((entry, i) => {
      if (!value.evidence.some(e => e.path === `/${key}/${i}` && fold(e.text).includes(fold(entry[field])))) fail();
    });
  }
  if (value.temporal.some(t => t.start && t.end && t.start > t.end)) fail();
  // Satisfiability for conjunctions of simple numeric predicates on the same metric.
  const positiveLeaves = key => {
    const n = nodes.get(key);
    return n?.op === 'and' ? n.args.flatMap(positiveLeaves) : n?.op === 'predicate' ? [n] : [];
  };
  const constraints = new Map();
  if (value.condition && positiveLeaves(value.condition).some(n => value.exclusions.includes(n.id))) fail();
  for (const n of value.condition ? positiveLeaves(value.condition) : []) {
    if (n.kind !== 'numeric') continue;
    const key = JSON.stringify([n.subjects, n.value, n.unit]);
    const list = constraints.get(key) || [];
    list.push(n); constraints.set(key, list);
  }
  const decimal = text => BigInt(text.split('.')[0] + (text.split('.')[1] || '').padEnd(12, '0'));
  for (const list of constraints.values()) {
    const lows = list.filter(n => ['gt', 'gte', 'eq'].includes(n.operator));
    const highs = list.filter(n => ['lt', 'lte', 'eq'].includes(n.operator));
    if (lows.some(low => highs.some(high => decimal(low.amount) > decimal(high.amount)
      || (decimal(low.amount) === decimal(high.amount) && (low.operator === 'gt' || high.operator === 'lt'))))) fail();
  }
  return structuredClone(value);
};

export const validateMonitoringPlan = value => {
  if (!conforms(value, monitoringPlanSchema)) fail();
  if (value.status === 'supported') {
    const expected = { google_news_literal_v1: ['media_news', 'media_literal'], ecb_reference_v1: ['currency', 'ecb_threshold'],
      bodacc_siren_v1: ['official_company', 'bodacc_siren'] }[value.adapter];
    if (value.domain !== expected[0] || value.criteria.kind !== expected[1]) fail();
    if (value.criteria.kind === 'ecb_threshold' && (value.criteria.base === value.criteria.quote || Number(value.criteria.target) <= 0)) fail();
  }
  return structuredClone(value);
};

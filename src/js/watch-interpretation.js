// Meaning only: this contract cannot authorize execution or supply provider URLs.
const str = (maxLength = 200) => ({ type: 'string', minLength: 1, maxLength });
const enumeration = (...values) => ({ type: 'string', enum: values });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const array = (items, maxItems = 16, minItems = 0) => ({ type: 'array', items, minItems, maxItems });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const id = { ...str(32), pattern: '^[a-z][a-z0-9_]*$' };
const references = array(id);
const membership = object({ attribute: str(80), operator: enumeration('eq', 'in'), values: array(str(), 8, 1) });
const subject = object({ id, kind: enumeration('individual', 'open_group', 'closed_group'),
  type: enumeration('person', 'organization', 'product', 'event', 'topic', 'currency', 'place', 'unknown'),
  label: str(), canonicalCode: nullable(enumeration('GBP', 'EUR')),
  membership: array(membership, 8), members: references, quantifier: nullable(enumeration('any', 'all')) });
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
  evidence: array(object({ path: str(160), start: { type: 'integer', minimum: 0, maximum: 499 },
    end: { type: 'integer', minimum: 1, maximum: 500 }, text: str(500) }), 96),
});
// Original wording is server-owned, never copied or rewritten by the model.
export const interpretationOutputSchema = object(Object.fromEntries(
  Object.entries(interpretationSchema.properties).filter(([key]) => key !== 'originalRequest'),
));
// Future boundary only; no adapter, source, approval or compiler exists in this phase.
export const monitoringPlanSchema = object({ schemaVersion: enumeration('monitoring-plan.v1'),
  interpretationVersion: enumeration('interpretation.v1'), originalRequest: str(500),
  status: enumeration('not_assessed'), executable: { type: 'boolean', enum: [false] } });

const fail = () => { throw Object.assign(new Error('Structured interpretation failed validation.'),
  { code: 'INTERPRETATION_FAILED', statusCode: 502 }); };
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
const unique = values => new Set(values).size === values.length;
const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
const pointer = (value, path) => {
  if (!/^\/(?:[a-zA-Z]+|\d+)(?:\/(?:[a-zA-Z]+|\d+))*$/u.test(path)) fail();
  for (const key of path.slice(1).split('/')) {
    if (value == null || !Object.hasOwn(value, key)) fail();
    value = value[key];
  }
  return value;
};

export const validateInterpretation = (value, request = value?.originalRequest) => {
  if (!conforms(value, interpretationSchema) || value.originalRequest !== request) fail();
  const subjects = new Map(value.subjects.map(s => [s.id, s]));
  const nodes = new Map(value.conditions.map(n => [n.id, n]));
  if (subjects.size !== value.subjects.length || nodes.size !== value.conditions.length
    || [...subjects.keys()].some(key => nodes.has(key))) fail();
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
    s.membership.forEach((m, i) => { if (!grounded(`/subjects/${index}/membership/${i}`)
      || !unique(m.values) || (m.operator === 'eq' && m.values.length !== 1)) fail(); });
    if (!unique(s.membership.map(m => m.attribute))) fail();
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
  // Obvious negative qualifiers cannot disappear even when an AI returns valid JSON.
  if (/\b(?:excluding|except|without|sauf|sans|hors)\b/iu.test(request)
    && !value.exclusions.length && !value.conditions.some(n => n.op === 'not')
    && !value.unresolvedRequirements.length && !value.ambiguities.length) fail();
  value.conditions.forEach((n, index) => {
    if (!grounded(`/conditions/${index}`)) fail();
    if (n.op !== 'predicate') return;
    if (!n.subjects.length || !unique(n.subjects) || n.subjects.some(key => !subjects.has(key))) fail();
    if (n.kind === 'news_about' && n.subjects.length !== 1) fail();
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
        || subjects.get(n.subjects[0]).canonicalCode === subjects.get(n.subjects[1]).canonicalCode)) fail();
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
  return structuredClone(value);
};

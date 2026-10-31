// Standalone contracts. No legacy Watch or execution types.
export const CAPTURE_KINDS = Object.freeze(['FREE_TEXT', 'PAGE_CONTEXT', 'URL', 'SHARED_CONTEXT', 'SEARCH_CONTEXT']);
export const STATES = Object.freeze(['READY_TO_MONITOR', 'NEEDS_CLARIFICATION', 'UNSUPPORTED_FOR_NOW']);
export const CONSTRAINT_KINDS = Object.freeze(['threshold', 'comparator', 'period', 'exact_resource', 'exclusion', 'condition', 'relation', 'duration']);

export function object(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError('Expected a plain object');
  if (Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) {
    throw new TypeError(`Invalid fields; allowed: ${allowed.join(', ')}`);
  }
}
export function string(value, name, { empty = false } = {}) {
  if (typeof value !== 'string' || value.length > 40_000 || (!empty && !value.trim())) {
    throw new TypeError(`Invalid ${name}`);
  }
  return value;
}
export function list(value, name) {
  if (!Array.isArray(value) || value.length > 64) throw new TypeError(`Invalid ${name}`);
  return value;
}
export function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Compact JSON Schema available to an injected structured-output model client.
const text = { type: 'string', minLength: 1, maxLength: 40_000 };
const array = items => ({ type: 'array', maxItems: 64, items });
const nullable = schema => ({ ...schema, type: [schema.type, 'null'] });
// Strict wire format requires every key; null represents optional metadata.
const record = properties => ({
  type: 'object', additionalProperties: false, properties, required: Object.keys(properties),
});
export const OUTPUT_SCHEMA = freeze(record({
  intent: record({
    canonical_text: text,
    references: nullable(array(record({ label: text, source_ref: text, exact_url: nullable(text) }))),
    explicit_constraints: nullable(array(record({
      kind: { type: 'string', enum: CONSTRAINT_KINDS }, text, source_ref: text, value: nullable(text),
    }))),
    unresolved_ambiguities: nullable(array(text)),
  }),
  decision: record({
    status: { type: 'string', enum: STATES }, reason: text,
    clarification_question: nullable({ ...text, minLength: 0 }), suggestions: nullable(array(text)),
  }),
}));

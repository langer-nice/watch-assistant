export const ACTIONS = Object.freeze(['ALERT', 'NO_ALERT']);
export const EVIDENCE_STATUSES = Object.freeze(['CONFIRMED', 'STRONG_UNCONFIRMED', 'WEAK_UNCONFIRMED', 'CONFLICTING', 'INSUFFICIENT']);
export const CLAIM_FIELDS = Object.freeze(['title', 'content', 'measurement']);
export const PROVENANCE_FIELDS = Object.freeze(['source', 'url', 'published_at']);
export const OPERATORS = Object.freeze(['gt', 'gte', 'lt', 'lte', 'eq']);
export function object(value, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) {
    throw new TypeError('Invalid Brain object fields');
  }
}
export function text(value, name, empty = false) {
  if (typeof value !== 'string' || value.length > 60_000 || (!empty && !value.trim())) throw new TypeError(`Invalid ${name}`);
  return value;
}
export function list(value, name, max = 64) {
  if (!Array.isArray(value) || value.length > max) throw new TypeError(`Invalid ${name}`);
  return value;
}
export function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const string = { type: 'string', minLength: 1, maxLength: 4000 };
export const EVIDENCE_REFERENCE_SCHEMA = freeze({ anyOf: [
  { type: 'object', additionalProperties: false, properties: {
    quote: { ...string, maxLength: 1000 },
  }, required: ['quote'] },
  { type: 'object', additionalProperties: false, properties: {
    field: { type: 'string', enum: PROVENANCE_FIELDS },
  }, required: ['field'] },
] });
export const JUDGMENT_SCHEMA = freeze({
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ACTIONS },
    evidence_status: { type: 'string', enum: EVIDENCE_STATUSES }, reason: string,
    evidence_basis: { type: 'array', minItems: 1, maxItems: 4, items: EVIDENCE_REFERENCE_SCHEMA },
    novelty_summary: { ...string, type: ['string', 'null'] },
  },
  required: ['action', 'evidence_status', 'reason', 'evidence_basis', 'novelty_summary'],
});

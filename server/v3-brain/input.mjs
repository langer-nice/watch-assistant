import { freeze, list, object, text } from './schema.mjs';
import { containsLiteral, decimal, validateNumericCondition } from './validate.mjs';

export function createVerifiedIntent(input) {
  object(input, ['canonical_text', 'references', 'explicit_constraints', 'unresolved_ambiguities', 'numeric_condition'], ['canonical_text']);
  text(input.canonical_text, 'verified intent');
  if (list(input.unresolved_ambiguities ?? [], 'ambiguities').length) throw new TypeError('Brain requires an already verified intent');
  const references = list(input.references ?? [], 'references').map(ref => {
    object(ref, ['label', 'source_ref', 'exact_url'], ['label', 'source_ref']);
    for (const key of Object.keys(ref)) text(ref[key], key);
    return { ...ref };
  });
  const explicit_constraints = list(input.explicit_constraints ?? [], 'constraints').map(item => {
    object(item, ['kind', 'text', 'source_ref', 'value'], ['kind', 'text', 'source_ref']);
    for (const key of Object.keys(item)) text(item[key], key);
    return { ...item };
  });
  const numeric = input.numeric_condition === undefined ? undefined : validateNumericCondition(input.numeric_condition);
  if (numeric) {
    const source = [input.canonical_text, ...explicit_constraints.map(c => c.text)].join('\n');
    if (!containsLiteral(source, numeric.metric) || !containsLiteral(source, numeric.threshold)) {
      throw new TypeError('Exact numeric metadata must be supported by verified intent');
    }
    if (explicit_constraints.some(c => c.kind === 'threshold' && c.value !== undefined && c.value !== numeric.threshold)) {
      throw new TypeError('Conflicting exact threshold metadata');
    }
  }
  return freeze({ canonical_text: input.canonical_text, references, explicit_constraints,
    ...(numeric ? { numeric_condition: numeric } : {}) });
}

export function createEvidence(input) {
  object(input, ['id', 'title', 'content', 'source', 'url', 'published_at', 'retrieved_at', 'measurement'], ['id', 'title', 'content']);
  for (const key of ['id', 'title', 'content']) text(input[key], key, key === 'title');
  for (const key of ['source', 'url', 'published_at', 'retrieved_at']) if (input[key] !== undefined) text(input[key], key);
  let measurement;
  if (input.measurement !== undefined) {
    object(input.measurement, ['metric', 'value', 'quote']);
    measurement = { ...input.measurement };
    text(measurement.metric, 'measurement metric'); decimal(measurement.value); text(measurement.quote, 'measurement quote');
    if (!input.content.includes(measurement.quote) || !containsLiteral(measurement.quote, measurement.metric) || !containsLiteral(measurement.quote, measurement.value)) {
      throw new TypeError('Measurement must have exact supplied evidence support');
    }
  }
  return freeze({ ...input, ...(measurement ? { measurement } : {}) });
}

export function createPriorState(input = { entries: [] }) {
  object(input, ['entries']);
  const ids = new Set();
  const entries = list(input.entries, 'prior entries').map(entry => {
    object(entry, ['id', 'fact', 'date', 'alerted'], ['id', 'fact', 'alerted']);
    text(entry.id, 'prior id'); text(entry.fact, 'prior fact');
    if (ids.has(entry.id)) throw new TypeError('Duplicate prior entry id'); ids.add(entry.id);
    if (typeof entry.alerted !== 'boolean') throw new TypeError('Invalid alerted flag');
    if (entry.date !== undefined) text(entry.date, 'prior date');
    return { ...entry };
  });
  return freeze({ entries });
}

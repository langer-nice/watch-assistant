import { CONSTRAINT_KINDS, freeze, list, object, string } from './schema.mjs';

export function createIntent(input) {
  object(input, ['canonical_text', 'references', 'explicit_constraints', 'unresolved_ambiguities'], ['canonical_text']);
  string(input.canonical_text, 'canonical_text');
  const references = list(input.references ?? [], 'references').map(ref => {
    object(ref, ['label', 'source_ref', 'exact_url'], ['label', 'source_ref']);
    string(ref.label, 'reference label');
    string(ref.source_ref, 'reference source');
    if (ref.exact_url !== undefined) string(ref.exact_url, 'exact_url');
    return { ...ref };
  });
  const explicit_constraints = list(input.explicit_constraints ?? [], 'constraints').map(constraint => {
    object(constraint, ['kind', 'text', 'source_ref', 'value'], ['kind', 'text', 'source_ref']);
    if (!CONSTRAINT_KINDS.includes(constraint.kind)) throw new TypeError('Unknown constraint kind');
    string(constraint.text, 'constraint text');
    string(constraint.source_ref, 'constraint source');
    if (constraint.value !== undefined) string(constraint.value, 'exact value');
    return { ...constraint };
  });
  const unresolved_ambiguities = list(input.unresolved_ambiguities ?? [], 'ambiguities').map(value => string(value, 'ambiguity'));
  return freeze({ canonical_text: input.canonical_text, references, explicit_constraints, unresolved_ambiguities });
}

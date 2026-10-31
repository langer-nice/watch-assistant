import { CLAIM_FIELDS, PROVENANCE_FIELDS, freeze, object, text } from './schema.mjs';
import { resolveEvidenceSpan } from './evidence-span.mjs';

export const EVIDENCE_BASIS_FIELDS = freeze({ claim: [...CLAIM_FIELDS], provenance: [...PROVENANCE_FIELDS] });
const ownText = (owner, field) => owner && Object.hasOwn(owner, field) && typeof owner[field] === 'string' ? owner[field] : undefined;

// Model supplies claim text, never a claim field. Only these three server-owned
// targets are searched; provenance is a separate, closed field-only variant.
export function resolveEvidenceBasis(evidence, basisItem) {
  object(basisItem, ['field', 'quote'], []);
  if (Object.hasOwn(basisItem, 'field')) {
    object(basisItem, ['field']);
    const { field } = basisItem;
    if (!PROVENANCE_FIELDS.includes(field)) throw new TypeError('Unsupported provenance field');
    const value = ownText(evidence, field);
    if (!value?.trim()) throw new TypeError('Referenced provenance field is absent');
    return freeze({ reference: { field }, field, role: 'PROVENANCE', value });
  }
  object(basisItem, ['quote']);
  text(basisItem.quote, 'basis quote');
  if (basisItem.quote.length > 1000) throw new TypeError('Evidence basis is too long');
  const targets = {
    title: ownText(evidence, 'title'), content: ownText(evidence, 'content'),
    // createEvidence validates this canonical metric/value quote against content.
    measurement: ownText(Object.hasOwn(evidence, 'measurement') ? evidence.measurement : undefined, 'quote'),
  };
  // Raw exact matches across all fields take priority over presentation normalization.
  let resolutions = CLAIM_FIELDS.flatMap(field => {
    const source = targets[field];
    if (!source?.trim()) return [];
    const result = resolveEvidenceSpan(source, basisItem.quote, { whole: field === 'measurement' });
    return result ? [{ field, ...result }] : [];
  });
  if (resolutions.some(r => r.mode === 'EXACT')) resolutions = resolutions.filter(r => r.mode === 'EXACT');
  const fields = resolutions.map(r => r.field);
  if (!fields.length) throw new TypeError('Evidence basis must quote exact supplied claim text');
  // Different title/content contexts may matter. Accept both only when entire
  // fields are identical; otherwise reject, rather than guess or ask the model.
  if (fields.includes('title') && fields.some(field => field !== 'title') && targets.title !== targets.content) {
    throw new TypeError('Ambiguous evidence basis across title and content');
  }
  // A canonical measurement necessarily also occurs in content (input invariant).
  // It is one exact observation, not an ambiguity: prefer that typed observation,
  // then content over an identical title. Output stays quote-only and idempotent.
  const field = fields.includes('measurement') ? 'measurement' : fields.includes('content') ? 'content' : 'title';
  const resolved = resolutions.find(r => r.field === field);
  const { quote, original_quote, mode, ranges } = resolved;
  return freeze({ reference: { quote }, field, role: field === 'measurement' ? 'MEASUREMENT' : 'CLAIM', value: quote, original_quote, mode, ranges });
}

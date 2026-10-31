import { ACTIONS, EVIDENCE_STATUSES, freeze, list, object, text } from './schema.mjs';
import { resolveEvidenceBasis } from './evidence-basis.mjs';

// Generic output qualification markers, never input/subject classification.
// This lexical check is not a proof of arbitrary prose semantics.
export function hasUnconfirmedQualification(reason) {
  return /\bunconfirmed\b/iu.test(reason) ||
    /\bnot\s+(?:yet\s+)?(?:officially\s+)?confirmed\b/iu.test(reason) ||
    /\bconfirmation\b[^.!?\n]{0,60}\b(?:pending|awaited|absent|outstanding)\b/iu.test(reason) ||
    /\b(?:awaiting|pending|without|lacks)\b[^.!?\n]{0,40}\bconfirmation\b/iu.test(reason);
}

export function createJudgment(input, evidence) {
  object(input, ['action', 'evidence_status', 'reason', 'evidence_basis', 'novelty_summary'], ['action', 'evidence_status', 'reason', 'evidence_basis']);
  if (!ACTIONS.includes(input.action)) throw new TypeError('Invalid judgment action');
  if (!EVIDENCE_STATUSES.includes(input.evidence_status)) throw new TypeError('Invalid evidence status');
  text(input.reason, 'judgment reason');
  if (input.reason.length > 4000) throw new TypeError('Judgment reason is too long');
  const resolvedBasis = list(input.evidence_basis, 'evidence_basis', 4).map(item => resolveEvidenceBasis(evidence, item));
  const evidence_basis = resolvedBasis.map(item => item.reference);
  if (!evidence_basis.length) throw new TypeError('Evidence basis is required');
  if (input.action === 'ALERT') {
    if (!['CONFIRMED', 'STRONG_UNCONFIRMED'].includes(input.evidence_status)) throw new TypeError('Evidence status cannot support ALERT');
    if (input.evidence_status === 'STRONG_UNCONFIRMED' && !hasUnconfirmedQualification(input.reason)) {
      throw new TypeError('Unconfirmed ALERT requires explicit qualification');
    }
    if (!resolvedBasis.some(item => item.role === 'CLAIM' || item.role === 'MEASUREMENT')) {
      throw new TypeError('ALERT requires a substantive claim-capable evidence basis');
    }
  }
  const result = { action: input.action, evidence_status: input.evidence_status, reason: input.reason, evidence_basis };
  for (const key of ['novelty_summary']) {
    if (input[key] === null || input[key] === undefined || (typeof input[key] === 'string' && !input[key].trim())) continue;
    result[key] = text(input[key], key);
    if (result[key].length > 4000) throw new TypeError('Judgment metadata is too long');
  }
  return freeze(result);
}

import { object } from './schema.mjs';

const emptyText = value => value === null || (typeof value === 'string' && !value.trim());
const omitEmptyArray = (target, key) => {
  if (target[key] === null || (Array.isArray(target[key]) && !target[key].length)) delete target[key];
};

// Structural only: no inferred fields, status changes or canonical-text rewriting.
export function normalizeV3UnderstandingOutput(output) {
  object(output, ['intent', 'decision']);
  object(output.intent, ['canonical_text', 'references', 'explicit_constraints', 'unresolved_ambiguities'], ['canonical_text']);
  object(output.decision, ['status', 'reason', 'clarification_question', 'suggestions'], ['status', 'reason']);
  const intent = { ...output.intent };
  for (const key of ['references', 'explicit_constraints', 'unresolved_ambiguities']) omitEmptyArray(intent, key);
  for (const [key, optional] of [['references', 'exact_url'], ['explicit_constraints', 'value']]) {
    if (Array.isArray(intent[key])) intent[key] = intent[key].map(item => {
      const allowed = key === 'references' ? ['label', 'source_ref', 'exact_url'] : ['kind', 'text', 'source_ref', 'value'];
      const required = key === 'references' ? ['label', 'source_ref'] : ['kind', 'text', 'source_ref'];
      object(item, allowed, required);
      const copy = { ...item };
      if (emptyText(copy[optional])) delete copy[optional];
      return copy;
    });
  }
  const decision = { ...output.decision };
  if (emptyText(decision.clarification_question)) delete decision.clarification_question;
  omitEmptyArray(decision, 'suggestions');
  return { intent, decision };
}

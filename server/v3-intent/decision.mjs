import { STATES, freeze, list, object, string } from './schema.mjs';

export function createDecision(input, intent) {
  object(input, ['status', 'reason', 'clarification_question', 'suggestions'], ['status', 'reason']);
  if (!STATES.includes(input.status)) throw new TypeError('Unknown Decision state');
  string(input.reason, 'decision reason');
  const clarification = input.status === 'NEEDS_CLARIFICATION';
  if (clarification) {
    string(input.clarification_question, 'clarification_question');
  } else if (input.clarification_question !== undefined || input.suggestions !== undefined || intent.unresolved_ambiguities.length) {
    throw new TypeError('Only clarification may include questions, suggestions or unresolved ambiguity');
  }
  const suggestions = input.suggestions === undefined ? undefined :
    [...new Map(list(input.suggestions, 'suggestions')
      .map(value => string(value, 'suggestion').trim())
      .filter(value => value.length > 0 && value.length <= 80 && !/[\r\n]/u.test(value))
      .map(value => [value.toLowerCase(), value])).values()].slice(0, 5);
  return freeze({ ...input, ...(suggestions ? { suggestions } : {}) });
}

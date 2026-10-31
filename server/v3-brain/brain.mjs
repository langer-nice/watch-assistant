import { createVerifiedIntent, createEvidence, createPriorState } from './input.mjs';
import { createJudgment } from './judgment.mjs';
import { guardNumericAction } from './validate.mjs';
import { freeze, object, JUDGMENT_SCHEMA } from './schema.mjs';
import { INSTRUCTIONS } from './prompt.mjs';

export async function judgeEvidence(input, { model } = {}) {
  if (typeof model !== 'function') throw new TypeError('Explicit judgment model function required');
  object(input, ['intent', 'evidence', 'prior_state'], ['intent', 'evidence']);
  const snapshot = freeze({ intent: createVerifiedIntent(input.intent), evidence: createEvidence(input.evidence),
    prior_state: createPriorState(input.prior_state) });
  const output = await model(freeze({ instructions: INSTRUCTIONS, input: snapshot, response_schema: JUDGMENT_SCHEMA }));
  const judgment = createJudgment(output, snapshot.evidence);
  guardNumericAction(snapshot, judgment); // Reject inconsistency; never repair an action.
  return judgment;
}

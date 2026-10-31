import { OPERATORS, object, text } from './schema.mjs';

export function decimal(value) {
  if (typeof value !== 'string' || value.length > 128 || !/^-?\d+(?:\.\d+)?$/u.test(value)) {
    throw new TypeError('Exact decimal must be a bounded string');
  }
  const [whole, fraction = ''] = value.split('.');
  return { integer: BigInt(whole + fraction), scale: fraction.length };
}
export function compareDecimals(left, right) {
  const a = decimal(left), b = decimal(right);
  const scale = Math.max(a.scale, b.scale);
  const x = a.integer * 10n ** BigInt(scale - a.scale), y = b.integer * 10n ** BigInt(scale - b.scale);
  return x < y ? -1 : x > y ? 1 : 0;
}
export function validateNumericCondition(condition) {
  object(condition, ['metric', 'operator', 'threshold']);
  text(condition.metric, 'metric');
  if (!OPERATORS.includes(condition.operator)) throw new TypeError('Invalid numeric operator');
  decimal(condition.threshold);
  return { ...condition };
}
export function containsLiteral(source, value) {
  const word = c => c !== undefined && /[\p{L}\p{N}_]/u.test(c);
  let at = source.indexOf(value);
  while (at !== -1) {
    if (!(word(value[0]) && word(source[at - 1])) && !(word(value.at(-1)) && word(source[at + value.length]))) return true;
    at = source.indexOf(value, at + 1);
  }
  return false;
}
export function guardNumericAction(input, judgment) {
  const condition = input.intent.numeric_condition;
  if (!condition) return;
  const measurement = input.evidence.measurement;
  if (!measurement || measurement.metric !== condition.metric) {
    if (judgment.action === 'ALERT') throw new TypeError('ALERT lacks a matching exact measurement');
    return;
  }
  const comparison = compareDecimals(measurement.value, condition.threshold);
  const satisfies = { gt: comparison > 0, gte: comparison >= 0, lt: comparison < 0, lte: comparison <= 0, eq: comparison === 0 }[condition.operator];
  // A false exact condition cannot justify notifying.
  // A true condition does not force ALERT: novelty and evidence still matter.
  if (!satisfies && judgment.action !== 'NO_ALERT') throw new TypeError('Action conflicts with exact numeric condition');
}

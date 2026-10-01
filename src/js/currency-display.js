import en from '../locales/en.json' with { type: 'json' };
import fr from '../locales/fr.json' with { type: 'json' };

const messages = { en, fr };
const copy = (language, key, values = {}) => Object.entries(values).reduce(
  (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
  messages[language === 'fr' ? 'fr' : 'en'].currency[key],
);
const decimal = value => /^\d{1,12}(?:\.\d{1,12})?$/.test(String(value));
const parts = value => {
  const [whole, fraction = ''] = String(value).split('.');
  return [BigInt(whole + fraction), 10n ** BigInt(fraction.length)];
};
const compare = (a, b) => {
  const [an, ad] = parts(a); const [bn, bd] = parts(b);
  return an * bd - bn * ad;
};
const rounded = (value, digits) => {
  const [n, d] = parts(value); const scale = 10n ** BigInt(digits);
  const result = ((n * scale * 2n + d) / (2n * d)).toString().padStart(digits + 1, '0');
  return `${result.slice(0, -digits)}.${result.slice(-digits)}`;
};
export const localizedDecimal = (value, language = 'en') => String(value).replace('.',
  new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB').formatToParts(1.1).find(p => p.type === 'decimal').value);
export const hasCurrencyEvaluation = e => Boolean(e && e.provider === 'ecb'
  && ['GBP', 'EUR'].includes(e.base) && ['GBP', 'EUR'].includes(e.quote) && e.base !== e.quote
  && e.operator === 'gte' && decimal(e.observedRate) && decimal(e.target) && typeof e.met === 'boolean'
  && /^\d{4}-\d{2}-\d{2}$/.test(e.observationDate || '')
  && Number.isFinite(Date.parse(e.observationDate))
  && new Date(e.observationDate).toISOString().slice(0, 10) === e.observationDate);

export const formatCurrencySummary = (e, language = 'en') => {
  if (!hasCurrencyEvaluation(e)) return '';
  let rate = rounded(e.observedRate, 4);
  // Display precision must never contradict the persisted exact decision.
  for (let digits = 5; (compare(rate, '0') === 0n || (e.met ? compare(rate, e.target) < 0n : compare(rate, e.target) >= 0n)) && digits <= 12; digits++) rate = rounded(e.observedRate, digits);
  const below = !e.met && compare(rate, e.target) >= 0n;
  const relation = below ? '<' : e.inverted || compare(rate, e.observedRate) !== 0n ? '≈' : '=';
  return copy(language, 'result', {
    decision: copy(language, e.met ? 'met' : 'notMet'), base: e.base, quote: e.quote, relation,
    rate: localizedDecimal(below ? e.target : rate, language), target: localizedDecimal(e.target, language),
    date: new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${e.observationDate}T00:00:00Z`)),
  });
};
export const formatCurrencyOverview = (criteria, language = 'en') => copy(language, 'overview', {
  ...criteria, target: localizedDecimal(criteria.target, language),
});

// Only structured, event-specific data is used. Never parse publisher prose or
// substitute a newer observation for an older history event with the same condition ID.
export const currencyEvaluationForUpdate = (watch, update) => {
  if (!update?.id?.startsWith('currency:')) return null;
  const candidates = [update.rawMonitoringResult?.currencyEvaluation, update.currencyEvaluation,
    ...(watch?.monitoringUpdates || []).filter(x => x.id === update.id).map(x => x.currencyEvaluation),
    ...(watch?.monitoringSnapshot?.items || []).filter(x => x.id === update.id).map(x => x.currencyEvaluation)];
  const current = watch?.currencyEvaluation;
  if (current?.met && current.checkedAt && Date.parse(current.checkedAt) === Date.parse(update.timestamp)) candidates.push(current);
  return candidates.find(e => hasCurrencyEvaluation(e) && e.met
    && (!e.checkedAt || Date.parse(e.checkedAt) === Date.parse(update.timestamp))) || null;
};
export const currencyUpdateSummary = (watch, update, language) => {
  const evaluation = currencyEvaluationForUpdate(watch, update);
  return evaluation ? formatCurrencySummary(evaluation, language) : '';
};

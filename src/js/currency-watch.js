import { formatCurrencySummary, formatCurrencyOverview } from './currency-display.js';
import { addUpdateToWatch, getUnreadUpdates } from './watch-updates.js';

export const CURRENCY_SOURCE = Object.freeze({ type: 'currency', provider: 'ecb',
  url: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', title: 'ECB', discovery: 'exchange-rate' });
const aliases = { pound: 'GBP', pounds: 'GBP', sterling: 'GBP', gbp: 'GBP', livre: 'GBP', livres: 'GBP', euro: 'EUR', euros: 'EUR', eur: 'EUR' };
const currency = '(?:pound(?:s| sterling)?|sterling|GBP|livres?(?: sterling)?|euros?|EUR)';
const pattern = new RegExp(`^(?:(?:notify|alert|tell) me (?:when )?|let me know when |quand )?(?:the |la |le )?(${currency})\\s+(?:reaches?|hits?|atteint|atteindra|>=|≥)\\s*([0-9]+(?:[.,][0-9]+)?)\\s*(?:to |against |pour |contre )?(?:the |l['’])?(${currency})[.!]?$`, 'i');
export const normalizeDecimal = (value) => {
  const raw = String(value ?? '');
  if (!/^\d{1,12}(?:[.,]\d{1,12})?$/.test(raw)) throw new Error('INVALID_CURRENCY_DATA');
  const [whole, fraction = ''] = raw.replace(',', '.').split('.');
  const normalized = `${BigInt(whole)}${fraction.replace(/0+$/, '') ? `.${fraction.replace(/0+$/, '')}` : ''}`;
  if (Number(normalized) <= 0) throw new Error('INVALID_CURRENCY_DATA');
  return normalized;
};
export const parseCurrencyRequest = (request) => {
  const match = String(request || '').trim().match(pattern);
  if (!match) return null;
  try {
    const base = aliases[match[1].toLowerCase().split(' ')[0]];
    const quote = aliases[match[3].toLowerCase().split(' ')[0]];
    if (!base || !quote || base === quote) return null;
    return { base, quote, operator: 'gte', target: normalizeDecimal(match[2]) };
  } catch { return null; }
};
export const currencyCriteriaFor = (watch) => watch?.inputType === 'text' ? parseCurrencyRequest(watch.request) : null;
export const sameCurrencyCriteria = (left, right) => left == null || right == null
  ? left == null && right == null
  : ['base', 'quote', 'operator', 'target'].every(key => left[key] === right[key]);
export const currencyKey = (watch) => JSON.stringify([currencyCriteriaFor(watch), watch?.currencyRevision || null]);

// Request text is authoritative; stored/LLM-generated criteria never override an edit.
export const normalizeCurrencyWatch = (watch) => {
  const criteria = currencyCriteriaFor(watch);
  if (!criteria && !watch.currencyCriteria) return watch;
  const changed = !sameCurrencyCriteria(criteria, watch.currencyCriteria);
  return { ...watch, currencyCriteria: criteria,
    currencyRevision: changed || !watch.currencyRevision ? crypto.randomUUID() : watch.currencyRevision,
    ...(criteria ? { monitoringSource: { ...CURRENCY_SOURCE }, feedUrl: null,
      structuredCriteria: { ...watch.structuredCriteria, currency: criteria },
      monitoringSummary: currencyOverview(criteria, watch.currencyLanguage) } : {}),
    ...(changed ? { currencyEvaluation: null, currencySatisfied: false, monitoringSnapshot: null,
      lastCheckOutcome: null, lastCheckResult: null, lastCheckAttempt: null, lastChecked: null,
      monitoringFailure: null, monitoringStatus: { state: 'configured', reason: null }, monitoringIssueReason: null, candidateUpdates: [], monitoringUpdates: [], seenMonitoringItemIds: [],
      seenMonitoringItemKeys: [], currentStatus: watch.status === 'paused' ? 'paused' : 'watching',
      currentSituation: null, currentSituationKey: 'watchData.pendingSituations.general',
      latestChange: null, latestChangeKey: null, latestUpdateAt: null,
    } : {}),
  };
};
const rational = (value) => {
  const normalized = normalizeDecimal(value);
  const [whole, fraction = ''] = normalized.split('.');
  return [BigInt(whole + fraction), 10n ** BigInt(fraction.length)];
};
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
export const evaluateCurrencyRate = (criteria, observation) => {
  if (!criteria || criteria.operator !== 'gte') return fail('INVALID_CURRENCY_CRITERIA');
  const [target, scale] = rational(criteria.target);
  const [rate, rateScale] = rational(observation?.rate);
  let numerator; let denominator;
  if (observation.base === criteria.base && observation.quote === criteria.quote) {
    numerator = rate; denominator = rateScale;
  } else if (observation.base === criteria.quote && observation.quote === criteria.base) {
    numerator = rateScale; denominator = rate;
  } else return fail('INVALID_CURRENCY_DATA');
  // Compare rationals, without rounding either the provider's decimal or the reciprocal.
  const met = numerator * scale >= target * denominator;
  const precision = 12n;
  const display = numerator * 10n ** precision / denominator;
  const digits = display.toString().padStart(13, '0');
  const observedRate = `${digits.slice(0, -12)}.${digits.slice(-12)}`.replace(/0+$/, '').replace(/\.$/, '');
  return { ...criteria, observedRate, met, provider: 'ecb', observationDate: observation.date,
    providerBase: observation.base, providerQuote: observation.quote, providerRate: normalizeDecimal(observation.rate),
    inverted: observation.base !== criteria.base };
};

export const currencyOverview = formatCurrencyOverview;
export const currencySummary = formatCurrencySummary;
export const applyCurrencyCheckResult = (watch, response) => {
  const criteria = currencyCriteriaFor(watch);
  if (!criteria || !sameCurrencyCriteria(criteria, response?.criteria) || !response?.observation
    || !Number.isFinite(Date.parse(response.checkedAt))) return fail('INVALID_CURRENCY_DATA');
  validateObservation(response.observation, new Date(response.checkedAt));
  const evaluation = { ...evaluateCurrencyRate(criteria, response.observation), checkedAt: response.checkedAt };
  const id = `currency:${watch.currencyRevision}:${criteria.base}:${criteria.quote}:${criteria.target}`;
  const item = { id, title: currencySummary(evaluation, watch.currencyLanguage), excerpt: currencySummary(evaluation, watch.currencyLanguage),
    source: 'ECB', url: CURRENCY_SOURCE.url, publishedAt: `${evaluation.observationDate}T00:00:00.000Z`,
    detectedAt: response.checkedAt, status: 'candidate', currencyEvaluation: evaluation };
  const alreadySatisfied = watch.currencySatisfied || (watch.updates || []).some(update => update.id === id);
  const matchedItems = evaluation.met && !alreadySatisfied ? [item] : [];
  const updated = matchedItems.length ? addUpdateToWatch(watch, { ...item, timestamp: response.checkedAt,
    sourceUrl: item.url, sourceTitle: item.title, sourceName: 'ECB', summary: item.excerpt, status: 'new', rawMonitoringResult: item }) : watch;
  const outcome = evaluation.met ? 'currency-met' : 'currency-not-met';
  return { outcome, matchedItems, newItems: matchedItems, changes: {
    currencyEvaluation: evaluation, currencySatisfied: alreadySatisfied || evaluation.met,
    lastChecked: response.checkedAt, lastCheckedKey: null,
    lastCheckOutcome: { type: outcome, checkedAt: response.checkedAt },
    lastCheckResult: { type: outcome, checkedAt: response.checkedAt, diagnostics: evaluation },
    lastCheckAttempt: { status: 'succeeded', attemptedAt: response.checkedAt, outcome },
    monitoringFailure: null, monitoringStatus: { state: 'active', reason: null }, monitoringIssueReason: null,
    monitoringSnapshot: { checkedAt: response.checkedAt, source: CURRENCY_SOURCE, itemIds: evaluation.met ? [id] : [], items: evaluation.met ? [item] : [] },
    candidateUpdates: matchedItems.length ? [item] : watch.candidateUpdates || [],
    monitoringUpdates: matchedItems.length ? [item] : watch.monitoringUpdates || [],
    updates: updated.updates || [], unreadUpdateCount: getUnreadUpdates(updated).length,
    currentStatus: matchedItems.length && watch.status !== 'paused' ? 'updated' : watch.currentStatus || 'watching',
    latestUpdateAt: matchedItems.length ? response.checkedAt : watch.latestUpdateAt || null,
  } };
};

// TARGET holidays: New Year, Good Friday, Easter Monday, May Day, Christmas and Boxing Day.
const isPublicationDay = (date) => {
  if ([0, 6].includes(date.getUTCDay())) return false;
  const day = date.toISOString().slice(5, 10);
  if (['01-01', '05-01', '12-25', '12-26'].includes(day)) return false;
  const y = date.getUTCFullYear(); const a = y % 19; const b = Math.floor(y / 100); const c = y % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451); const n = h + l - 7 * m + 114;
  const easter = Date.UTC(y, Math.floor(n / 31) - 1, n % 31 + 1);
  return ![easter - 2 * 86400000, easter + 86400000].includes(date.getTime());
};
export const earliestAcceptableRateDate = (now) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  // Two-hour publication grace; previous TARGET business day is acceptable before 18:00.
  if (Number(parts.hour) < 18) date.setUTCDate(date.getUTCDate() - 1);
  while (!isPublicationDay(date)) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};
export const validateObservation = (observation, now = new Date()) => {
  if (!observation || !/^\d{4}-\d{2}-\d{2}$/.test(observation.date || '')
    || !Number.isFinite(Date.parse(observation.date))
    || new Date(observation.date).toISOString().slice(0, 10) !== observation.date
    || observation.date > now.toISOString().slice(0, 10)) throw Object.assign(new Error('INVALID_CURRENCY_DATA'), { code: 'INVALID_CURRENCY_DATA' });
  if (observation.date < earliestAcceptableRateDate(now)) throw Object.assign(new Error('STALE_CURRENCY_DATA'), { code: 'STALE_CURRENCY_DATA' });
  normalizeDecimal(observation.rate);
  return observation;
};

// All facts, sources, figures and dates below are controlled synthetic test data.
// Expected actions/statuses live outside model input and never enter Evidence/Prior State.
import { freeze } from './schema.mjs';

const constraint = (kind, text, value) => ({ kind, text, source_ref: 'verified_input', ...(value ? { value } : {}) });
const intent = (canonical_text, explicit_constraints = [], numeric_condition) => ({ canonical_text, explicit_constraints,
  ...(numeric_condition ? { numeric_condition } : {}) });
const club = intent('Tell me when there are important new developments about Manchester City.');
const fx = intent('Tell me when GBP/EUR goes above 1.17.',
  [constraint('threshold', '1.17', '1.17'), constraint('comparator', 'above', 'above')],
  { metric: 'GBP/EUR', operator: 'gt', threshold: '1.17' });
const products = intent('Tell me about new Gucci products, but not perfumes.', [constraint('exclusion', 'but not perfumes')]);
const release = intent('Tell me when Product X is released, but only if it is available in France.',
  [constraint('condition', 'only if it is available in France')]);
const earnings = intent('Tell me when Microsoft publishes its Q3 2026 earnings results.', [constraint('period', 'Q3 2026', 'Q3 2026')]);
const history = facts => ({ entries: facts.map(([fact, date, alerted = false], index) => ({ id: `p${index + 1}`, fact, date, alerted })) });
const talks = history([
  ['Manchester City opened negotiations with Player X’s club.', '2026-10-25'],
  ['The clubs had not agreed a transfer fee.', '2026-10-26'],
  ['Player X was still registered with the current club.', '2026-10-26'],
  ['Manchester City said discussions were continuing.', '2026-10-27'],
  ['No medical or completed contract had been announced.', '2026-10-28'],
  ['The last known state was negotiations, with no confirmed signing.', '2026-10-30'],
]);
const signed = history([
  ...talks.entries.map(e => [e.fact, e.date, e.alerted]),
  ['Manchester City officially confirmed Player X signed a five-year contract; the transfer is complete.', '2026-10-30', true],
]);
const france = history([
  ['Product X was released in the United States.', '2026-10-29'],
  ['The official French page announced a future French launch.', '2026-10-29'],
  ['The official French price has been published.', '2026-10-30'],
  ['A French retailer previously offered preorders, not immediate delivery.', '2026-10-30'],
  ['At 10:05 UTC the official France page still said coming soon.', '2026-10-31T10:05:00Z'],
  ['At 10:05 UTC official checkout and France shipping were unavailable.', '2026-10-31T10:05:00Z'],
]);
const previews = history([
  ['Microsoft plans to publish Q3 2026 earnings on 31 October.', '2026-10-20'],
  ['Analysts expect Q3 revenue of USD 72.1 billion.', '2026-10-28'],
  ['Analysts expect diluted earnings per share of USD 3.15.', '2026-10-28'],
  ['An earnings call is scheduled for 14:00 UTC on release day.', '2026-10-29'],
  ['Previous-quarter revenue was USD 70.0 billion, not the Q3 result.', '2026-10-29'],
  ['Preview articles discuss cloud margins and spending trends.', '2026-10-30'],
  ['Only schedules and analyst estimates were known; official Q3 2026 figures had not been published.', '2026-10-30'],
]);
const evidence = (id, title, content, source, extra = {}) => ({ id, title, content, source,
  url: `https://example.com/brain/${id}`, published_at: '2026-10-31T10:05:00Z', retrieved_at: '2026-10-31T10:06:00Z', ...extra });
const result = (action, reason, quote, novelty_summary, evidence_status = 'CONFIRMED') => ({ action, evidence_status, reason, evidence_basis: [{ quote }],
  ...(novelty_summary ? { novelty_summary } : {}) });
const signing = 'Manchester City officially confirmed that Player X has signed a five-year contract. The transfer is complete.';
const repeat = 'Player X has joined Manchester City on a five-year contract. The club confirmed the completed transfer yesterday.';
const rumor = 'An anonymous fan account claims the Manchester City manager may resign. The claim is unconfirmed and no independent corroboration or club statement is supplied.';
const figures = 'Microsoft published its official Q3 2026 results: revenue was USD 72.4 billion and diluted earnings per share were USD 3.18.';
const longArticle = [
  'Microsoft’s Q3 2026 reporting day brings together months of familiar discussion. The company scheduled publication for 31 October, and investors have been preparing for the afternoon earnings call. The calendar itself has not changed.',
  'Analysts heading into the announcement expected revenue of USD 72.1 billion and diluted earnings per share of USD 3.15. Those consensus estimates have appeared in several previews and remain a description of expectations, rather than reported results.',
  'Earlier articles focused on cloud margins, capital spending and the balance between enterprise subscriptions and consumer demand. Commentators repeated the same list of issues to watch, without supplying company-reported Q3 figures.',
  'The preceding quarter produced revenue of USD 70.0 billion. That historical figure provides background for comparisons, but does not answer what Microsoft earned during Q3 2026. The upcoming call is still scheduled for 14:00 UTC.',
  'Several market briefings again summarized analyst forecasts and the known timetable. Readers following the previews will recognize these details. The discussion of cloud trends and spending priorities largely follows earlier coverage.',
  figures,
  'The briefing then returns to familiar context: the expected conference call, questions about cloud margins, and the assumptions analysts used before publication. The earlier USD 72.1 billion and USD 3.15 figures were consensus expectations; they should not be confused with the company’s reported numbers above.',
  'As on previous reporting days, the call will provide management commentary after publication. The background issues remain broadly similar to those described throughout the preview cycle.',
].join('\n\n');
const specialistOne = 'Continental Live, an established specialist concert outlet, reports that Metallica is preparing to announce European dates soon, citing promoter-side planning contacts.';
const specialistTwo = 'Tour Desk, a separate established specialist live-music outlet, independently reports that European dates are expected soon, citing different venue-side contacts rather than the first article or its sources.';
const noConfirmation = 'Neither Metallica nor a promoter has officially confirmed European dates, a schedule or ticket sales.';
const tourReports = [specialistOne, specialistTwo,
  'The two reports are materially consistent and independently sourced. Fans are widely discussing them, but social discussion is not confirmation.', noConfirmation].join('\n\n');

export const fixtures = freeze([
  { id: 'J1', input: { intent: club, prior_state: talks,
    evidence: evidence('e1', 'Player X signs for Manchester City', signing, 'Manchester City official statement') },
    expected: { action: 'ALERT', evidence_status: 'CONFIRMED' }, mock: result('ALERT', 'Confirmed signing is a new transition beyond known negotiations.', signing, 'Talks became a completed signing.') },
  { id: 'J2', input: { intent: club, prior_state: signed,
    evidence: evidence('e2', 'Player X transfer report', repeat, 'Independent sports outlet') },
    expected: { action: 'NO_ALERT', evidence_status: 'CONFIRMED' }, mock: result('NO_ALERT', 'The same completed signing was already known and alerted.', repeat, 'New coverage, not a new development.') },
  { id: 'J3', input: { intent: club, prior_state: { entries: [] },
    evidence: evidence('e3', 'Another club renovates its stadium', 'Another club announced a stadium renovation. Manchester City is briefly mentioned as a past opponent; no new Manchester City information is reported.', 'Local sports newspaper') },
    expected: { action: 'NO_ALERT', evidence_status: 'CONFIRMED' }, mock: result('NO_ALERT', 'A passing mention supplies no relevant new development.', 'no new Manchester City information is reported') },
  { id: 'J4', input: { intent: fx, prior_state: { entries: [] },
    evidence: evidence('e4', 'Exchange-rate observation', 'The current supplied observation is GBP/EUR = 1.171.', 'Controlled numeric observation',
      { measurement: { metric: 'GBP/EUR', value: '1.171', quote: 'GBP/EUR = 1.171' } }) },
    expected: { action: 'ALERT', evidence_status: 'CONFIRMED' }, mock: result('ALERT', 'The new exact observation is strictly above 1.17.', 'GBP/EUR = 1.171', undefined, 'CONFIRMED') },
  { id: 'J5', input: { intent: fx, prior_state: { entries: [] },
    evidence: evidence('e5', 'Exchange-rate observation', 'The current supplied observation is GBP/EUR = 1.169.', 'Controlled numeric observation',
      { measurement: { metric: 'GBP/EUR', value: '1.169', quote: 'GBP/EUR = 1.169' } }) },
    expected: { action: 'NO_ALERT', evidence_status: 'CONFIRMED' }, mock: result('NO_ALERT', 'The exact value is below the strict threshold.', 'GBP/EUR = 1.169', undefined, 'CONFIRMED') },
  { id: 'J6', input: { intent: products, prior_state: { entries: [] },
    evidence: evidence('e6', 'Gucci perfume launch', 'Gucci officially launched a new perfume today. This announcement concerns only that fragrance.', 'Gucci product announcement') },
    expected: { action: 'NO_ALERT', evidence_status: 'CONFIRMED' }, mock: result('NO_ALERT', 'Perfumes are explicitly excluded by the verified intent.', 'Gucci officially launched a new perfume today.') },
  { id: 'J7', input: { intent: products, prior_state: { entries: [] },
    evidence: evidence('e7', 'Gucci handbag launch', 'Gucci officially launched a new handbag today. The item is a leather handbag, not a fragrance.', 'Gucci product announcement') },
    expected: { action: 'ALERT', evidence_status: 'CONFIRMED' }, mock: result('ALERT', 'A new handbag is relevant and outside the perfume exclusion.', 'Gucci officially launched a new handbag today.') },
  { id: 'J8', input: { intent: release, prior_state: { entries: [] },
    evidence: evidence('e8', 'Product X US launch', 'Product X has been released in the United States. It is not yet available for purchase in France.', 'Product X official release notice') },
    expected: { action: 'NO_ALERT', evidence_status: 'CONFIRMED' }, mock: result('NO_ALERT', 'France availability is explicitly not met.', 'It is not yet available for purchase in France.') },
  { id: 'J9', input: { intent: release, prior_state: { entries: [] },
    evidence: evidence('e9', 'Product X France release', 'Product X is now released and available for purchase in France. Orders can be placed for delivery in France.', 'Product X official France page') },
    expected: { action: 'ALERT', evidence_status: 'CONFIRMED' }, mock: result('ALERT', 'Release and actual purchase availability in France are supported.', 'Product X is now released and available for purchase in France.') },
  { id: 'J10', input: { intent: club, prior_state: { entries: [] },
    evidence: evidence('e10', 'Unconfirmed manager claim', rumor, 'Anonymous fan account, identity unverified') },
    expected: { action: 'NO_ALERT', evidence_status: 'WEAK_UNCONFIRMED' }, mock: result('NO_ALERT', 'The plausible manager claim is weak and unconfirmed, supported only by one anonymous account.', 'The claim is unconfirmed and no independent corroboration or club statement is supplied.', undefined, 'WEAK_UNCONFIRMED') },
  { id: 'J11', input: { intent: release, prior_state: france,
    evidence: evidence('e11', 'Retailer Product X listing', 'A third-party French retailer lists Product X as in stock and available now for delivery in France. No reconciliation with the official France page is provided.', 'Third-party French retailer') },
    expected: { action: 'NO_ALERT', evidence_status: 'CONFLICTING' }, mock: result('NO_ALERT', 'The retailer claim conflicts with contemporaneous official French availability; the condition is unresolved.', 'Product X as in stock and available now for delivery in France', undefined, 'CONFLICTING') },
  { id: 'J12', input: { intent: earnings, prior_state: previews,
    evidence: evidence('e12', 'Microsoft Q3 2026 briefing and background', longArticle, 'Controlled briefing quoting the official Microsoft results release') },
    expected: { action: 'ALERT', evidence_status: 'CONFIRMED' }, mock: result('ALERT', 'Official earnings figures are genuinely new despite repeated preview material.', figures, 'Official Q3 figures replace previously known estimates and schedule.') },
  { id: 'J13', input: { intent: intent('Keep me informed about new Metallica concerts in Europe.'),
    prior_state: history([
      ['No European tour announcement was known before these reports.', '2026-10-30'],
      ['No independently corroborated reports of imminent European dates had been received.', '2026-10-30'],
    ]),
    evidence: evidence('e13', 'Specialist reports on possible Metallica European dates', tourReports, 'Controlled dossier of two independently sourced specialist reports') },
    expected: { action: 'ALERT', evidence_status: 'STRONG_UNCONFIRMED' },
    mock: { ...result('ALERT', 'Multiple credible independent specialist reports suggest European dates may be announced soon, but this is not officially confirmed.', specialistOne,
      'Credibly corroborated reports are new relative to no known European announcement or reporting.', 'STRONG_UNCONFIRMED'),
      evidence_basis: [specialistOne, specialistTwo, noConfirmation].map(quote => ({ quote })) } },
]);

export const LIVE_CASES = freeze([
  { id: 'L1', fixture: 'J1' }, { id: 'L2', fixture: 'J2' }, { id: 'L3', fixture: 'J4' },
  { id: 'L4', fixture: 'J6' }, { id: 'L5', fixture: 'J10' }, { id: 'L6', fixture: 'J12' }, { id: 'L7', fixture: 'J13' },
]);

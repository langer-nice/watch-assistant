import { consumerMediaRequests } from '../../src/js/test-support/consumer-media-requests.js';

export const individual = (id, label, type = 'organization') => ({ id, kind: 'individual', type,
  label, canonicalCode: null, membership: [], members: [], quantifier: null });
export const predicate = (id, kind, subjects, value = null) => ({ id, op: 'predicate', kind,
  subjects, value, operator: null, amount: null, unit: null });
export const fixture = (request, subjects, conditions, extra = {}) => {
  const value = { schemaVersion: 'interpretation.v1', originalRequest: request, language: 'en',
    intent: 'ongoing_news', domain: 'media_news', subjects, conditions, condition: conditions[0]?.id || null,
    topics: [], temporal: [], geographic: [], exclusions: [], recurrence: 'unspecified',
    ambiguities: [], unresolvedRequirements: [], evidence: [], ...extra };
  const add = (path, text) => {
    const start = request.indexOf(text);
    if (start < 0) throw Error(`Fixture evidence is absent: ${text}`);
    value.evidence.push({ path, start, end: start + text.length, text });
  };
  subjects.forEach((s, i) => {
    add(`/subjects/${i}/label`, s.label);
    s.membership.forEach((_, j) => add(`/subjects/${i}/membership/${j}`, request));
  });
  conditions.forEach((_, i) => add(`/conditions/${i}`, request));
  for (const key of ['topics', 'temporal', 'geographic', 'unresolvedRequirements']) {
    value[key].forEach((_, i) => add(`/${key}/${i}`, request));
  }
  return value;
};
const topics = labels => labels.map(label => ({ label, role: 'coverage_focus' }));
const request = index => consumerMediaRequests[index][1];
export const consumerFixtures = [
  fixture(request(0), [individual('sinner', 'Jannik Sinner', 'person')], [predicate('news', 'news_about', ['sinner'])], {
    topics: topics(['matches', 'results', 'upcoming tournaments', 'career developments']),
  }),
  fixture(request(1), [{ ...individual('players', 'Italian tennis players'), kind: 'open_group', type: 'person', quantifier: 'any',
    membership: [{ attribute: 'nationality', operator: 'eq', values: ['IT'] },
      { attribute: 'tour', operator: 'in', values: ['ATP', 'WTA'] }] }], [predicate('news', 'news_about', ['players'])], {
    topics: topics(['match results', 'tournaments', 'major achievements']),
  }),
  fixture(request(2), [{ ...individual('brands', 'Italian fashion brands'), kind: 'open_group', quantifier: 'any',
    membership: [{ attribute: 'country_association', operator: 'eq', values: ['IT'] },
      { attribute: 'industry', operator: 'eq', values: ['fashion'] }], members: ['gucci', 'prada', 'dolce', 'miumiu'] },
    ...['Gucci', 'Prada', 'Dolce & Gabbana', 'Miu Miu'].map((label, i) => individual(['gucci', 'prada', 'dolce', 'miumiu'][i], label))],
  [predicate('news', 'news_about', ['brands'])], { topics: topics(['collections', 'fashion shows', 'announcements']) }),
  fixture(request(3), ['Sephora', 'KIKO Milano', 'Charlotte Tilbury'].map((label, i) => individual(`brand${i}`, label)),
    [{ id: 'root', op: 'and', args: ['anybrand', 'beauty'] }, { id: 'anybrand', op: 'or', args: ['n0', 'n1', 'n2'] },
      ...[0, 1, 2].map(i => predicate(`n${i}`, 'news_about', [`brand${i}`])),
      predicate('beauty', 'topic', ['brand0', 'brand1', 'brand2'], 'beauty_products_launches_trends_announcements')]),
];
export const currencyFixture = request => {
  const french = request.includes('livre');
  return fixture(request, [
    { ...individual('base', french ? 'livre sterling' : 'pound', 'currency'), canonicalCode: 'GBP' },
    { ...individual('quote', french ? 'euro' : 'euros', 'currency'), canonicalCode: 'EUR' },
  ], [{ ...predicate('rate', 'numeric', ['base', 'quote'], 'exchange_rate'), operator: 'gt', amount: '1.18', unit: 'EUR' }],
  { language: french ? 'fr' : 'en', domain: 'currency', intent: 'numeric_condition', recurrence: 'unspecified',
    ambiguities: /whenever|chaque fois/iu.test(request) ? [{ field: 'recurrence', alternatives: ['crossing', 'per_observation'],
      question: french ? 'À chaque franchissement ou à chaque observation satisfaite ?' : 'On each crossing or each satisfied observation?' }] : [] });
};

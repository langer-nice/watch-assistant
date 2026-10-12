import { fixture, individual, predicate } from './watch-interpretation-fixtures.js';
import { compileMonitoringPlan } from '../../src/js/watch-capabilities.js';
import { createWatchDefinition } from '../../src/js/watch-definition.js';

export const examples = () => {
  const news = (request, label, language) => fixture(request, [individual('subject', label, label === 'Jannik Sinner' ? 'person' : 'organization')],
    [predicate('news', 'news_about', ['subject'])], { language });
  const currency = fixture('Notify me once when GBP is above 1.18 EUR.',
    [{ ...individual('gbp', 'GBP', 'currency'), canonicalCode: 'GBP' }, { ...individual('eur', 'EUR', 'currency'), canonicalCode: 'EUR' }],
    [{ ...predicate('rate', 'numeric', ['gbp', 'eur'], 'exchange_rate'), amount: '1.18', operator: 'gt', unit: 'EUR' }],
    { intent: 'numeric_condition', domain: 'currency', recurrence: 'once' });
  currency.evidence.push({ path: '/recurrence', start: 10, end: 14, text: 'once' });
  return [news('  Keep me updated on the latest news about Jannik Sinner.  ', 'Jannik Sinner', 'en'),
    news('Tiens-moi informé des dernières actualités de Jannik Sinner.', 'Jannik Sinner', 'fr'),
    news('Monitor news about Gucci.', 'Gucci', 'en'), news('Surveille les actualités concernant Gucci.', 'Gucci', 'fr'),
    currency,
    fixture('Monitor official BODACC filings for Company A SIREN 552100554.', [individual('company', 'Company A')],
      [predicate('filing', 'event', ['company'], 'official_registry_filing')], { domain: 'official_company', intent: 'event' })];
};
export const definitions = () => examples().map(value => createWatchDefinition(value, compileMonitoringPlan(value, { structured: true })));

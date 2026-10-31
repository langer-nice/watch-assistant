// Controlled examples, never a runtime lookup or semantic fallback.
import { createCapture } from './capture.mjs';
import { freeze } from './schema.mjs';

export const EXACT_URL = 'https://example.com/jobs?team=design&city=Nice#openings';
const article = [{ id: 'article', kind: 'excerpt',
  text: 'Player X is considering a transfer to Manchester City. Negotiations continue; Player X has not signed.',
  url: 'https://example.com/transfer-story' }];
const resource = [{ id: 'resource', kind: 'page', text: 'Jobs', url: EXACT_URL }];
const ref = (label, source_ref = 'raw_input') => ({ label, source_ref });
const constraint = (kind, text, source_ref = 'raw_input', value = text) => ({ kind, text, source_ref, value });
const ready = (canonical_text, references, explicit_constraints = []) => ({
  intent: { canonical_text, references, explicit_constraints, unresolved_ambiguities: [] },
  decision: { status: 'READY_TO_MONITOR', reason: 'The requested subject and scope are sufficiently clear.' },
});
const clarify = (canonical_text, references, ambiguity, question) => ({
  intent: { canonical_text, references, unresolved_ambiguities: [ambiguity] },
  decision: { status: 'NEEDS_CLARIFICATION', reason: ambiguity, clarification_question: question },
});
const urlRef = { label: 'Jobs', source_ref: 'resource', exact_url: EXACT_URL };
const urlConstraint = constraint('exact_resource', EXACT_URL, 'resource');

const definitions = [
  ['T1', 'FREE_TEXT', 'Tell me when there are important new developments about Manchester City.', [],
    ready('Keep me informed about important new developments concerning Manchester City.', [ref('Manchester City')]),
    ['Manchester City', 'important', 'developments'], ['transfer', 'signing', 'earnings', 'official', 'only from', 'source restriction']],
  ['T2', 'FREE_TEXT', 'Tell me when Microsoft publishes its Q3 2026 earnings results.', [],
    ready('Tell me when Microsoft publishes its Q3 2026 earnings results.', [ref('Microsoft')], [constraint('period', 'Q3 2026')]),
    ['Microsoft', 'publishes', 'earnings', 'Q3 2026'], ['official', 'only from', '2026-09-30']],
  ['T3', 'FREE_TEXT', 'Tell me when GBP/EUR goes above 1.17.', [],
    ready('Alert me when GBP/EUR is strictly above 1.17.', [ref('GBP/EUR')],
      [constraint('threshold', '1.17'), constraint('comparator', 'above')]),
    ['GBP/EUR', 'strictly above', '1.17'], ['>=', 'at least', 'EUR/GBP', '1.18', 'ECB']],
  ['T4', 'FREE_TEXT', 'Keep me informed about new products from Gucci and Chanel.', [],
    ready('Keep me informed about new products from Gucci and Chanel, independently from either brand.',
      [ref('Gucci'), ref('Chanel')], [constraint('relation', 'and')]),
    ['Gucci', 'Chanel', 'new products', 'independently'], ['collaboration', 'joint product', 'co-occurrence', 'perfume']],
  ['T5', 'FREE_TEXT', 'Tell me about new Gucci products, but not perfumes.', [],
    ready('Tell me about new Gucci products, excluding perfumes.', [ref('Gucci')], [constraint('exclusion', 'but not perfumes')]),
    ['Gucci', 'new', 'products', 'excluding perfumes'], ['beauty', 'cosmetics', 'Chanel']],
  ['T6', 'FREE_TEXT', 'Tell me when product X is released, but only if it is available in France.', [],
    ready('Tell me when product X is released, only if it is available in France.', [ref('product X')],
      [constraint('condition', 'only if it is available in France')]),
    ['released', 'only if', 'available in France'], ['French source', 'sources in France', 'French article', 'prefer France']],
  ['T7', 'FREE_TEXT', 'Tell me when Apple does something important.', [],
    clarify('Keep me informed about important Apple developments; the desired scope is unresolved.', [ref('Apple')],
      'Which developments count as important materially changes the scope.', 'Which Apple developments would you like to follow?'),
    ['Apple', 'scope'], ['products only', 'earnings only', 'product launches', 'stock price']],
  ['T8', 'FREE_TEXT', 'Keep me informed about this company.', [],
    clarify('Keep me informed about a company that has not been identified.', [],
      'The company to follow is not identified.', 'Which company would you like to follow?'),
    ['company', 'not been identified'], ['Gucci', 'Apple', 'Microsoft']],
  ['T9', 'FREE_TEXT', 'Keep me informed about this company.',
    [{ id: 'prior', kind: 'prior_user_context', text: 'The company we are discussing is Gucci.' }],
    ready('Keep me informed about developments concerning Gucci.', [ref('Gucci', 'prior')]),
    ['Gucci', 'developments'], ['products only', 'perfume', 'Chanel']],
  ['T10', 'PAGE_CONTEXT', 'Follow this story', article,
    ready('Follow developments in the specific Player X transfer to Manchester City story.',
      [ref('Player X', 'article'), ref('Manchester City', 'article')]),
    ['specific', 'transfer', 'Player X', 'Manchester City'], ['generally', 'all club news', 'club-wide']],
  ['T11', 'PAGE_CONTEXT', 'Follow Manchester City', article,
    ready('Keep me informed about Manchester City generally.', [ref('Manchester City')]),
    ['Manchester City', 'generally'], ['transfer', 'Player X', 'signing']],
  ['T12', 'PAGE_CONTEXT', 'Tell me only if Player X actually signs.', article,
    ready('Tell me only on confirmation that Player X signs for Manchester City in this transfer.',
      [ref('Player X'), ref('Manchester City', 'article')], [constraint('condition', 'only if Player X actually signs')]),
    ['confirmation', 'Player X', 'signs', 'Manchester City'], ['generally', 'all club news', 'rumours', 'rumors']],
  ['T13', 'URL', 'Monitor this page', resource,
    ready('Monitor this exact resource for meaningful changes.', [urlRef], [urlConstraint]),
    ['exact resource', 'meaningful changes'], ['transfer', 'Manchester City', 'new jobs', 'price', 'stock']],
  ['T14', 'URL', 'Tell me when new jobs in Nice appear here.', resource,
    ready('Tell me when new jobs in Nice appear on this exact resource.', [urlRef], [urlConstraint]),
    ['new jobs', 'Nice', 'exact resource'], ['any page change', 'all changes', 'generic changes', 'Paris']],
  ['T15', 'SEARCH_CONTEXT', 'Keep me informed about Manchester City generally.',
    [{ id: 'query', kind: 'search_query', text: 'Manchester City transfer' },
      { id: 'snippet', kind: 'search_result_snippet', text: 'Player X transfer negotiations with Manchester City.' }],
    ready('Keep me informed about Manchester City generally.', [ref('Manchester City')]),
    ['Manchester City', 'generally'], ['transfer', 'Player X', 'signing']],
];

export const fixtures = freeze(definitions.map(([id, kind, raw_input, context, output, required, forbidden]) => ({
  id,
  capture: createCapture({ id, kind, raw_input, context,
    source_metadata: { captured_at: '2026-10-31T12:00:00.000Z', source_label: 'conceptual fixture' } }),
  output, expected_status: output.decision.status, required, forbidden,
})));

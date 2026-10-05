import { parseMediaMentionRequest } from './media-mention-request.js';
import { mediaMentionSearchQuery } from './media-subject-aliases.js';

export const mediaQueryError = (reason = 'unrecognized-instruction') => Object.assign(new Error('Review the media subjects and constraints before searching.'), { code: 'MEDIA_QUERY_REVIEW_REQUIRED', statusCode: 422, reason });
export const googleNewsSource = value => {
  try { const u = new URL(value); return u.origin === 'https://news.google.com' && u.pathname === '/rss/search' ? u : null; } catch { return null; }
};
export const mediaMentionDefinition = parsed => ({ subjects: [...parsed.subjects], matchMode: 'all',
  ...Object.fromEntries(['topics', 'exclusions', 'locale'].filter(k => parsed[k]).map(k => [k, parsed[k]])),
});
export const planMediaQuery = (request, { language = 'en', sourceUrl } = {}) => {
  const parsed = parseMediaMentionRequest(request);
  if (!parsed.recognized) throw mediaQueryError();
  const source = sourceUrl ? googleNewsSource(sourceUrl) : null;
  if (sourceUrl && !source) throw mediaQueryError();
  // Preserve an existing edition unless the instruction explicitly changes it.
  const country = parsed.locale?.country || source?.searchParams.get('gl') || (language === 'fr' ? 'FR' : 'GB');
  const contentLanguage = parsed.locale?.language || source?.searchParams.get('ceid')?.split(':')[1] || (language === 'fr' ? 'fr' : 'en');
  if (!/^[A-Z]{2}$/.test(country) || !/^[a-z]{2}$/.test(contentLanguage)) throw mediaQueryError();
  const query = mediaMentionSearchQuery(parsed);
  const url = new URL('https://news.google.com/rss/search');
  url.searchParams.set('q', query);
  url.searchParams.set('hl', parsed.locale || !source ? (contentLanguage === 'en' ? `en-${country}` : contentLanguage) : source.searchParams.get('hl') || contentLanguage);
  url.searchParams.set('gl', country);
  url.searchParams.set('ceid', `${country}:${contentLanguage}`);
  return { mediaMention: mediaMentionDefinition(parsed), monitoringSource: { type: 'feed', url: url.href, query } };
};
export const validateMediaQuery = (definition, source) => {
  if (definition?.inputType !== 'text' || !googleNewsSource(source?.url)) return;
  const expected = planMediaQuery(definition.request, { sourceUrl: source.url });
  const url = new URL(source.url), planned = new URL(expected.monitoringSource.url);
  if (source.query !== expected.monitoringSource.query) throw mediaQueryError('query-mismatch');
  if (['q','hl','gl','ceid'].some(k => url.searchParams.getAll(k).length !== 1 || url.searchParams.get(k) !== planned.searchParams.get(k))
    || [...url.searchParams.keys()].some(k => !['q','hl','gl','ceid'].includes(k))) throw mediaQueryError('url-mismatch');
  if (['subjects','matchMode','topics','exclusions'].some(k => JSON.stringify(definition.mediaMention?.[k]) !== JSON.stringify(expected.mediaMention[k]))
    || ['language','country'].some(k => definition.mediaMention?.locale?.[k] !== expected.mediaMention.locale?.[k])) throw mediaQueryError('criteria-mismatch');
};

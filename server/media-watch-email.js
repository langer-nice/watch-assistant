import { getWatchEmailConfig } from './watch-email-config.js';
import { createHash } from 'node:crypto';
import { sendWithResend } from './company-watch-email.js';

const cleanText = (value, limit) => (typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim().slice(0, limit) : '');
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const validHttpsUrl = (value) => { try { const url = new URL(String(value || '').trim()); return url.protocol === 'https:' && !url.username && !url.password ? url : null; } catch { return null; } };

export const getMediaWatchEmailConfig = (env = process.env) => getWatchEmailConfig(env, 'MEDIA_WATCH_EMAIL_NOTIFICATIONS_ENABLED');

export const createMediaNotificationIdempotencyKey = ({ watchId, userId, sourceArticleId }) => `watch-media-${createHash('sha256').update(`${watchId}\0${userId}\0${sourceArticleId}`).digest('hex')}`;
const messages = {
  en: { subject: (watch) => `New article detected for ${watch}`, heading: 'A new matching article was detected', intro: (watch) => `Your Watch for ${watch} found a new matching article. The headline is supplied by its publisher and is not an endorsement or a verified statement by the monitored subject.`, source: 'Publication', date: 'Publication date', summary: 'Publisher summary', article: 'Read the article', detail: 'View Watch details' },
  fr: { subject: (watch) => `Nouvel article détecté pour ${watch}`, heading: 'Un nouvel article correspondant a été détecté', intro: (watch) => `Votre Watch pour ${watch} a trouvé un nouvel article correspondant. Le titre est fourni par son éditeur et ne constitue ni une approbation ni une déclaration vérifiée du sujet surveillé.`, source: 'Publication', date: 'Date de publication', summary: 'Résumé de l’éditeur', article: 'Lire l’article', detail: 'Voir les détails de la Watch' },
};
const formatDate = (value, locale) => { if (value == null || value === '') return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date); };

export const renderMediaWatchEmail = ({ locale, watchId, watchTitle, article, baseUrl }) => {
  const language = locale === 'fr' ? 'fr' : 'en'; const copy = messages[language];
  const watch = cleanText(watchTitle, 200) || 'Media Watch'; const title = cleanText(article?.title, 300) || (language === 'fr' ? 'Article sans titre' : 'Untitled article');
  const source = cleanText(article?.source, 300) || (language === 'fr' ? 'Source inconnue' : 'Unknown source'); const summary = cleanText(article?.summary, 500); const date = formatDate(article?.publishedAt, language);
  const articleUrl = validHttpsUrl(article?.url); if (!articleUrl) throw Object.assign(new Error('Article URL is invalid.'), { code: 'INVALID_ARTICLE_URL' });
  const appUrl = validHttpsUrl(baseUrl); if (!appUrl) throw Object.assign(new Error('Application URL is invalid.'), { code: 'INVALID_APP_URL' });
  const detailUrl = new URL('/watch-detail.html', appUrl); detailUrl.searchParams.set('id', watchId);
  const text = [copy.heading, '', copy.intro(watch), '', title, `${copy.source}: ${source}`, ...(date ? [`${copy.date}: ${date}`] : []), ...(summary ? ['', `${copy.summary}: ${summary}`] : []), '', `${copy.article}: ${articleUrl.href}`, `${copy.detail}: ${detailUrl.href}`].join('\n');
  const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${escapeHtml(copy.subject(watch))}</title></head><body style="font-family:Arial,sans-serif;color:#18181b"><h1>${escapeHtml(copy.heading)}</h1><p>${escapeHtml(copy.intro(watch))}</p><h2>${escapeHtml(title)}</h2><p><strong>${escapeHtml(copy.source)}:</strong> ${escapeHtml(source)}</p>${date ? `<p><strong>${escapeHtml(copy.date)}:</strong> ${escapeHtml(date)}</p>` : ''}${summary ? `<p><strong>${escapeHtml(copy.summary)}:</strong> ${escapeHtml(summary)}</p>` : ''}<p><a href="${escapeHtml(articleUrl.href)}">${escapeHtml(copy.article)}</a></p><p><a href="${escapeHtml(detailUrl.href)}">${escapeHtml(copy.detail)}</a></p></body></html>`;
  return { subject: copy.subject(watch), html, text, articleUrl: articleUrl.href, detailUrl: detailUrl.href };
};
export { sendWithResend };

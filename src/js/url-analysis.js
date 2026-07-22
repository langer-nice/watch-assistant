import { extractMonitoringConcepts } from './monitoring-concepts.js';

const PUBLISHERS = [
  { host: /(^|\.)bbc\.(com|co\.uk)$/i, source: 'BBC News' },
  { host: /(^|\.)theguardian\.com$/i, source: 'The Guardian' },
  { host: /(^|\.)nytimes\.com$/i, source: 'The New York Times' },
  { host: /(^|\.)reuters\.com$/i, source: 'Reuters' },
  { host: /(^|\.)cnn\.com$/i, source: 'CNN' },
];

const getPublisher = (url) => {
  const knownPublisher = PUBLISHERS.find(({ host }) => host.test(url.hostname));
  if (knownPublisher) {
    return knownPublisher.source;
  }

  const hostname = url.hostname.replace(/^www\./i, '');
  const publisher = hostname.split('.').at(-2) || hostname;
  return publisher.charAt(0).toUpperCase() + publisher.slice(1);
};

const requestJson = async (path, body, signal) => {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The URL could not be analysed.');
  return result;
};

const trimTerminalPunctuation = (value) => value.replace(/[.!?]+$/g, '').trim();

const getTitleDerivedKeywords = (title) => {
  const keywords = extractMonitoringConcepts(title, 6);
  const words = title.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];

  words.forEach((word) => {
    if (keywords.length >= 6 || word.length < 3) return;
    const label = `${word.charAt(0).toLocaleUpperCase()}${word.slice(1)}`;
    if (!keywords.some((keyword) => keyword.toLocaleLowerCase() === label.toLocaleLowerCase())) {
      keywords.push(label);
    }
  });
  const monitoringTerms = document.documentElement.lang === 'fr'
    ? ['Évolutions', 'Réactions', 'Actualités']
    : ['Developments', 'Reactions', 'Reporting'];
  monitoringTerms.forEach((label) => {
    if (keywords.length < 4) keywords.push(label);
  });
  return keywords;
};

export const createTitleDerivedFallback = (pageTitle) => {
  const title = pageTitle.trim();
  const subject = trimTerminalPunctuation(title);
  const summary = document.documentElement.lang === 'fr'
    ? `Nouveaux développements, réactions et informations complémentaires concernant « ${subject} ».`
    : `New developments, reactions and follow-up reporting related to “${subject}”.`;
  return {
    watchTitle: title,
    watchingFor: summary,
    description: summary,
    keywords: getTitleDerivedKeywords(title),
  };
};

/**
 * Stable integration boundary for URL analysis.
 *
 * Fetches only page-title metadata, then sends only that title for Watch generation.
 */
export const analyseUrl = async (input, { onProgress, signal } = {}) => {
  const sourceUrl = input.trim();
  const url = new URL(/^https?:\/\//i.test(sourceUrl) ? sourceUrl : `https://${sourceUrl}`);
  const source = getPublisher(url);
  onProgress?.('fetching-title');
  const page = await requestJson('/api/page-title', { url: url.href }, signal);
  onProgress?.('generating-watch');
  let suggestion;
  try {
    suggestion = await requestJson('/api/watch-suggestion', { title: page.title }, signal);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.warn('AI Watch generation failed; using the real page title fallback.', error);
    suggestion = createTitleDerivedFallback(page.title);
  }

  return {
    status: 'success',
    title: suggestion.watchTitle,
    summary: suggestion.watchingFor || suggestion.description,
    description: suggestion.description,
    keywords: suggestion.keywords,
    source,
    sourceTitle: page.title,
    sourceUrl: page.sourceUrl || url.href,
  };
};

import {
  extractMonitoringConcepts,
  normalizeMonitoringConcepts,
  normalizeStoryFingerprint,
} from './monitoring-concepts.js';

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

const getUrlSlug = (url) => decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '')
  .replace(/[-_]+/g, ' ')
  .trim();

const getTitleDerivedKeywords = (title) => {
  return extractMonitoringConcepts(title, 8);
};

const countValues = (values) => {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((first, second) => second[1] - first[1]);
};

const getSupportedPerson = (page) => {
  const metadataAuthor = String(page.author || '').trim();
  if (metadataAuthor && !/^https?:\/\//i.test(metadataAuthor)) return metadataAuthor;
  const excludedNames = /^(?:The Guardian|Czech Republic|Remote Mountains|Missing Hikers)$/i;
  const articleText = String(page.articleText || '');
  const names = [...articleText.matchAll(
    /\b\p{Lu}\p{Ll}+(?:[-’']\p{L}+)?(?:\s+\p{Lu}\p{Ll}+(?:[-’']\p{L}+)?){1,2}\b/gu,
  )]
    .filter((match) => {
      const contextBefore = articleText.slice(Math.max(0, match.index - 24), match.index);
      const contextAfter = articleText.slice(match.index + match[0].length, match.index + match[0].length + 24);
      return !/(?:photograph|photo|image):?\s*$/i.test(contextBefore)
        && !/^\s*\/\s*The Guardian/i.test(contextAfter);
    })
    .map((match) => match[0]);
  return countValues(names.filter((name) => !excludedNames.test(name)))[0]?.[0] || '';
};

const getSupportedLocation = (page, slug) => {
  const source = [page.title, page.description, page.articleText, slug].filter(Boolean).join(' ');
  const locations = [...source.matchAll(
    /\b(?:in|near|from|across|of)\s+(\p{Lu}[\p{L}'’-]*(?:\s+\p{Lu}[\p{L}'’-]*){0,2})/gu,
  )].map((match) => match[1].replace(/\s+(?:The|A|An)$/i, '').trim());
  return countValues(locations.filter(Boolean))[0]?.[0] || '';
};

export const createSourceDerivedFallback = (page, sourceUrl = '') => {
  const title = String(page.title || '').trim();
  const subject = trimTerminalPunctuation(title);
  const summary = document.documentElement.lang === 'fr'
    ? `Nouveaux développements, réactions et informations complémentaires concernant « ${subject} ».`
    : `New developments, reactions and follow-up reporting related to “${subject}”.`;
  const slug = (() => {
    try {
      return getUrlSlug(new URL(sourceUrl));
    } catch {
      return '';
    }
  })();
  const source = [title, page.description, page.articleText, slug].filter(Boolean).join(' ');
  const titleConcepts = getTitleDerivedKeywords(title);
  const missingHikers = titleConcepts.find((concept) => /missing hikers/i.test(concept));
  const remoteMountains = titleConcepts.find((concept) => /remote mountains/i.test(concept));
  const supportedPerson = getSupportedPerson(page);
  const supportedLocation = getSupportedLocation(page, slug);
  const supportsSearchOperation = /(?:search(?: and rescue)?|hunt)\b[\s\S]{0,80}\bmissing hikers?/i.test(source)
    || /missing hikers?[\s\S]{0,80}\bsearch(?: and rescue)?/i.test(source);
  const storyFingerprint = normalizeStoryFingerprint([
    supportedPerson && { label: supportedPerson, type: 'person' },
    supportedLocation && { label: supportedLocation, type: 'location' },
    missingHikers && { label: missingHikers, type: 'event' },
    supportsSearchOperation && { label: 'Search operation', type: 'event' },
    remoteMountains && { label: remoteMountains, type: 'supporting' },
    ...titleConcepts.map((label) => ({ label, type: 'supporting' })),
  ].filter(Boolean), 8);
  return {
    watchTitle: title,
    watchingFor: summary,
    description: summary,
    storyFingerprint,
    keywords: storyFingerprint.map(({ label }) => label),
  };
};

export const createTitleDerivedFallback = (pageTitle) => {
  return createSourceDerivedFallback({ title: pageTitle });
};

/**
 * Stable integration boundary for URL analysis.
 *
 * Fetches available page metadata and article text, then sends only retrieved source content.
 */
export const analyseUrl = async (input, { onProgress, signal } = {}) => {
  const sourceUrl = input.trim();
  const url = new URL(/^https?:\/\//i.test(sourceUrl) ? sourceUrl : `https://${sourceUrl}`);
  const source = getPublisher(url);
  onProgress?.('fetching-title');
  const page = await requestJson('/api/page-title', { url: url.href }, signal);
  const conceptSourceFields = Array.isArray(page.conceptSourceFields)
    ? page.conceptSourceFields
    : ['title', 'description', 'articleText', 'author'].filter((field) => page[field]);
  if (import.meta.env.DEV) {
    console.info(
      `[Story Fingerprint] Retrieved source fields: ${conceptSourceFields.join(', ') || 'slug only'}`,
    );
    if (!page.description && !page.articleText) {
      console.info('[Story Fingerprint] Limited source: using title/slug only.');
    }
  }
  onProgress?.('generating-watch');
  let suggestion;
  try {
    suggestion = await requestJson('/api/watch-suggestion', {
      title: page.title,
      description: page.description,
      articleText: page.articleText,
      author: page.author,
      slug: getUrlSlug(url),
    }, signal);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.warn('AI Watch generation failed; using the real page title fallback.', error);
    suggestion = createSourceDerivedFallback(page, url.href);
  }
  const keywords = normalizeMonitoringConcepts(suggestion.keywords, 8);
  const storyFingerprint = normalizeStoryFingerprint(
    suggestion.storyFingerprint
      || keywords.map((label) => ({ label, type: 'supporting' })),
    8,
  );

  return {
    status: 'success',
    title: suggestion.watchTitle,
    summary: suggestion.watchingFor || suggestion.description,
    description: suggestion.description,
    keywords: keywords.length ? keywords : getTitleDerivedKeywords(page.title),
    storyFingerprint,
    source,
    sourceTitle: page.title,
    sourceUrl: page.sourceUrl || url.href,
    conceptSourceFields,
  };
};

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

const getDemoAnalysis = (source) => {
  if (source === 'BBC News') {
    return {
      title: 'Police investigate possible left-wing motive in Ann Widdecombe killing',
      summary: 'Meaningful developments in this investigation.',
    };
  }

  if (source === 'The Guardian') {
    return {
      title: 'New developments in the story you shared',
      summary: 'Important changes and confirmed reporting about this story.',
    };
  }

  return {
    title: 'An important story you’re following',
    summary: 'Meaningful changes and confirmed developments in this story.',
  };
};

/**
 * Stable integration boundary for URL analysis.
 *
 * Today this returns realistic demo data. A future backend can return the same
 * title/summary/source fields plus Story Fingerprint and keywords without any UI change.
 */
export const analyseUrl = async (input) => {
  const sourceUrl = input.trim();
  const url = new URL(/^https?:\/\//i.test(sourceUrl) ? sourceUrl : `https://${sourceUrl}`);
  const source = getPublisher(url);
  const analysis = getDemoAnalysis(source);

  await new Promise((resolve) => setTimeout(resolve, 1400));

  return {
    status: 'success',
    ...analysis,
    source,
    sourceTitle: analysis.title,
    sourceUrl,
  };
};

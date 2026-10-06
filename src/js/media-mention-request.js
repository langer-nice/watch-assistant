const cleanQuery = (value) => String(value || '')
  .replace(/^\s*["'“”‘’«»]+|["'“”‘’«»]+\s*$/gu, '')
  .replace(/[.!?]+$/u, '')
  .replace(/\s+/gu, ' ')
  .trim();

const UNSAFE_GENERIC_SUBJECT = /^(?:anything|something|someone|somebody|everything|it|this|that|they|them|he|him|she|her|quelqu['’]un|quelque chose|ceci|cela|ça|ils|elles|eux)$/iu;
const UNSUPPORTED_SUBJECT_RELATION = /(?:\s+(?:or|ou)\s+|\b(?:maybe|perhaps|possibly|peut[- ]?[êe]tre|[ée]ventuellement)\b)/iu;

const splitCoordinatedSubjects = (query, language) => {
  const separator = language === 'fr' ? /\s+(?:et|&)\s+/iu : /\s+(?:and|&)\s+/iu;
  const subjects = query.split(separator).map(cleanQuery).filter(Boolean);
  if (
    subjects.length !== 2
    || subjects.some((subject) => (
      subject.length < 2
      || UNSAFE_GENERIC_SUBJECT.test(subject)
      || !/[\p{L}\p{N}]/u.test(subject)
    ))
  ) return [query];
  return subjects;
};

// Short topic requests are news only when they explicitly name news or a
// public-event topic. Bare entities and operational conditions require review.
const NEWS_TOPIC = /(?<![\p{L}\p{N}])(?:protests?|elections?|strikes?|summits?|legislation|referendums?|manifestations?|grèves?|élections?|référendums?|actualité|actualités)(?![\p{L}\p{N}])/iu;
const NON_NEWS_INTENT = /\b(?:price|prices|stock|available|availability|drops?|reaches?|above|below|real[- ]time|every|daily|hourly|when|whenever|if|until|before|after|since|changes?|quand|lorsque|si|avant|après|depuis|prix|disponib|atteint|dépasse|inférieur|supérieur|quotidien|chaque)\b|[<>≤≥]/iu;
const PATTERNS = [
  { language: 'en', pattern: /^(?:(?:please\s+)?(?:follow|track|watch)\s+)?news\s+(?:about|on)\s+(.+)$/iu },

  {
    language: 'en',
    pattern: /^(?:please\s+)?(?:monitor(?:ing)?|watch)\s+(?:(?:for|there\s+is)\s+)?(?:new\s+)?(?:information|news|updates)\s+(?:about|on)\s+(.+)$/iu,
  },
  {
    language: 'fr',
    pattern: /^surveille\s+(?:les\s+)?(?:nouvelles\s+informations|actualit[ée]s|informations)\s+(?:sur|concernant)\s+(.+)$/iu,
  },
  {
    language: 'en',
    pattern: /^(?:please\s+)?(?:tell\s+me|let\s+me\s+know|notify\s+me|alert\s+me)\s+(?:when|whenever|if)\s+(.+?)\s+(?:is\s+mentioned|appears?)\s+in\s+(?:the\s+)?(?:media|news|press)$/iu,
  },
  {
    language: 'en',
    coordinated: true,
    pattern: /^(?:please\s+)?(?:tell\s+me|let\s+me\s+know|notify\s+me|alert\s+me)\s+(?:when|whenever|if)\s+(.+?)\s+(?:are\s+mentioned|appear)\s+in\s+(?:the\s+)?(?:media|news|press)$/iu,
  },
  {
    language: 'en',
    pattern: /^(?:please\s+)?(?:watch\s+for|monitor)\s+(?:media|news|press)\s+mentions?\s+of\s+(.+)$/iu,
  },
  {
    language: 'fr',
    pattern: /^(?:s['’]il\s+te\s+pla[îi]t\s+)?(?:dis|pr[ée]viens|informe|avertis)-moi\s+(?:quand|lorsque|si)\s+(.+?)\s+(?:est\s+mentionn[ée]e?|appara[îi]t)\s+dans\s+(?:les\s+m[ée]dias|le\s+m[ée]dia|la\s+presse|l['’]actualit[ée])$/iu,
  },
  {
    language: 'fr',
    coordinated: true,
    pattern: /^(?:s['’]il\s+te\s+pla[îi]t\s+)?(?:dis|pr[ée]viens|informe|avertis)-moi\s+(?:quand|lorsque|si)\s+(.+?)\s+(?:sont\s+mentionn(?:[ée]s?|[ée]es)|apparaissent)\s+dans\s+(?:les\s+m[ée]dias|le\s+m[ée]dia|la\s+presse|l['’]actualit[ée])$/iu,
  },
  {
    language: 'fr',
    pattern: /^(?:s['’]il\s+te\s+pla[îi]t\s+)?surveille\s+(?:les\s+)?mentions?\s+(?:de|d['’])\s*(.+?)\s+dans\s+(?:les\s+m[ée]dias|le\s+m[ée]dia|la\s+presse|l['’]actualit[ée])$/iu,
  },
  { language: 'en', topic: true, pattern: /^(?:please\s+)?(?:monitor(?:ing)?|follow|track|watch)\s+(.+)$/iu },
  { language: 'fr', topic: true, pattern: /^(?:surveille[r]?|suivre|suis|suivi\s+de)\s+(.+)$/iu },
];

export const parseMediaMentionRequest = (request) => {
  let value = String(request || '').replace(/\s+/gu, ' ').trim().replace(/[.!?]+$/u, '');
  // Only explicit, bounded suffix clauses are interpreted. Never discard an
  // unrecognized qualifier to obtain a broader subject-only search.
  const constraints = {};
  const locale = {};
  let invalid = false;
  const setLocale = (key, value) => {
    if (locale[key] && locale[key] !== value) invalid = true;
    locale[key] = value;
  };
  const suffixes = [
    [/\s+(?:in French|en français)$/iu, () => { setLocale('language', 'fr'); }],
    [/\s+(?:in English|en anglais)$/iu, () => { setLocale('language', 'en'); }],
    [/\s+(?:in France|en France)$/iu, () => { setLocale('country', 'FR'); }],
    [/\s+(?:in the UK|au Royaume-Uni)$/iu, () => { setLocale('country', 'GB'); }],
    [/\s+(?:in the US|aux États-Unis)$/iu, () => { setLocale('country', 'US'); }],
    [/\s+(?:excluding|except|sauf|hors)\s+([^,;]+)$/iu, m => { constraints.exclusions = [cleanQuery(m[1]), ...(constraints.exclusions || [])]; }],
    [/\s+(?:concerning|regarding|concernant|au sujet de)\s+([^,;]+)$/iu, m => { constraints.topics = [cleanQuery(m[1]), ...(constraints.topics || [])]; }],
  ];
  for (let n = 0; n < 20; n++) {
    // Pick the rightmost clause, so a topic never absorbs an exclusion or locale.
    const matches = [];
    for (let i = 0; i < value.length; i++) {
      if (value[i] !== ' ') continue;
      for (const [pattern, apply] of suffixes) {
        const match = value.slice(i).match(pattern);
        if (match && match.index === 0) { match.index = i; matches.push({ match, apply }); }
      }
    }
    const suffix = matches.sort((a, b) => b.match.index - a.match.index)[0];
    if (!suffix) break;
    suffix.apply(suffix.match);
    value = value.slice(0, suffix.match.index).trim().replace(/[,;]$/, '').trim();
  }
  for (const values of [constraints.topics, constraints.exclusions]) {
    if (values && (values.length > 8 || values.some(v => !v || v.length > 200
      || /[;<>"\\]|\b(?:only|without|uniquement|sans|or|ou|in|en|before|after|since|depuis|avant|après)\b/iu.test(v)))) invalid = true;
  }
  if (Object.keys(locale).length) constraints.locale = locale;
  for (const { language, pattern, coordinated = false, topic = false } of PATTERNS) {
    const match = value.match(pattern);
    const query = cleanQuery(match?.[1]);
    if (
      !invalid && query
      && (!topic || (NEWS_TOPIC.test(query) && !NON_NEWS_INTENT.test(query)))
      && query.length <= 200
      && /[\p{L}\p{N}]/u.test(query)
      && !UNSAFE_GENERIC_SUBJECT.test(query)
      && !UNSUPPORTED_SUBJECT_RELATION.test(query)
      && !/\b(?:excluding|except|sauf|hors|concerning|regarding|concernant|only|uniquement|without|sans)\b|\s(?:in|en|au|aux)\s/iu.test(query)
      && !/[;<>]|(?:^|\s)-\w|\b(?:site|when|after|before):/iu.test(query)
    ) {
      const subjects = coordinated ? splitCoordinatedSubjects(query, language) : [query];
      if (coordinated && subjects.length !== 2) continue;
      return {
        recognized: true,
        query,
        language,
        subjects,
        matchMode: 'all',
        ...constraints,
      };
    }
  }
  return {
    recognized: false,
    query: null,
    language: null,
    subjects: [],
    matchMode: null,
  };
};

export const getMediaMentionConcepts = (request) => {
  const parsed = parseMediaMentionRequest(request);
  return parsed.recognized
    ? parsed.subjects.map((label) => ({ label, type: 'manual' }))
    : null;
};

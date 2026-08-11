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

const PATTERNS = [
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
    pattern: /^(?:s['’]il\s+te\s+pla[îi]t\s+)?(?:dis|pr[ée]viens|informe|avertis)-moi\s+(?:quand|lorsque|si)\s+(.+?)\s+(?:est\s+mentionn[ée]e?|appara[îi]t)\s+dans\s+(?:les\s+m[ée]dias|la\s+presse|l['’]actualit[ée])$/iu,
  },
  {
    language: 'fr',
    coordinated: true,
    pattern: /^(?:s['’]il\s+te\s+pla[îi]t\s+)?(?:dis|pr[ée]viens|informe|avertis)-moi\s+(?:quand|lorsque|si)\s+(.+?)\s+(?:sont\s+mentionn(?:[ée]s?|[ée]es)|apparaissent)\s+dans\s+(?:les\s+m[ée]dias|la\s+presse|l['’]actualit[ée])$/iu,
  },
  {
    language: 'fr',
    pattern: /^(?:s['’]il\s+te\s+pla[îi]t\s+)?surveille\s+(?:les\s+)?mentions?\s+(?:de|d['’])\s*(.+?)\s+dans\s+(?:les\s+m[ée]dias|la\s+presse|l['’]actualit[ée])$/iu,
  },
];

export const parseMediaMentionRequest = (request) => {
  const value = String(request || '').replace(/\s+/gu, ' ').trim().replace(/[.!?]+$/u, '');
  for (const { language, pattern, coordinated = false } of PATTERNS) {
    const match = value.match(pattern);
    const query = cleanQuery(match?.[1]);
    if (
      query
      && query.length <= 200
      && /[\p{L}\p{N}]/u.test(query)
      && !UNSAFE_GENERIC_SUBJECT.test(query)
      && !UNSUPPORTED_SUBJECT_RELATION.test(query)
    ) {
      const subjects = coordinated ? splitCoordinatedSubjects(query, language) : [query];
      return {
        recognized: true,
        query,
        language,
        subjects,
        matchMode: 'all',
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

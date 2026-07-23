const SUMMARY_INSTRUCTIONS = `Write one concise editorial monitoring summary from the user's original Watch request.
Preserve every material constraint, including brands, products, locations, dates, routes, price limits and qualifiers.
Do not add facts. Do not use a generic category description. Begin with "Monitoring" (or "Surveillance" for a French request).
Return one sentence only, sized for one line or at most two mobile lines.`;

const cleanSentence = (value) => String(value || '')
  .replace(/\s+/g, ' ')
  .replace(/\s+([,.;!?])/g, '$1')
  .trim()
  .replace(/[.!?]+$/g, '');

const stripRequestFraming = (request) => cleanSentence(request)
  .replace(/^(?:please\s+)?(?:tell|notify|alert)\s+me\s+(?:know\s+)?(?:when|if)\s+/i, '')
  .replace(/^(?:please\s+)?let\s+me\s+know\s+(?:when|if)\s+/i, '')
  .replace(/^keep\s+me\s+(?:updated|posted)\s+(?:about|on)\s+/i, '')
  .replace(/^(?:merci\s+de\s+)?(?:dites|dites-moi|prévenez|préviens|avertissez)-?moi\s+(?:quand|lorsque|si)\s+/i, '')
  .replace(/^(?:dites|prévenez|avertissez)-?moi\s+/i, '')
  .trim();

const normalizeEnglishThresholds = (value) => value
  .replace(/\b(?:below|less than|lower than)\b/gi, 'under')
  .replace(/\b(?:above|more than|higher than)\b/gi, 'over');

const lowerInitial = (value) => (
  /^[A-Z][a-z]/.test(value) ? `${value.charAt(0).toLocaleLowerCase()}${value.slice(1)}` : value
);

const looksFrench = (value) => (
  /\b(?:quand|lorsque|prévenez|avertissez|appartement|billet|vol|moins de|à|annonce)\b/i.test(value)
);

const createLocalEditorialSummary = (request) => {
  const original = cleanSentence(request);
  let intent = stripRequestFraming(original);
  if (!intent) return '';

  if (looksFrench(original)) {
    intent = intent
      .replace(/\b(?:apparaissent?|deviennent? disponibles?)\s+(dans|à|près de)\s+(.+)$/i, 'nouvelles annonces $1 $2')
      .replace(/\b(?:baisse|baissent|tombe|tombent)\s+(?:en dessous de|sous)\s+/i, 'sous ');
    return `Surveillance de ${lowerInitial(intent)}.`;
  }

  intent = normalizeEnglishThresholds(intent);

  const announcement = intent.match(/^(.+?)\s+(?:announces?|reveals?|confirms?)\s+(.+)$/i);
  if (announcement) {
    return `Monitoring ${announcement[1]} announcements for ${lowerInitial(announcement[2])}.`;
  }

  const property = intent.match(
    /^(apartments?|flats?|homes?|houses?|properties?)\s+(.+?)\s+(?:appear|become available|are listed)\s+((?:in|near)\s+.+)$/i,
  );
  if (property) {
    return `Monitoring new listings ${property[3]} ${property[2]}.`;
  }

  const opening = intent.match(/^(.+?)\s+(?:opens?|releases?|launches?)\s+(.+)$/i);
  if (opening) {
    return `Monitoring ${opening[1]} ${lowerInitial(opening[2])}.`;
  }

  intent = intent
    .replace(/\s+(?:drops?|falls?)\s+under\s+/i, ' under ')
    .replace(/\s+(?:rises?|climbs?)\s+over\s+/i, ' over ')
    .replace(/^new\s+/i, 'new ');

  return `Monitoring ${lowerInitial(intent)}.`;
};

const getGeneratedText = (result) => {
  if (typeof result === 'string') return cleanSentence(result);
  if (typeof result?.summary === 'string') return cleanSentence(result.summary);
  return '';
};

const getProtectedConstraints = (request) => {
  const value = String(request || '');
  const exactValues = [
    ...(value.match(/(?:€|£|\$)\s*[\d,.]+|[\d,.]+\s*(?:€|£|\$|EUR|GBP|USD)/giu) || []),
    ...(value.match(/\b(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|january|february|march|april|may|june|july|august|september|october|november|december|christmas|noël)\b/giu) || []),
    ...(value.match(/\b[A-ZÀ-ÖØ-Þ][\p{L}\p{N}'’-]*(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}\p{N}'’-]*)*/gu) || []),
  ];
  const qualifiers = value.match(
    /\b(?:direct|central|official|only|non-stop|nonstop|refurbished|used|new|flexible|same-day)\b/giu,
  ) || [];
  const ignored = /^(?:Tell|Let|Alert|Notify|Please)$/i;
  return [...exactValues, ...qualifiers]
    .map((constraint) => cleanSentence(constraint))
    .filter((constraint, index, values) => (
      constraint
      && !ignored.test(constraint)
      && values.findIndex((value) => value.toLocaleLowerCase() === constraint.toLocaleLowerCase()) === index
    ));
};

const preservesConstraints = (summary, request) => {
  const comparableSummary = summary.toLocaleLowerCase().replace(/\s+/g, ' ');
  return getProtectedConstraints(request).every(
    (constraint) => comparableSummary.includes(constraint.toLocaleLowerCase()),
  );
};

export const generateMonitoringSummary = async (request) => {
  const localSummary = createLocalEditorialSummary(request);
  const generator = window.watchAssistantGenerateMonitoringSummary;
  if (typeof generator !== 'function') return localSummary;

  try {
    const generated = getGeneratedText(await generator({
      request,
      instructions: SUMMARY_INSTRUCTIONS,
    }));
    return generated && preservesConstraints(generated, request)
      ? `${generated}.`
      : localSummary;
  } catch (error) {
    console.warn('Could not generate the Watch summary with AI; using the local summary.', error);
    return localSummary;
  }
};

export { createLocalEditorialSummary };

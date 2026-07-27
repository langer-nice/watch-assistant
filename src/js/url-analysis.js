import {
  extractMonitoringConcepts,
  normalizeAutomaticStoryFingerprint,
  normalizeMonitoringConcepts,
} from './monitoring-concepts.js';
import { cleanArticleContentForAnalysis } from './article-content.js';
import { createStoryProfile } from './story-profile.js';

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
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    const requestError = new Error('The URL analysis endpoint was unavailable.');
    requestError.code = 'server_endpoint_unavailable';
    throw requestError;
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'The URL could not be analysed.');
    error.code = result.fallbackReasonCode
      || ([404, 405].includes(response.status) ? 'server_endpoint_unavailable' : 'openai_request_failed');
    error.analysisDiagnosticId = result.analysisDiagnosticId || null;
    error.status = response.status;
    throw error;
  }
  return result;
};

const assertStructuredSuggestion = (suggestion) => {
  if (
    !suggestion
    || typeof suggestion.watchTitle !== 'string'
    || !suggestion.watchTitle.trim()
    || (!Array.isArray(suggestion.storyFingerprint) && !Array.isArray(suggestion.keywords))
    || !suggestion.storyProfile
    || typeof suggestion.storyProfile !== 'object'
  ) {
    const error = new Error('The analysis endpoint returned an invalid structured result.');
    error.code = 'invalid_structured_response';
    throw error;
  }
  return suggestion;
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

const splitArticleEntries = (articleText) => String(articleText || '')
  .split(/\n{2,}/)
  .map((entry) => entry.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TRAILING_PERSON_WORDS = new Set([
  'and', 'are', 'has', 'have', 'is', 'said', 'says', 'was', 'were', 'who', 'will',
]);
const LEADING_PERSON_ROLES = new Set([
  'by', 'chancellor', 'correspondent', 'dr', 'journalist', 'justice', 'mayor', 'minister',
  'mr', 'mrs', 'ms', 'president', 'professor', 'reporter', 'spokesman', 'spokesperson',
]);
const NON_PERSON_NAME_ENDINGS = new Set([
  'agency', 'airport', 'court', 'department', 'gate', 'guardian', 'images', 'media', 'network',
  'news', 'office', 'parade', 'party', 'platz', 'police', 'press', 'pride', 'state', 'studios',
  'times', 'website',
]);

const cleanPersonName = (value) => {
  const tokens = String(value || '').replace(/[,:;.!?]+$/g, '').trim().split(/\s+/);
  if (tokens.length > 3 && LEADING_PERSON_ROLES.has(tokens[1].toLocaleLowerCase())) tokens.splice(0, 2);
  while (tokens.length > 2 && LEADING_PERSON_ROLES.has(tokens[0].toLocaleLowerCase())) tokens.shift();
  while (tokens.length > 2 && TRAILING_PERSON_WORDS.has(tokens.at(-1).toLocaleLowerCase())) tokens.pop();
  return tokens.join(' ');
};

const getPersonRole = (context, name) => {
  const value = String(context || '');
  const nameIndex = value.toLocaleLowerCase().indexOf(String(name || '').toLocaleLowerCase());
  const before = value.slice(Math.max(0, nameIndex - 160), nameIndex).toLocaleLowerCase();
  const after = value.slice(nameIndex + String(name || '').length, nameIndex + String(name || '').length + 120)
    .toLocaleLowerCase();
  const sameSentence = `${before.split(/[.!?]/).at(-1)} ${after.split(/[.!?]/)[0]}`;
  const previousSentence = before.split(/[.!?]/).at(-2) || '';
  const journalist = /\b(?:journalist|reporter|correspondent)\b/.test(sameSentence);
  const witness = /\b(?:witness|witnessed|saw the|at the scene|aftermath)\b/.test(sameSentence)
    || (journalist
      && /\b(?:journalist|reporter|correspondent)\b/.test(previousSentence)
      && /\b(?:witness|witnessed|saw the|at the scene|aftermath)\b/.test(previousSentence));
  if (journalist && witness) return 'journalist and witness';
  if (witness) return 'witness';
  if (journalist) return 'journalist';
  if (/\bmayor\b[\s\S]{0,160}$/.test(before) || /^.{0,100}\bmayor\b/.test(after)) return 'mayor';
  if (/\b(?:victim|injured person|survivor)\b/.test(sameSentence)) return 'victim or survivor';
  if (/\b(?:investigator|detective)\b/.test(sameSentence)) return 'investigator';
  if (/\b(?:spokesman|spokeswoman|spokesperson)\b/.test(sameSentence)) return 'spokesperson';
  if (/\b(?:chancellor|minister|president|government official)\b/.test(sameSentence)) return 'government official';
  if (/\b(?:suspect|accused|wanted)\b/.test(sameSentence)) return 'suspect';
  if (/\bcommentator\b/.test(sameSentence)) return 'commentator';
  return '';
};

const rolePriority = (role) => {
  if (/victim|survivor/.test(role)) return 7;
  if (/witness/.test(role)) return 6;
  if (role === 'mayor') return 5;
  if (['investigator', 'spokesperson'].includes(role)) return 4;
  if (role === 'government official') return 3;
  if (role === 'journalist') return 2;
  if (role === 'commentator') return 1;
  return 0;
};

const getStoryPeople = (page) => {
  const entries = splitArticleEntries(page.articleText);
  const candidates = new Map();
  const metadataNames = new Set([page.siteName]
    .map((name) => String(name || '').trim().toLocaleLowerCase())
    .filter(Boolean));
  const personPattern = /\b\p{Lu}[\p{L}\p{M}'’-]+(?:\s+(?:(?:al|da|de|del|di|dos|du|la|le|van|von)\s+)?\p{Lu}[\p{L}\p{M}'’-]+){1,3}\b/gu;
  const sources = [
    { text: String(page.title || ''), kind: 'title', entryIndex: null },
    { text: String(page.description || ''), kind: 'description', entryIndex: null },
    ...entries.map((text, entryIndex) => ({ text, kind: 'entry', entryIndex })),
  ];

  sources.forEach(({ text, kind, entryIndex }) => {
    [...text.matchAll(personPattern)].forEach((match) => {
      const name = cleanPersonName(match[0]);
      const tokens = name.split(/\s+/);
      const key = name.toLocaleLowerCase();
      if (
        tokens.length < 2
        || metadataNames.has(key)
        || NON_PERSON_NAME_ENDINGS.has(tokens.at(-1).toLocaleLowerCase())
        || /^(?:The|This|That)\b/.test(name)
      ) return;
      const context = text.slice(Math.max(0, match.index - 150), match.index + match[0].length + 150);
      const role = getPersonRole(context, name);
      const subjectHit = new RegExp(
        `(?:suspect|accused|wanted|victim|subject)[^.!?]{0,100}${escapeRegExp(name)}|${escapeRegExp(name)}[^.!?]{0,80}(?:suspect|accused|wanted|victim|subject)`,
        'i',
      ).test(context);
      const eventHit = /\b(?:attack|incident|operation|investigation|case|arrest|killed|injured)\b/i.test(context);
      const candidate = candidates.get(key) || {
        name,
        titleHits: 0,
        descriptionHits: 0,
        occurrences: 0,
        entryIndexes: new Set(),
        subjectHits: 0,
        eventHits: 0,
        actionHits: 0,
        roles: new Map(),
        firstSeen: candidates.size,
      };
      candidate.occurrences += 1;
      if (kind === 'title') candidate.titleHits += 1;
      if (kind === 'description') candidate.descriptionHits += 1;
      if (entryIndex !== null) candidate.entryIndexes.add(entryIndex);
      if (subjectHit) candidate.subjectHits += 1;
      if (eventHit) candidate.eventHits += 1;
      if (new RegExp(`${escapeRegExp(name)}[^.!?]{0,40}\\b(?:are|became|becomes|founded|has|have|is|leads?|searches?|was|were)\\b`, 'i').test(context)) {
        candidate.actionHits += 1;
      }
      if (role) candidate.roles.set(role, (candidate.roles.get(role) || 0) + 1);
      candidates.set(key, candidate);
    });
  });

  const ranked = [...candidates.values()].map((candidate) => {
    const role = [...candidate.roles.entries()]
      .sort((first, second) => (
        rolePriority(second[0]) - rolePriority(first[0]) || second[1] - first[1]
      ))[0]?.[0] || '';
    const reactingPenalty = role && role !== 'suspect' ? 10 : 0;
    return {
      ...candidate,
      role,
      score: candidate.titleHits * 14
        + candidate.descriptionHits * 10
        + candidate.entryIndexes.size * 4
        + Math.min(candidate.occurrences, 6)
        + candidate.subjectHits * 8
        + Math.min(candidate.eventHits, 4)
        - reactingPenalty,
    };
  }).sort((first, second) => second.score - first.score || first.firstSeen - second.firstSeen);
  const primary = ranked.find((candidate) => (
    (!candidate.role || candidate.role === 'suspect')
    && (
      candidate.subjectHits > 0
      || (
        candidate.titleHits + candidate.descriptionHits >= 2
        && candidate.occurrences >= 2
        && candidate.actionHits > 0
      )
      || (
        candidate.actionHits > 0
        && (
          candidate.entryIndexes.size >= 2
          || candidate.occurrences >= 3
          || candidate.actionHits >= 2
        )
      )
    )
  )) || null;
  const secondary = ranked
    .filter((candidate) => candidate !== primary && candidate.role && candidate.role !== 'suspect')
    .sort((first, second) => (
      rolePriority(second.role) * 20 + second.score
      - (rolePriority(first.role) * 20 + first.score)
      || first.firstSeen - second.firstSeen
    ))
    .slice(0, 2);
  const retained = [primary, ...secondary].filter(Boolean);
  return {
    primary: primary?.name || '',
    primaryRole: primary?.subjectHits ? 'suspect' : primary?.role || '',
    secondary: secondary.map(({ name }) => name),
    roles: retained
      .map(({ name, role }) => ({ name, role: name === primary?.name && primary?.subjectHits ? 'suspect' : role }))
      .filter(({ role }) => role),
  };
};

let cachedCountryNames;
const getCountryNames = () => {
  if (cachedCountryNames) return cachedCountryNames;
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  cachedCountryNames = [];
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      const name = displayNames.of(code);
      if (name && name !== code && !/^Unknown Region/i.test(name)) cachedCountryNames.push(name);
    }
  }
  return [...new Set(cachedCountryNames)].sort((first, second) => second.length - first.length);
};

const getSupportedLocation = (page, slug) => {
  const source = [page.title, page.description, page.articleText, slug].filter(Boolean).join(' ');
  const precisePair = source.match(
    /\b(?:in|near|from|across)\s+([\p{Lu}][\p{L}'’-]+),\s*([\p{Lu}][\p{L}'’-]+)\b/u,
  );
  const countryNames = new Set(getCountryNames().map((name) => name.toLocaleLowerCase()));
  if (precisePair && countryNames.has(precisePair[2].toLocaleLowerCase())) {
    return `${precisePair[1]}, ${precisePair[2]}`;
  }
  const explicitInPair = source.match(
    /\b(?:in|near|from)\s+([\p{Lu}][\p{L}'’-]+)\s+in\s+([\p{Lu}][\p{L}'’-]+)\b/u,
  );
  if (explicitInPair && countryNames.has(explicitInPair[2].toLocaleLowerCase())) {
    return `${explicitInPair[1]}, ${explicitInPair[2]}`;
  }
  const locations = [...source.matchAll(
    /\b(?:in|near|from|across|of)\s+(\p{Lu}[\p{L}'’-]*(?:\s+\p{Lu}[\p{L}'’-]*){0,2})/gu,
  )].map((match) => match[1].replace(/\s+(?:The|A|An)$/i, '').trim());
  const location = countValues(locations.filter(Boolean))[0]?.[0] || '';
  return location;
};

const toConceptLabel = (value) => {
  const label = String(value || '')
    .replace(/[–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/[.,;:!?]+$/g, '')
    .trim()
    .toLocaleLowerCase();
  return label ? `${label.charAt(0).toLocaleUpperCase()}${label.slice(1)}` : '';
};

const getCentralTopic = (page) => {
  const title = trimTerminalPunctuation(String(page.title || ''));
  const articleText = String(page.articleText || '');
  const titleGrowth = title.match(
    /^(?:why|how)?\s*(?:the\s+)?([\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){1,4})\s+(?:is|are|has been|have been)\s+(?:booming|growing|increasing|surging)\b/iu,
  )?.[1];
  const popularityTopic = `${title}. ${articleText}`.match(
    /\b(?:popularity|growth|rise|boom)\s+(?:in|of)\s+([\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){1,4})(?=\s+(?:is|has|have|brings|raises|comes|amid|but|and)\b|[,:;.!?–—]|$)/iu,
  )?.[1];
  return toConceptLabel(titleGrowth || popularityTopic);
};

const getDistinctiveRisks = (articleText) => {
  const candidates = [];
  String(articleText || '').split(/(?<=[.!?])\s+/).forEach((sentence) => {
    if (!/\b(?:contaminat\w*|danger|disease|hazard|illness|risk)\b/i.test(sentence)) return;
    const list = sentence.match(
      /\b(?:include(?:s|d)?|including|such as|expose(?:s|d)?[^.!?;]{0,60}\bto)\s+([^.!?;]+)/i,
    )?.[1];
    if (!list) return;
    list
      .replace(/\b(?:when|while|which|that)\b[\s\S]*$/i, '')
      .split(/,|\s+(?:and|or)\s+/i)
      .map(toConceptLabel)
      .filter((label) => label && label.split(/\s+/).length <= 4)
      .forEach((label) => candidates.push(label));
  });
  return normalizeMonitoringConcepts(candidates, 4);
};

const formatNaturalList = (values) => {
  const lowerValues = values.map((value) => value.charAt(0).toLocaleLowerCase() + value.slice(1));
  if (lowerValues.length < 2) return lowerValues[0] || '';
  if (lowerValues.length === 2) return `${lowerValues[0]} and ${lowerValues[1]}`;
  return `${lowerValues.slice(0, -1).join(', ')}, and ${lowerValues.at(-1)}`;
};

const createTopicalSummary = ({ topic, risks, articleText }) => {
  if (!topic || !risks.length) return '';
  const growth = /\b(?:booming|growing|growth|increasing|popularity|rise|surging)\b/i.test(articleText);
  const health = /\b(?:health|disease|illness|infection|medical)\b/i.test(articleText);
  const contaminatedWater = /\b(?:contaminated|polluted)\s+water\b/i.test(articleText);
  return `${topic}${growth ? ' is growing in popularity' : ' is the article’s central topic'}, while the article reports${health ? ' health' : ''} risks${contaminatedWater ? ' from contaminated water' : ''}, including ${formatNaturalList(risks)}.`;
};

const getCoherentVehicleAttackEvent = (page) => {
  const source = [page.title, page.description, page.articleText].filter(Boolean).join(' ');
  if (!/\b(?:van|vehicle|car)\b/i.test(source) || !/\b(?:ramm\w*|driven into|drove into)\b/i.test(source)) {
    return '';
  }
  const namedEvent = String(page.title || '').match(
    /\b([\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’-]+){0,2}\s+(?:Pride|Festival|Parade|Rally))\b/u,
  )?.[1];
  const metadataSource = [page.title, page.description].filter(Boolean).join(' ');
  const vehicle = /\bvan\b/i.test(metadataSource)
    ? 'van'
    : /\bcar\b/i.test(metadataSource) ? 'car' : 'vehicle';
  return namedEvent ? `${namedEvent} ${vehicle} attack` : `${vehicle.charAt(0).toUpperCase()}${vehicle.slice(1)} crowd attack`;
};

const getRelevantOrganization = (page, primaryPerson) => {
  const publicationNames = new Set([page.author, page.siteName]
    .map((value) => String(value || '').trim().toLocaleLowerCase())
    .filter(Boolean));
  const publicationTokens = new Set([...publicationNames]
    .flatMap((name) => name.split(/\s+/))
    .map((name) => name.toLocaleUpperCase()));
  const entries = splitArticleEntries(page.articleText);
  const candidates = [];
  for (const entry of entries) {
    if (primaryPerson && !new RegExp(`\\b${escapeRegExp(primaryPerson)}\\b`, 'i').test(entry)) continue;
    const organization = entry.match(
      /\b(?:join(?:ed|ing)?|member of|affiliated with|linked to)\s+(?:the\s+)?(?:armed struggle of\s+)?([A-Z]{2,8}|\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){1,3})(?:\s+group)?\b/u,
    )?.[1] || entry.match(
      /\b(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){1,3})\s+(?:propaganda|group|organization)\b/u,
    )?.[1];
    if (!organization || publicationNames.has(organization.toLocaleLowerCase())) continue;
    const expandedOrganization = organization.length <= 8 && /^[A-Z]+$/.test(organization)
      ? entries.flatMap((item) => [...item.matchAll(
        /\b(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){1,2})\s+(?:group|organization|propaganda)\b/gu,
      )].map((match) => match[1])).find((name) => name.length > organization.length)
      : organization;
    const name = expandedOrganization || organization;
    const alleged = /\b(?:alleged|allegedly|suspected|intention|desire)\b/i.test(entry);
    const attributed = /\bprosecutors?(?:'s)?(?: office)?\b/i.test(entry);
    const aliases = organization !== name
      ? [organization]
      : [...entry.matchAll(/\b[A-Z]{2,6}\b/g)]
        .map((match) => match[0])
        .filter((alias) => (
          !publicationNames.has(alias.toLocaleLowerCase())
          && !publicationTokens.has(alias)
          && alias !== name
        ));
    candidates.push({
      name,
      aliases: [...new Set(aliases)].slice(0, 2),
      fact: alleged
        ? `${attributed ? 'Prosecutors alleged' : 'Alleged'} ${primaryPerson} sought to join ${name}`
        : '',
      score: (alleged ? 4 : 0) + (attributed ? 2 : 0) + (/\bjoin(?:ed|ing)?\b/i.test(entry) ? 2 : 0),
    });
  }
  return candidates.sort((first, second) => second.score - first.score)[0] || null;
};

const getAttributedUncertainty = (page) => {
  const source = [page.description, page.articleText].filter(Boolean).join(' ');
  const match = source.match(
    /\b(likely|possible|suspected)\b\s+(?:an?\s+)?["“]?(Islamist\s+(?:terrorist?|terror)\s+attack)\b/i,
  );
  if (!match) return null;
  const qualifier = match[1].toLocaleLowerCase();
  const subject = match[2].replace(/terrorist attack/i, 'terror attack');
  const hasOfficialAttribution = /\b(?:officials?|police|minister|prosecutor)\b[^.]{0,180}\b(?:described|say|said|says|stated|assessment)\b/i.test(source)
    || /\b(?:described|stated)\b[^.]{0,120}\b(?:officials?|police|minister|prosecutor)\b/i.test(source);
  return {
    fact: `${hasOfficialAttribution ? 'Official assessment' : 'Reported assessment'}: ${qualifier} ${subject}`,
    clause: `${hasOfficialAttribution ? 'officials described' : 'reports described'} the attack as a ${qualifier} ${subject}`,
    concept: `${qualifier.charAt(0).toLocaleUpperCase()}${qualifier.slice(1)} Islamist attack`,
  };
};

const getCurrentState = (page, person) => {
  const title = trimTerminalPunctuation(String(page.title || ''))
    .replace(/\s*(?:[-–—|:]\s*)?(?:live(?:\s+updates?)?|updates?|latest)\s*$/i, '')
    .trim();
  const description = String(page.description || '').replace(/\s+/g, ' ').trim();
  const currentSource = `${title}. ${description}`;
  const states = [
    { pattern: /\bshot and killed\b(?:[^.]{0,60}\bduring (?:a )?police operation\b)?/i, predicate: 'was shot and killed during a police operation' },
    { pattern: /\b(?:arrested|apprehended|taken into custody)\b/i, predicate: 'was taken into custody' },
    { pattern: /\bfound safe\b/i, predicate: 'was found safe' },
    { pattern: /\breleased\b/i, predicate: 'was released' },
  ];
  const state = states.find(({ pattern }) => pattern.test(currentSource));
  if (state) {
    const attribution = /\bpolice\s+(?:say|said|report|reported|confirm|confirmed)\b/i.test(description)
      ? 'Police say'
      : /\bofficials?\s+(?:say|said|report|reported|confirm|confirmed)\b/i.test(description)
        ? 'Officials say'
        : /\breportedly\b/i.test(currentSource) ? 'Reports say' : '';
    return {
      attribution,
      predicate: state.predicate === 'was shot and killed during a police operation'
        && !/\bpolice operation\b/i.test(currentSource)
        ? 'was shot and killed'
        : state.predicate,
      fact: `${attribution || 'Current report'}: ${person} ${
        state.predicate === 'was shot and killed during a police operation'
          && !/\bpolice operation\b/i.test(currentSource)
          ? 'was shot and killed'
          : state.predicate
      }`,
    };
  }
  if (/\b(?:manhunt|searching for|search for|wanted)\b/i.test(currentSource)) {
    return { attribution: 'Police', predicate: 'are searching', fact: '' };
  }
  return null;
};

const createFallbackStorySummary = ({ person, primaryRole, event, location, uncertainty, currentState }) => {
  if (person && event) {
    const eventContext = `the ${event}${location ? ` in ${location}` : ''}`;
    let base;
    if (currentState?.predicate === 'are searching') {
      base = `Police are searching for ${person} in connection with ${eventContext}`;
    } else if (currentState) {
      const subjectRole = primaryRole === 'suspect' ? `, identified as the suspect in ${eventContext},` : '';
      base = `${currentState.attribution ? `${currentState.attribution} ` : ''}${person}${subjectRole} ${currentState.predicate}`;
    } else {
      base = `${person} is the central subject of reporting about ${eventContext}`;
    }
    return `${base}${uncertainty ? `; ${uncertainty.clause}` : ''}.`;
  }
  if (event) {
    return `This Watch follows reporting about the ${event}${location ? ` in ${location}` : ''}${uncertainty ? `; ${uncertainty.clause}` : ''}.`;
  }
  return '';
};

export const createSourceDerivedFallback = (page, sourceUrl = '', {
  fallbackReasonCode = 'openai_request_failed',
  analysisDiagnosticId = null,
} = {}) => {
  const analysisPage = {
    ...page,
    articleText: cleanArticleContentForAnalysis(page.articleText),
  };
  const title = String(analysisPage.title || '').trim();
  const subject = trimTerminalPunctuation(title);
  const summary = globalThis.document?.documentElement?.lang === 'fr'
    ? `Nouveaux développements, réactions et informations complémentaires concernant « ${subject} ».`
    : `New developments, reactions and follow-up reporting related to “${subject}”.`;
  const slug = (() => {
    try {
      return getUrlSlug(new URL(sourceUrl));
    } catch {
      return '';
    }
  })();
  const sourcePublication = String(analysisPage.siteName || '').trim() || (() => {
    try {
      return getPublisher(new URL(sourceUrl));
    } catch {
      return '';
    }
  })();
  const source = [title, analysisPage.description, analysisPage.articleText, slug].filter(Boolean).join(' ');
  const titleConcepts = getTitleDerivedKeywords(title);
  const missingHikers = titleConcepts.find((concept) => /missing hikers/i.test(concept));
  const remoteMountains = titleConcepts.find((concept) => /remote mountains/i.test(concept));
  const people = getStoryPeople(analysisPage);
  const supportedPerson = people.primary;
  const supportedLocation = getSupportedLocation(analysisPage, slug);
  const supportsSearchOperation = /(?:search(?: and rescue)?|hunt)\b[\s\S]{0,80}\bmissing hikers?/i.test(source)
    || /missing hikers?[\s\S]{0,80}\bsearch(?: and rescue)?/i.test(source);
  const coherentVehicleAttackEvent = getCoherentVehicleAttackEvent(analysisPage);
  const uncertainty = getAttributedUncertainty(analysisPage);
  const organizationConnection = getRelevantOrganization(analysisPage, supportedPerson);
  const centralTopic = getCentralTopic(analysisPage);
  const distinctiveRisks = getDistinctiveRisks(analysisPage.articleText);
  const primaryEvent = coherentVehicleAttackEvent
    || missingHikers
    || (supportsSearchOperation ? 'Search operation' : '')
    || centralTopic;
  const currentState = supportedPerson ? getCurrentState(analysisPage, supportedPerson) : null;
  const storySummary = createTopicalSummary({
    topic: centralTopic,
    risks: distinctiveRisks,
    articleText: source,
  }) || createFallbackStorySummary({
    person: supportedPerson,
    primaryRole: people.primaryRole,
    event: primaryEvent,
    location: supportedLocation,
    uncertainty,
    currentState,
  });
  const distinctiveFacts = [
    currentState?.fact,
    uncertainty?.fact,
    organizationConnection?.fact,
    ...distinctiveRisks,
  ].filter(Boolean);
  const uncertaintyPhrases = [
    uncertainty?.fact,
    organizationConnection?.fact,
  ].filter(Boolean);
  const storyFingerprint = normalizeAutomaticStoryFingerprint([
    supportedPerson && { label: supportedPerson, type: 'person' },
    supportedLocation && { label: supportedLocation, type: 'location' },
    organizationConnection?.name && { label: organizationConnection.name, type: 'organization' },
    coherentVehicleAttackEvent && { label: coherentVehicleAttackEvent, type: 'event' },
    centralTopic && { label: centralTopic, type: 'event' },
    missingHikers && { label: missingHikers, type: 'event' },
    supportsSearchOperation && { label: 'Search operation', type: 'event' },
    uncertainty?.concept && { label: uncertainty.concept, type: 'supporting' },
    remoteMountains && { label: remoteMountains, type: 'supporting' },
    ...distinctiveRisks.map((label) => ({ label, type: 'supporting' })),
    ...(primaryEvent
      ? []
      : titleConcepts.map((label) => ({ label, type: 'supporting' }))),
  ].filter(Boolean), 5);
  return {
    watchTitle: title,
    watchingFor: storySummary || summary,
    description: storySummary || summary,
    storyFingerprint,
    keywords: storyFingerprint.map(({ label }) => label),
    storyProfile: createStoryProfile({
      storyFingerprint,
      profile: {
        storySummary,
        primaryPeople: supportedPerson ? [supportedPerson] : [],
        otherPeople: people.secondary,
        peopleRoles: people.roles,
        locations: supportedLocation ? [supportedLocation] : [],
        organizations: organizationConnection?.name ? [organizationConnection.name] : [],
        eventTypes: primaryEvent ? [primaryEvent] : [],
        distinctiveFacts,
        aliases: organizationConnection?.aliases || [],
        uncertaintyPhrases,
      },
      articleText: analysisPage.articleText,
      sourcePublication,
      sourceTitle: analysisPage.title,
      sourceUrl,
      publishedAt: analysisPage.publishedAt,
    }),
    analysisProvider: 'deterministic',
    analysisStatus: 'fallback',
    analysisModel: null,
    fallbackReasonCode,
    analyzedAt: new Date().toISOString(),
    analysisDiagnosticId,
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
  const analysisPage = {
    ...page,
    articleText: cleanArticleContentForAnalysis(page.articleText),
  };
  const conceptSourceFields = Array.isArray(page.conceptSourceFields)
    ? page.conceptSourceFields
    : ['title', 'description', 'articleText', 'author'].filter((field) => page[field]);
  if (import.meta.env?.DEV) {
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
    suggestion = assertStructuredSuggestion(await requestJson('/api/watch-suggestion', {
      title: analysisPage.title,
      description: analysisPage.description,
      articleText: analysisPage.articleText,
      author: analysisPage.author,
      slug: getUrlSlug(url),
    }, signal));
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.warn('AI Watch generation failed; using the real page title fallback.', error);
    suggestion = createSourceDerivedFallback(analysisPage, url.href, {
      fallbackReasonCode: error.code || 'openai_request_failed',
      analysisDiagnosticId: error.analysisDiagnosticId || null,
    });
  }
  let keywords = normalizeMonitoringConcepts(suggestion.keywords, 8);
  let storyFingerprint = normalizeAutomaticStoryFingerprint(
    suggestion.storyFingerprint
      || keywords.map((label) => ({ label, type: 'supporting' })),
    5,
  );
  let storyProfile = createStoryProfile({
    storyFingerprint,
    profile: suggestion.storyProfile,
    articleText: analysisPage.articleText,
    sourcePublication: analysisPage.siteName || source,
    sourceTitle: analysisPage.title,
    sourceUrl: analysisPage.sourceUrl || url.href,
    publishedAt: analysisPage.publishedAt,
  });
  let profileKeywords = storyProfile.concepts.map(({ label }) => label);

  if (suggestion.analysisProvider !== 'deterministic' && profileKeywords.length === 0) {
    suggestion = createSourceDerivedFallback(analysisPage, url.href, {
      fallbackReasonCode: 'normalization_rejected',
      analysisDiagnosticId: suggestion.analysisDiagnosticId || null,
    });
    keywords = normalizeMonitoringConcepts(suggestion.keywords, 8);
    storyFingerprint = normalizeAutomaticStoryFingerprint(suggestion.storyFingerprint, 5);
    storyProfile = createStoryProfile({
      storyFingerprint,
      profile: suggestion.storyProfile,
      articleText: analysisPage.articleText,
      sourcePublication: analysisPage.siteName || source,
      sourceTitle: analysisPage.title,
      sourceUrl: analysisPage.sourceUrl || url.href,
      publishedAt: analysisPage.publishedAt,
    });
    profileKeywords = storyProfile.concepts.map(({ label }) => label);
  }

  return {
    status: 'success',
    title: suggestion.watchTitle,
    summary: storyProfile.storySummary || suggestion.watchingFor || suggestion.description,
    description: suggestion.description,
    keywords: profileKeywords.length
      ? profileKeywords
      : keywords.length ? keywords : getTitleDerivedKeywords(page.title),
    storyFingerprint: storyProfile.concepts,
    storyProfile,
    source,
    sourceTitle: page.title,
    sourceUrl: page.sourceUrl || url.href,
    sourcePublishedAt: storyProfile.sourceArticle.publishedAt,
    monitoringSource: page.monitoringSource || null,
    conceptSourceFields,
    analysisProvider: suggestion.analysisProvider || 'openai',
    analysisStatus: suggestion.analysisStatus || 'success',
    analysisModel: suggestion.analysisModel || null,
    fallbackReasonCode: suggestion.fallbackReasonCode || null,
    analyzedAt: suggestion.analyzedAt || new Date().toISOString(),
    analysisDiagnosticId: suggestion.analysisDiagnosticId || null,
  };
};

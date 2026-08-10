import { getWatchUpdates } from './watch-updates.js';

const DEVELOPMENT_STAGES = [
  ['sentence', /\b(?:sentenc(?:e|ed|es|ing)|jailed|imprisoned)\b/iu],
  ['verdict', /\b(?:acquit(?:tal|ted)?|convict(?:ed|ion)?|verdict)\b/iu],
  ['trial', /\btrial\b/iu],
  ['plea', /\b(?:not[- ]guilty|guilty plea|plead(?:ed|s|ing)?|plea)\b/iu],
  ['hearing', /\b(?:court appearance|appear(?:ed|s|ing)? (?:at|before|in) court|hearing)\b/iu],
  ['bail', /\bbail(?:ed)?\b/iu],
  ['arrest', /\b(?:arrest(?:ed|s)?|detain(?:ed|s)?)\b/iu],
  ['charge', /\b(?:charg(?:e|ed|es|ing)|indict(?:ed|ment|s)?)\b/iu],
  ['investigation', /\b(?:inquiry|investigat(?:e|ed|es|ing|ion))\b/iu],
  ['resignation', /\b(?:resign(?:ed|s|ing|ation))\b/iu],
  ['appointment', /\b(?:appoint(?:ed|ment|s))\b/iu],
  ['agreement', /\b(?:agreement|deal|settlement)\b/iu],
  ['incident', /\b(?:attack|incident)\b/iu],
];

const TOKEN_ALIASES = new Map([
  ['charged', 'charge'], ['charges', 'charge'], ['charging', 'charge'],
  ['indicted', 'charge'], ['indictment', 'charge'],
  ['assaulted', 'assault'], ['assaults', 'assault'],
  ['incidents', 'incident'], ['nightclubs', 'nightclub'],
]);

const DEVELOPMENT_STOP_WORDS = new Set([
  'a', 'after', 'an', 'and', 'at', 'before', 'different', 'following', 'for', 'from',
  'in', 'into', 'latest', 'new', 'news', 'of', 'on', 'over', 'report', 'reporting',
  'same', 'the', 'to', 'update', 'with', 'footballer', 'player', 'reportedly',
]);

const normalizeText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/gu, '')
  .toLocaleLowerCase();

const getDevelopmentText = (update) => [update?.sourceTitle, update?.summary]
  .filter(Boolean).join(' ');

const getDevelopmentStage = (update) => {
  const text = getDevelopmentText(update);
  return DEVELOPMENT_STAGES.find(([, pattern]) => pattern.test(text))?.[0] || null;
};

const getDevelopmentTokens = (update) => new Set(
  (normalizeText(getDevelopmentText(update)).match(/[\p{L}\p{N}]+/gu) || [])
    .map((token) => TOKEN_ALIASES.get(token) || token)
    .filter((token) => token.length >= 3 && !DEVELOPMENT_STOP_WORDS.has(token)),
);

const developmentSimilarity = (first, second) => {
  const firstTokens = getDevelopmentTokens(first);
  const secondTokens = getDevelopmentTokens(second);
  if (!firstTokens.size || !secondTokens.size) return 0;
  const shared = [...firstTokens].filter((token) => secondTokens.has(token)).length;
  return (2 * shared) / (firstTokens.size + secondTokens.size);
};

const describesSameDevelopment = (first, second) => {
  const firstStage = getDevelopmentStage(first);
  const secondStage = getDevelopmentStage(second);
  return Boolean(
    firstStage
    && firstStage === secondStage
    && developmentSimilarity(first, second) >= 0.62
  );
};

// Updates remain an article/source log. This projection groups only sufficiently similar articles
// that describe the same explicit development stage for Current Situation and How We Got Here.
export const getWatchDevelopments = (watch) => {
  const groups = [];
  getWatchUpdates(watch).forEach((update) => {
    const existing = groups.find((group) => describesSameDevelopment(group.update, update));
    if (existing) {
      existing.updates.push(update);
      return;
    }
    groups.push({ update, updates: [update], timestamp: update.timestamp });
  });
  return groups;
};

export const getLatestDevelopmentUpdate = (watch) => (
  getWatchDevelopments(watch).at(-1)?.update || null
);

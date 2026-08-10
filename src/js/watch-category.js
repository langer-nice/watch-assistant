import { parseMediaMentionRequest } from './media-mention-request.js';

export const SUPPORTED_WATCH_CATEGORIES = Object.freeze([
  'general', 'travel', 'news', 'property', 'price', 'events', 'entertainment', 'finance',
]);

const CATEGORY_ALIASES = new Map([
  ['general', 'general'], ['général', 'general'], ['generale', 'general'], ['générale', 'general'],
  ['other', 'general'], ['autre', 'general'],
  ['travel', 'travel'], ['voyage', 'travel'], ['voyages', 'travel'],
  ['news', 'news'], ['actualité', 'news'], ['actualités', 'news'], ['actualite', 'news'], ['actualites', 'news'],
  ['property', 'property'], ['immobilier', 'property'], ['immobilière', 'property'], ['immobiliere', 'property'],
  ['price', 'price'], ['prix', 'price'],
  ['events', 'events'], ['event', 'events'], ['événement', 'events'], ['événements', 'events'],
  ['evenement', 'events'], ['evenements', 'events'],
  ['entertainment', 'entertainment'], ['divertissement', 'entertainment'],
  ['finance', 'finance'], ['financial', 'finance'], ['finances', 'finance'],
]);

const foldText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase();

export const normalizeWatchCategory = (value, fallback = 'general') => {
  const label = String(value || '').trim().toLocaleLowerCase();
  return CATEGORY_ALIASES.get(label)
    || CATEGORY_ALIASES.get(foldText(label))
    || (SUPPORTED_WATCH_CATEGORIES.includes(fallback) ? fallback : 'general');
};

const hasLegalIntent = (text) => {
  const explicitProceeding = /\b(?:lawsuit|legal|court|tribunal|ruling|trial|appeal|litigation|regulatory proceeding|allegations?|claimants?|plaintiffs?|defendants?|proces|juridique|justice|jugement|decision judiciaire|appel|procedure reglementaire|allegations?)\b/.test(text);
  const legalMonetaryContext = /\b(?:damages?|compensation|settlement|fine|dommages(?:-interets)?|indemnisation|amende)\b/.test(text)
    && /\b(?:alleged|allegations?|awarded?|ordered|liable|liability|lawsuit|court|claimants?|plaintiffs?|proces|allegations?|condamne|ordonnee?|accorde|infligee?|prononcee?|responsabilite|tribunal)\b/.test(text);
  return explicitProceeding || legalMonetaryContext;
};

const hasPriceIntent = (text) => {
  const priceSubject = /\b(?:price|prices|prix|fare|fares|airfare|airfares|tarif|tarifs|cost|costs|cout|couts|coute|coutent|deal|discount|remise|promo|cheapest|moins cher|market price|cours de bourse|shares?|actions?)\b/.test(text);
  const priceChange = /\b(?:drop|drops|fall|falls|rise|rises|increase|increases|decrease|decreases|change|changes|below|under|over|above|less than|more than|threshold|baisse|baisser|chute|tombe|augmenter?|augmente|augmentent|diminue|diminuent|hausse|change|moins de|plus de|inferieur|superieur)\b/.test(text);
  const monetaryThreshold = /(?:[$€£]\s*\d|\d[\d\s.,]*\s*(?:€|£|usd|eur|gbp|dollars?|euros?|pounds?))/.test(text)
    && /\b(?:below|under|over|above|less than|more than|drops?|falls?|rises?|moins de|plus de|inferieur|superieur|baisse|tombe|augmente)\b/.test(text);
  const stockAvailability = /\b(?:back in stock|in stock|out of stock|stock availability|de nouveau en stock|en stock|rupture de stock)\b/.test(text);
  const explicitFare = /\b(?:fare|fares|airfare|airfares|tarif|tarifs)\b/.test(text);
  const namedCommercialPrice = /\b(?:products?|items?|flights?|hotels?|rooms?|accommodations?|tickets?|produits?|articles?|vols?|hotels?|chambres?|hebergements?|billets?)\b/.test(text)
    && /\b(?:price|prices|prix|cost|costs|cout|couts|coute|coutent)\b/.test(text);
  return (priceSubject && priceChange) || monetaryThreshold || stockAvailability
    || explicitFare || namedCommercialPrice
    || /\b(?:deal|discount|remise|promo|cheapest|moins cher|on sale|for sale|soldes)\b/.test(text);
};

const hasExplicitCommercialPriceSubject = (text) => /\b(?:products?|items?|flights?|fares?|hotels?|rooms?|accommodations?|tickets?|shares?|stocks?|produits?|vols?|tarifs?|hotels?|chambres?|hebergements?|billets?|actions?|cours de bourse)\b/.test(text);
const hasExplicitCommercialPriceChange = (text) => hasExplicitCommercialPriceSubject(text) && (
  /\b(?:drop|drops|fall|falls|rise|rises|increase|increases|decrease|decreases|change|changes|below|under|over|above|less than|more than|threshold|baisse|baisser|chute|tombe|augmenter?|augmente|augmentent|diminue|diminuent|hausse|moins de|plus de|inferieur|superieur|back in stock|in stock|out of stock|en stock|rupture de stock)\b/.test(text)
);

export const inferWatchCategory = (value) => {
  const text = foldText(value);
  if (parseMediaMentionRequest(value).recognized) return 'news';
  const legalIntent = hasLegalIntent(text);
  const priceIntent = hasPriceIntent(text);
  if (priceIntent && (!legalIntent || hasExplicitCommercialPriceChange(text))) return 'price';
  if (legalIntent) return 'news';
  if (/\b(?:apartment|appartement|property|immobilier|listing|annonce immobiliere)\b/.test(text)) return 'property';
  if (/\b(?:netflix|series|season|saison|film|trailer|bande-annonce)\b/.test(text)) return 'entertainment';
  if (/\b(?:flight|vol|easyjet|travel|voyage|hotel|holiday|vacances|booking|reservation)\b/.test(text)) return 'travel';
  if (/\b(?:event|evenement|registration|inscription|deadline|echeance|ticket sales|billetterie|concert|tickets? available|billets? disponibles?)\b/.test(text)) return 'events';
  if (/\b(?:news|actualite|story|sujet|article|investigation|enquete|bbc|cnn|report|rapport)\b/.test(text)) return 'news';
  if (/\b(?:finance|financial|stock market|bourse|earnings|resultats financiers|shares?|actions?)\b/.test(text)) return 'finance';
  return 'general';
};

export const getCategoryPendingSituationKey = (category) => ({
  price: 'watchData.pendingSituations.price',
  travel: 'watchData.pendingSituations.travel',
  news: 'watchData.pendingSituations.news',
  events: 'watchData.pendingSituations.event',
}[normalizeWatchCategory(category)] || 'watchData.pendingSituations.general');

export const getWatchPendingSituationKey = ({ category, inputType, isStory } = {}) => (
  inputType === 'url' && isStory === true
    ? 'watchData.pendingSituations.news'
    : getCategoryPendingSituationKey(category)
);

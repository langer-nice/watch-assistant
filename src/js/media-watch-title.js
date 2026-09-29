import { parseMediaMentionRequest } from './media-mention-request.js';

const formatTitle = (query, language) => language === 'fr'
  ? `${query} dans les médias` : `${query} media mentions`;

// Translate only titles generated from a recognized request. Never rewrite a
// custom title, the request, or the persisted monitoring definition.
export const localizedGeneratedMediaTitle = (watch, language) => {
  if (watch?.inputType !== 'text' || watch.titleKey || typeof watch.title !== 'string') return null;
  const parsed = parseMediaMentionRequest(watch.request);
  if (!parsed.recognized || watch.title !== formatTitle(parsed.query, parsed.language)) return null;
  return formatTitle(parsed.query, language);
};

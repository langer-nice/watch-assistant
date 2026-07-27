const CREDIT_ONLY_PATTERN = /^(?:(?:image|photo|photograph|picture)(?:\s+(?:source|credit))?|credit|copyright)\s*[:,]\s*.+$/iu;
const BYLINE_ONLY_PATTERN = /^by\s+[\p{Lu}][\p{L}\p{M}'’-]+(?:\s+[\p{Lu}][\p{L}\p{M}'’-]+){1,3}(?:,\s*[^.!?]+)?$/iu;
const MEDIA_PROVIDER_ONLY_PATTERN = /^(?:[\p{Lu}][\p{L}\p{M}'’&-]+\s+){0,3}(?:images|media|news agency|photo agency|press|pictures|visuals)$/iu;
const KNOWN_PROVIDER_ONLY_PATTERN = /^(?:AFP|AP|Associated Press|Getty Images|Reuters)$/iu;
const INTERFACE_ONLY_PATTERN = /^(?:related (?:stories|content|topics)|read more|more on this story|share(?: this article)?|sign up(?: for .+)?|subscribe(?: to .+)?|follow us|newsletter|advertisement|skip to content|most read)(?:\s*[:,–—-]\s*.+)?$/iu;

const cleanEntry = (entry) => {
  let value = String(entry || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';

  value = value
    .replace(/\bimage source\s*[:,]\s*.*?(?=\bimage caption\s*[:,]|$)/giu, ' ')
    .replace(/\bimage caption\s*[:,]\s*/giu, '')
    .replace(/(?:^|\s)(?:photo(?:graph)?|picture)\s+(?:by|credit\s*[:,])\s*[\p{Lu}][\p{L}\p{M}'’-]+(?:\s+[\p{Lu}][\p{L}\p{M}'’-]+){1,3}(?=$|[.;])/giu, ' ')
    .replace(/(?:^|\s)(?:©|copyright\s+)[^.!?]{1,100}(?=$|[.;])/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    !value
    || CREDIT_ONLY_PATTERN.test(value)
    || BYLINE_ONLY_PATTERN.test(value)
    || MEDIA_PROVIDER_ONLY_PATTERN.test(value)
    || KNOWN_PROVIDER_ONLY_PATTERN.test(value)
    || INTERFACE_ONLY_PATTERN.test(value)
  ) {
    return '';
  }
  return value;
};

export const cleanArticleContentForAnalysis = (articleText) => String(articleText || '')
  .split(/\n{2,}/)
  .map(cleanEntry)
  .filter(Boolean)
  .join('\n\n');

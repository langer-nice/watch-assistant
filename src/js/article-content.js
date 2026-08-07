const CREDIT_ONLY_PATTERN = /^(?:(?:image|photo|photograph|picture)(?:\s+(?:source|credit))?|credit|copyright)\s*[:,]\s*.+$/iu;
const BYLINE_ONLY_PATTERN = /^by\s+[\p{Lu}][\p{L}\p{M}'’-]+(?:\s+[\p{Lu}][\p{L}\p{M}'’-]+){1,3}(?:,\s*[^.!?]+)?$/iu;
const MEDIA_PROVIDER_ONLY_PATTERN = /^(?:[\p{Lu}][\p{L}\p{M}'’&-]+\s+){0,3}(?:images|media|news agency|photo agency|press|pictures|visuals)$/iu;
const KNOWN_PROVIDER_ONLY_PATTERN = /^(?:AFP|AP|Associated Press|Getty Images|Reuters)$/iu;
const INTERFACE_ONLY_PATTERN = /^(?:related (?:stories|content|topics)|read more|more on this story|share(?: this article)?|sign up(?: for .+)?|subscribe(?: to .+)?|follow us|newsletter|advertisement|skip to content|most read)(?:\s*[:,–—-]\s*.+)?$/iu;
const ACCESS_INTERFACE_PATTERN = /^(?:(?:already (?:a )?subscriber|member|registered)\??|access all articles|become a member|continue reading|create (?:an )?account|full access|join (?:now|us)|log ?in|sign ?in|subscribe(?: now| to continue)?|subscription required|support (?:our )?journalism|unlimited access|unlock (?:this )?(?:article|story)|why subscribe\??|abonnez-vous|acc[ée]dez [àa] tous (?:les|nos) articles|cr[ée]ez (?:un )?compte|d[ée]j[àa] abonn[ée]\??|devenez membre|je (?:me connecte|m['’]abonne)|lire la suite|pourquoi s['’]abonner\??|profitez de tous nos articles|r[ée]serv[ée] aux abonn[ée]s|regarder une publicit[ée]|se connecter|soutenez (?:notre|nos) journaliste?s?)(?:\s*[:,–—-]\s*.+)?$/iu;
const MALFORMED_CURRENCY_PATTERN = /[$€£]\s*(?:[?\uFFFD]\s*)+\d+(?:[.,]\d+)*(?:\s*(?:thousand|million|billion|[kmb]))?/giu;

export const isAccessInterfaceText = (value) => ACCESS_INTERFACE_PATTERN.test(
  String(value || '').replace(/\s+/gu, ' ').replace(/[.!?]+$/gu, '').trim(),
);

export const sanitizeMalformedCurrencyText = (value) => String(value || '')
  .replace(MALFORMED_CURRENCY_PATTERN, 'an unspecified amount');

const cleanEntry = (entry) => {
  let value = sanitizeMalformedCurrencyText(entry).replace(/\s+/g, ' ').trim();
  if (!value) return '';

  value = value
    .replace(/\bimage source\s*[:,]\s*.*?(?=\bimage caption\s*[:,]|$)/giu, ' ')
    .replace(/\bimage caption\s*[:,]\s*/giu, '')
    .replace(/(?:^|\s)(?:photo(?:graph)?|picture)\s+(?:by|credit\s*[:,])\s*[\p{Lu}][\p{L}\p{M}'’-]+(?:\s+[\p{Lu}][\p{L}\p{M}'’-]+){1,3}(?=$|[.;])/giu, ' ')
    .replace(/(?:^|\s)(?:©|copyright\s+)[^.!?]{1,100}(?=$|[.;])/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  value = value
    .split(/(?<=[.!?])\s+/u)
    .filter((sentence) => !isAccessInterfaceText(sentence))
    .join(' ')
    .trim();

  if (
    !value
    || CREDIT_ONLY_PATTERN.test(value)
    || BYLINE_ONLY_PATTERN.test(value)
    || MEDIA_PROVIDER_ONLY_PATTERN.test(value)
    || KNOWN_PROVIDER_ONLY_PATTERN.test(value)
    || INTERFACE_ONLY_PATTERN.test(value)
    || isAccessInterfaceText(value)
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

// Corporate names verified against the issuer's 23 September 2026 announcement
// and SEC 8-K. Do not equate the group's individual brands or other cruise lines.
const royalCaribbeanGroupNames = ['Royal Caribbean Cruises', 'Royal Caribbean Group'];
export const mediaSubjectAliases = (subject) => (
  /^royal caribbean (?:group|cruises(?: ltd\.?)?)$/iu.test(subject.trim())
    ? royalCaribbeanGroupNames
    : [subject]
);

export const mediaMentionSearchQuery = (parsed) => {
  const alternatives = parsed.subjects.map(mediaSubjectAliases);
  const plain = alternatives.length === 1 && alternatives[0].length === 1;
  const subjectQuery = plain ? parsed.subjects[0] : alternatives.map((names) => (
    names.length > 1 ? `(${names.map((name) => `"${name}"`).join(' OR ')})`
      : `"${names[0].replace(/"/gu, '')}"`
  )).join(' ');
  const quote = value => `"${value.replace(/["\\]/gu, '')}"`;
  return [subjectQuery, ...(parsed.topics || []).map(quote),
    ...(parsed.exclusions || []).map(value => `-${quote(value)}`)].join(' ');
};

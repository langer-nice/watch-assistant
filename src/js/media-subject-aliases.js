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
  if (!alternatives.some((names) => names.length > 1)) return parsed.query;
  return alternatives.map((names) => (
    names.length > 1 ? `(${names.map((name) => `"${name}"`).join(' OR ')})`
      : `"${names[0].replace(/"/gu, '')}"`
  )).join(' ');
};

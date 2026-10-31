const pairs = new Map([['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’']]);

// Source-aware presentation normalization only. Never strip actual source quotes,
// recurse through nested wrappers, trim whitespace or accept an unsupported quote.
export function normalizeEvidenceQuote(quote, evidence) {
  const supported = value => evidence.content.includes(value) || evidence.title.includes(value);
  if (supported(quote) || quote.length < 3 || pairs.get(quote[0]) !== quote.at(-1)) return quote;
  const inner = quote.slice(1, -1);
  return inner.trim() && supported(inner) ? inner : quote;
}

// Closed, case-sensitive text resolution. No inferred omissions or punctuation edits.
const wrappers = new Map([['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’']]);
const normalize = value => value.replace(/\s+/gu, ' ').trim();
function indexed(source) {
  let value = ''; const starts = [], ends = [];
  for (const match of source.matchAll(/\S+/gu)) {
    if (value) { value += ' '; starts.push(ends.at(-1)); ends.push(match.index); }
    value += match[0];
    for (let i = 0; i < match[0].length; i++) { starts.push(match.index + i); ends.push(match.index + i + 1); }
  }
  return { value, starts, ends };
}

export function resolveEvidenceSpan(source, original, { whole = false } = {}) {
  if (!/[\p{L}\p{N}]/u.test(original)) return null;
  const direct = whole ? source === original : source.includes(original);
  if (direct) return { quote: original, original_quote: original, mode: 'EXACT', ranges: [[source.indexOf(original), source.indexOf(original) + original.length]] };
  const normalized = indexed(source);
  const variants = [normalize(original)];
  if (wrappers.get(variants[0][0]) === variants[0].at(-1)) variants.push(normalize(variants[0].slice(1, -1)));
  for (const quote of variants) {
    if (!/[\p{L}\p{N}]/u.test(quote)) continue;
    const at = normalized.value.indexOf(quote);
    if (at >= 0 && (!whole || normalized.value === quote)) {
      const range = [normalized.starts[at], normalized.ends[at + quote.length - 1]];
      return { quote: source.slice(...range), original_quote: original, mode: 'NORMALIZED_EXACT', ranges: [range] };
    }
    // Canonical measurements remain whole observations, never fragmented metrics.
    if (whole || !/(?:\.{3}|…)/u.test(quote)) continue;
    const fragments = quote.split(/(?:\.{3}|…)/u).map(normalize).filter(Boolean);
    // Two lexical tokens and eight letters/digits per fragment: deliberately
    // conservative and language/domain independent. No single generic anchor.
    if (fragments.length < 2 || fragments.some(f => (f.match(/[\p{L}\p{N}]+/gu) ?? []).length < 2 || (f.match(/[\p{L}\p{N}]/gu) ?? []).length < 8)) continue;
    // Require each fragment to have exactly one occurrence in this field. This
    // rejects ambiguous alternatives rather than selecting a plausible path.
    const positions = fragments.map(f => normalized.value.indexOf(f));
    if (positions.some((p, i) => p < 0 || normalized.value.indexOf(fragments[i], p + 1) >= 0 || (i > 0 && p < positions[i - 1] + fragments[i - 1].length))) continue;
    const ranges = positions.map((p, i) => [normalized.starts[p], normalized.ends[p + fragments[i].length - 1]]);
    const span = source.slice(ranges[0][0], ranges.at(-1)[1]);
    const touchesUrl = [...source.matchAll(/(?:https?:\/\/|www\.)\S+/giu)].some(m => m.index < ranges.at(-1)[1] && m.index + m[0].length > ranges[0][0]);
    if (touchesUrl) continue;
    return { quote: span, original_quote: original, mode: 'ELLIPSIS_EXACT_FRAGMENTS', ranges };
  }
  return null;
}

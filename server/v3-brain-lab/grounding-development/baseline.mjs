import { BASELINE_INSTRUCTIONS as ORIGINAL } from '../baseline.mjs';
// Preserve every baseline semantic sentence; replace only its grounding format.
const start = ORIGINAL.indexOf('Return only the supplied Judgment schema.');
if (start < 0) throw new Error('Baseline grounding format block not found');
export const BASELINE_INSTRUCTIONS = ORIGINAL.slice(0, start) + `Return only the supplied Judgment schema. evidence_basis has one to four references: claims use {quote} only, with a short exact title/content excerpt or the entire supplied measurement.quote. The server resolves the claim field; do not supply a field key for claims. source/url/published_at use {field} only. Every ALERT needs a substantive grounded claim quote. Provenance alone is insufficient. Give a concise reason and optional novelty_summary; do not invent facts or serialize field/value fragments as quotes.`;

import { randomUUID } from 'node:crypto';
import { CAPTURE_KINDS, freeze, list, object, string } from './schema.mjs';

export function validateContext(items = []) {
  const ids = new Set(['raw_input']);
  return list(items, 'context').map(item => {
    object(item, ['id', 'kind', 'text', 'url'], ['id', 'kind', 'text']);
    string(item.id, 'context id');
    if (ids.has(item.id) || item.id.startsWith('conversation:')) throw new TypeError('Duplicate/reserved source id');
    ids.add(item.id);
    string(item.kind, 'context kind');
    string(item.text, 'context text', { empty: true });
    if (item.url !== undefined) string(item.url, 'context URL');
    return { ...item };
  });
}

export function createCapture(input) {
  object(input, ['id', 'kind', 'raw_input', 'context', 'source_metadata'], ['kind', 'raw_input']);
  if (!CAPTURE_KINDS.includes(input.kind)) throw new TypeError('Unknown Capture kind');
  string(input.raw_input, 'raw_input', { empty: true });
  const context = validateContext(input.context);
  if (input.kind === 'URL' && context.filter(item => item.url).length !== 1) {
    throw new TypeError('URL Capture requires exactly one supplied resource');
  }
  if (!input.raw_input.trim() && !context.some(item => item.text.trim() || item.url)) {
    throw new TypeError('Capture requires input or context');
  }
  const metadata = input.source_metadata ?? {};
  object(metadata, ['captured_at', 'source_label', 'predecessor_id'], []);
  const captured_at = metadata.captured_at ?? new Date().toISOString();
  string(captured_at, 'captured_at');
  if (!Number.isFinite(Date.parse(captured_at))) throw new TypeError('Invalid capture timestamp');
  for (const key of ['source_label', 'predecessor_id']) {
    if (metadata[key] !== undefined) string(metadata[key], key);
  }
  const id = input.id ?? randomUUID();
  string(id, 'Capture id');
  return freeze({ id, kind: input.kind, raw_input: input.raw_input,
    ...(context.length ? { context } : {}),
    source_metadata: { ...metadata, captured_at } });
}

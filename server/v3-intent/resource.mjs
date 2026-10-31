import { freeze } from './schema.mjs';

// Identity comes only from the server's validated immutable Capture snapshot.
// Parsing validates absolute URL syntax; its serialized form is never used.
export function resourceFromCapture(capture) {
  if (capture.kind !== 'URL') return undefined;
  const resources = (capture.context ?? []).filter(item => item.url);
  if (resources.length !== 1 || !URL.canParse(resources[0].url)) {
    throw new TypeError('URL Capture requires one valid absolute resource URL');
  }
  return freeze({ source_ref: resources[0].id, exact_url: resources[0].url });
}

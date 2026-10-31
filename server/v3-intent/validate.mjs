// Literal grounding only: deliberately no natural-language parser or repair.
// A quote/value must not be a fragment inside another word or number.
export function containsExactLiteral(source, literal) {
  const word = character => character !== undefined && /[\p{L}\p{N}_]/u.test(character);
  let at = source.indexOf(literal);
  while (at !== -1) {
    const before = source[at - 1];
    const after = source[at + literal.length];
    if (!(word(literal[0]) && word(before)) && !(word(literal.at(-1)) && word(after))) return true;
    at = source.indexOf(literal, at + 1);
  }
  return false;
}

export function sourceMap(capture, conversation = []) {
  const sources = new Map([['raw_input', { text: capture.raw_input }]]);
  for (const item of capture.context ?? []) sources.set(item.id, item);
  conversation.forEach((text, index) => sources.set(`conversation:${index}`, { text }));
  return sources;
}

export function validateExactness(intent, sources, captureResource) {
  const get = ref => {
    if (!sources.has(ref)) throw new TypeError('Unknown source reference');
    return sources.get(ref);
  };
  for (const ref of intent.references) {
    const source = get(ref.source_ref);
    if (ref.exact_url !== undefined && ref.exact_url !== (captureResource?.exact_url ?? source.url)) {
      throw new TypeError('Exact URL differs from source URL');
    }
  }
  for (const constraint of intent.explicit_constraints) {
    const source = get(constraint.source_ref);
    if (constraint.kind === 'exact_resource') {
      if (captureResource) {
        const exactUrl = captureResource.exact_url;
        if (constraint.value !== undefined && constraint.value !== exactUrl) {
          throw new TypeError('Model resource conflicts with Capture URL');
        }
        // A duplicate may quote the supplied instruction instead of the URL.
        // It does not establish identity; a conflicting explicit URL is rejected.
        if (constraint.text !== exactUrl && (URL.canParse(constraint.text) ||
            !containsExactLiteral(source.text, constraint.text))) {
          throw new TypeError('Model resource conflicts with Capture URL or source quote');
        }
        // Also reject conflicting absolute URL literals inside a quoted instruction.
        // This scans resource syntax only; it never interprets natural language.
        const literals = constraint.text.match(/[a-zA-Z][a-zA-Z\d+.-]*:\/\/[^\s<>"']+/gu) ?? [];
        if (literals.some(url => url !== exactUrl)) throw new TypeError('Model resource conflicts with Capture URL');
      } else if (!source.url || constraint.text !== source.url ||
          (constraint.value !== undefined && constraint.value !== source.url)) {
        throw new TypeError('Exact resource differs from source URL');
      }
    } else {
      if (!containsExactLiteral(source.text, constraint.text)) throw new TypeError('Constraint quote is not exact source text');
      if (constraint.value !== undefined && !containsExactLiteral(constraint.text, constraint.value)) {
        throw new TypeError('Exact value must occur unchanged within its source quote');
      }
    }
  }
  return intent;
}

// Slice 1: pure, offline semantic normalization. No model, transport or storage.
import { normalizeDecimal } from '../src/js/currency-watch.js';
import { canonicalJSON, contentFingerprint } from '../src/js/structured-fingerprint.js';
import { isSemanticWatchContract, normalizeSemanticWatchContract } from './semantic-watch-contract.js';

export const WATCH_CONTRACT_VERSION = 'watch-contract.v1';
const fail = reason => { throw Object.assign(new Error('Invalid Watch Contract'), { code: 'INVALID_WATCH_CONTRACT', reason }); };
const fold = s => s.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
const equal = (a, b) => canonicalJSON(a) === canonicalJSON(b);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const keys = (x, allowed) => { if (!object(x) || Object.keys(x).some(k => !allowed.includes(k))) fail('shape'); };
const text = x => { if (typeof x !== 'string' || !x.trim() || x.length > 2000 || /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(x)) fail('text'); return x; };
const list = (x, max) => { if (!Array.isArray(x) || x.length > max) fail('array'); return x; };
const genericTopic = /^(?:important new developments|new developments|news|updates)$/iu;
const anySource = () => ({ policy: 'any', urls: [], official: false });

/** Candidate uses the contract field names; evidence = exact request spans.
 * context.request, if supplied, is authoritative. Technical hints are ignored,
 * never used to choose domain/adapter. Supported vocabulary is deliberately small.
 */
export function normalizeWatchContract(candidate, context = {}) {
  if(isSemanticWatchContract(candidate))return normalizeSemanticWatchContract(candidate,context);
  keys(context, ['request']);
  keys(candidate, ['version','user_intent_text','subject','trigger','constraints','time_scope',
    'source_preference','input_source','evidence','capability_status','technical']);
  if (candidate.version !== undefined && candidate.version !== WATCH_CONTRACT_VERSION) fail('version');
  if (candidate.capability_status !== undefined && !['UNKNOWN','SUPPORTED','UNSUPPORTED','PARTIALLY_SUPPORTED'].includes(candidate.capability_status)) fail('capability_status');
  const request = text(context.request ?? candidate.user_intent_text);
  if (candidate.user_intent_text !== undefined && candidate.user_intent_text !== request) fail('request_mismatch');
  if (request.length > 2000) fail('input_size');
  if (candidate.technical !== undefined) {
    keys(candidate.technical, ['domain','intent','predicate']);
    if (Object.values(candidate.technical).some(v => typeof v !== 'string' || v.length > 80)) fail('technical_hint');
  }
  const supplied = list(candidate.evidence, 48);
  const allowedEvidence = /^(?:subject\/\d+|trigger(?:\/comparison)?|constraints\/\d+|time_scope\/\d+|source_preference|input_source)$/u;
  for (const e of supplied) {
    keys(e, ['field','source_id','start','end','text','rule']);
    if (!allowedEvidence.test(e.field) || e.source_id !== 'request' || !Number.isSafeInteger(e.start)
      || !Number.isSafeInteger(e.end) || e.start < 0 || e.end <= e.start || e.end > request.length
      || request.slice(e.start, e.end) !== e.text) fail('evidence_span');
  }
  const evidence = [];
  const anchor = (field, value, { exact = false, rule = null } = {}) => {
    const matches = supplied.filter(e => e.field === field && (exact ? e.text === value : e.text.includes(value)));
    if (!matches.length) fail(`evidence_missing:${field}`);
    // Canonicalize multiple supplied anchors without requiring a unique quote.
    const chosen = [...matches].sort((a,b) => a.start-b.start || a.end-b.end)[0];
    const start = chosen.start + chosen.text.indexOf(value);
    evidence.push({ field, source_id: 'request', start, end: start + value.length, text: value, rule });
    return value;
  };
  const addDerived = (field, value, rule) => {
    const start = request.indexOf(value);
    if (start < 0) fail('derived_evidence');
    evidence.push({ field, source_id:'request', start, end:start+value.length, text:value, rule });
  };
  let url = null;
  try { const u = new URL(request); if (['http:','https:'].includes(u.protocol) && !u.username && !u.password && !/\s/u.test(request)) url = request; } catch { /* text input */ }
  const input_source = { kind: url ? 'url' : 'text', submitted_url: url, metadata_ref: null };
  if (candidate.input_source !== undefined && !equal(candidate.input_source, input_source)) fail('input_source_conflict');
  const subjects = list(candidate.subject, 8);
  if (!subjects.length) fail('subject_required');
  const subject = subjects.map((s,i) => {
    keys(s, ['kind','value','identity']);
    if (!['entity','resource','instrument'].includes(s.kind)) fail('subject_kind');
    const value = text(s.value);
    anchor(`subject/${i}`, value, {exact:true});
    const identity = s.kind === 'resource' ? value : fold(value);
    if (s.identity !== undefined && s.identity !== identity) fail('identity_conflict');
    return { kind:s.kind, value, identity };
  });
  if (new Set(subject.map(s=>s.identity)).size !== subject.length) fail('duplicate_subject');
  keys(candidate.trigger, ['kind','target','comparison']);
  const proposed = candidate.trigger;
  const constraints = list(candidate.constraints ?? [], 8);
  const periods = list(candidate.time_scope ?? [], 4);
  let trigger, time_scope = [], normalizedConstraints = [];
  // Closed whole-clause grammars prevent dropping qualifiers. Not an entity allowlist.
  const development = /^(?:Tell me when there are|Keep me updated on) (important new developments|new developments|news|updates) about (.+?)\.$/u.exec(request);
  const publication = /^Tell me when (.+?) (publishes|releases|announces) its (Q[1-4] \d{4}) earnings (results|report)\.$/u.exec(request);
  const rate = /^Tell me when (GBP\/EUR|EUR\/GBP) goes (above|at least|below) (\d{1,12}(?:[.,]\d{1,12})?)\.$/u.exec(request);
  if (url) {
    if (subject.length !== 1 || subject[0].kind !== 'resource' || subject[0].value !== url) fail('url_subject');
    if (proposed.kind !== 'resource_change' || proposed.target !== url || proposed.comparison != null) fail('url_trigger');
    anchor('trigger',url,{exact:true,rule:'url_resource_default.v1'});
    trigger = {kind:'resource_change',target:url,comparison:null};
  } else if (development) {
    if (subject.length !== 1 || subject[0].kind !== 'entity' || subject[0].value !== development[2]) fail('subject_conflict');
    if (!['development','ongoing_news','news_about'].includes(proposed.kind)
      || !['important new developments','new developments','news','updates','important_new_developments'].includes(proposed.target) || proposed.comparison != null) fail('trigger_conflict');
    anchor('trigger',development[1],{rule:'general_development.v1'});
    trigger = {kind:'development',target:'important_new_developments',comparison:null};
    for (const [i,c] of constraints.entries()) {
      keys(c,['kind','value','role']);
      if (c.kind !== 'topic' || !['required','focus'].includes(c.role) || !genericTopic.test(c.value)
        || !development[1].includes(c.value)) fail('invented_constraint');
      anchor(`constraints/${i}`,c.value);
      evidence.pop(); // Grounded generic trigger wording is not a topic filter.
    }
  } else if (publication) {
    if (subject.length !== 1 || subject[0].kind !== 'entity' || subject[0].value !== publication[1]) fail('subject_conflict');
    if (!['publication','event','ongoing_news','news_about'].includes(proposed.kind)
      || !['earnings results','earnings report','earnings_release','earnings_results_publication','official_company_announcement'].includes(proposed.target)
      || proposed.comparison != null) fail('trigger_conflict');
    anchor('trigger',request.slice(request.indexOf(publication[2]),-1),{rule:'earnings_publication.v1'});
    trigger = {kind:'publication',target:'earnings_results_publication',comparison:null};
    if (periods.length !== 1) fail('period_required');
    const t = periods[0]; keys(t,['kind','value','basis']);
    const [quarter,year] = publication[3].split(' ');
    if (!['period'].includes(t.kind) || ![publication[3],`${year}-${quarter}`].includes(t.value)
      || ![undefined,'unspecified'].includes(t.basis)) fail('period_conflict');
    anchor('time_scope/0',publication[3],{rule:'quarter_period.v1'});
    time_scope = [{kind:'period',value:`${year}-${quarter}`,basis:'unspecified'}];
  } else if (rate) {
    if (subject.length !== 1 || subject[0].kind !== 'instrument' || subject[0].value !== rate[1]) fail('pair_conflict');
    if (!['threshold_crossing','value_condition','numeric'].includes(proposed.kind) || proposed.target !== 'exchange_rate') fail('trigger_conflict');
    keys(proposed.comparison,['comparator','value','unit']);
    const comparison = proposed.comparison;
    const operator = {above:'gt','at least':'gte',below:'lt'}[rate[2]];
    const aliases = {'>':'gt','>=':'gte','<':'lt',above:'gt','at least':'gte',below:'lt',gt:'gt',gte:'gte',lt:'lt'};
    if (aliases[comparison.comparator] !== operator || typeof comparison.value !== 'string') fail('comparison_conflict');
    let value;
    try { value = normalizeDecimal(comparison.value); if (value !== normalizeDecimal(rate[3])) fail('amount_conflict'); }
    catch { fail('amount_conflict'); }
    const unit = rate[1].split('/')[1];
    if (comparison.unit !== unit) fail('unit_conflict');
    anchor('trigger',`goes ${rate[2]} ${rate[3]}`);
    anchor('trigger/comparison',rate[3]);
    trigger = {kind:'threshold_crossing',target:'exchange_rate',comparison:{comparator:operator,value,unit}};
  } else {
    // Open semantic fallback is intentionally literal: unknown capability is valid.
    // No free interpretation of normalized event labels or hidden constraints.
    if (proposed.kind !== 'other' || proposed.comparison != null) fail('vocabulary_not_supported');
    const target = text(proposed.target); anchor('trigger',target,{exact:true});
    trigger = {kind:'other',target,comparison:null};
    for (const [i,c] of constraints.entries()) {
      keys(c,['kind','value','role']);
      if (!['topic','exclude'].includes(c.kind) || !['required','excluded','focus'].includes(c.role)) fail('constraint_kind');
      const value = text(c.value); anchor(`constraints/${i}`,value,{exact:true});
      // Only explicit restriction clauses in this bounded offline vocabulary.
      const cue = c.role === 'required' ? `only ${value}` : c.role === 'excluded' ? `excluding ${value}` : `including ${value}`;
      if (!request.includes(cue) || (c.kind === 'exclude') !== (c.role === 'excluded')) fail('constraint_cue');
      normalizedConstraints.push({kind:c.kind,value,role:c.role});
    }
    // Exact bounded fallback grammar: never omit unrepresented requirements.
    const suffix = normalizedConstraints.map(c => `, ${c.role === 'required' ? 'only' : c.role === 'excluded' ? 'excluding' : 'including'} ${c.value}`).join('');
    const official = request.includes(' from official sources only') ? ' from official sources only' : '';
    if (subject.length !== 1 || subject[0].kind !== 'entity'
      || request !== `Monitor ${target} about ${subject[0].value}${suffix}${official}.`) fail('unrepresented_meaning');
  }
  if (!development && trigger.kind !== 'other' && constraints.length) fail('extra_constraint');
  if (!publication && periods.length) fail('extra_time');
  // Explicit official-source policy is supported only in the literal fallback;
  // technical hints cannot create it. Unsupported proposed restrictions reject.
  const explicitOfficial = /\bfrom official sources only\b/u.test(request);
  const source_preference = url ? {policy:'only',urls:[url],official:false}
    : explicitOfficial ? {policy:'only',urls:[],official:true} : anySource();
  if (candidate.source_preference !== undefined && !equal(candidate.source_preference,source_preference)) fail('source_preference_conflict');
  if (url) { addDerived('source_preference',url,'submitted_url_constraint.v1'); addDerived('input_source',url,'submitted_url.v1'); }
  else if (explicitOfficial) anchor('source_preference','from official sources only');
  if (new Set(normalizedConstraints.map(canonicalJSON)).size !== normalizedConstraints.length) fail('duplicate_constraint');
  const capability_status = trigger.kind === 'publication' ? 'UNSUPPORTED'
    : trigger.kind === 'development' ? 'SUPPORTED' : 'UNKNOWN';
  return {version:WATCH_CONTRACT_VERSION,user_intent_text:request,subject,trigger,constraints:normalizedConstraints,
    time_scope,source_preference,input_source,evidence:evidence.sort((a,b)=>a.field.localeCompare(b.field,'en')),capability_status};
}

// Semantic equality excludes source wording, spans and capability annotations.
export function watchContractSemanticFingerprint(input,context={}) {
  const c = normalizeWatchContract(input,context);
  return contentFingerprint({subject:c.subject.map(({kind,identity})=>({kind,identity})),trigger:c.trigger,
    constraints:c.constraints,time_scope:c.time_scope,source_preference:c.source_preference});
}

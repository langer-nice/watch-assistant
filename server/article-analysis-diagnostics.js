import { randomUUID } from 'node:crypto';
import { cleanArticleContentForAnalysis } from '../src/js/article-content.js';
import { normalizeAutomaticStoryFingerprint } from '../src/js/monitoring-concepts.js';
import { createStoryProfile } from '../src/js/story-profile.js';
import { createSourceDerivedFallback } from '../src/js/url-analysis.js';
import { validatePublicUrl } from './public-url-security.js';
import { ArticleAnalysisError, fetchPageMetadata, generateWatchSuggestion } from './url-watch-api.js';

const MAX_REQUEST_BYTES = 4096;
const MAX_EXCERPT_LENGTH = 1200;
const MAX_SAFE_STRING = 400;
const SAFE_REASON_CODES = new Set([
  'configuration_missing', 'provider_auth_error', 'provider_rate_limited', 'provider_timeout',
  'provider_network_error', 'provider_http_error', 'provider_envelope_invalid',
  'provider_incomplete', 'provider_refusal', 'provider_output_missing', 'provider_json_invalid',
  'provider_schema_invalid', 'provider_output_truncated', 'application_validation_failed',
  'provider_request_aborted', 'provider_response_invalid', 'structured_validation_failed',
  'internal_error',
]);

export const DIAGNOSTIC_ARTICLES = Object.freeze([
  { label: 'Sue Kreitzman', url: 'https://www.bbc.com/news/articles/crel1g1j957o', reference: 'Compare Sue Kreitzman and any coherent, supported concept for her art-filled home.' },
  { label: 'Colombian coca farmers', url: 'https://www.bbc.com/news/articles/c0kyml1zxz4o', reference: 'Check whether Colombia is overly broad and whether the farmers or crop-substitution story is represented.' },
  { label: 'The Odyssey', url: 'https://www.bbc.com/news/articles/c1m1ev5j3m2o', reference: 'Check whether The Odyssey is typed as a work and whether any unauthorized release event is supported.' },
  { label: 'Brain fog and perimenopause', url: 'https://www.bbc.com/news/articles/c87ydw7xdxvo', reference: 'Check Perimenopause and Brain fog; advice belongs in contextual details.' },
  { label: 'Open-water swimming', url: 'https://www.bbc.com/future/article/20260722-how-safe-is-wild-swimming', reference: 'Review supported swimming, contamination, disease and algae concepts.' },
  { label: 'Seattle festival shooting', url: 'https://edition.cnn.com/2026/07/26/us/seattle-center-shooting-festival', reference: 'Review the event, Seattle Center and central organisations; Seattle alone may be broad.' },
]);

const allowedUrls = new Set(DIAGNOSTIC_ARTICLES.map(({ url }) => url));
const cleanString = (value, limit = MAX_SAFE_STRING) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
const safeCode = (value) => SAFE_REASON_CODES.has(value) ? value : 'internal_error';
const sameConcept = (a, b) => cleanString(a?.label).toLocaleLowerCase() === cleanString(b?.label).toLocaleLowerCase() && a?.type === b?.type;
const safeFingerprint = (values) => (Array.isArray(values) ? values : []).slice(0, 12).map((item) => ({ label: cleanString(item?.label, 160), type: cleanString(item?.type, 40) })).filter(({ label }) => label);
const safeStrings = (values, limit = 8, length = 240) => (Array.isArray(values) ? values : []).slice(0, limit).map((value) => cleanString(value, length)).filter(Boolean);
const safeProfile = (profile = {}) => ({
  storySummary: cleanString(profile.storySummary, 360), primaryPeople: safeStrings(profile.primaryPeople), otherPeople: safeStrings(profile.otherPeople),
  peopleRoles: (Array.isArray(profile.peopleRoles) ? profile.peopleRoles : []).slice(0, 6).map(({ name, role }) => ({ name: cleanString(name, 80), role: cleanString(role, 100) })),
  locations: safeStrings(profile.locations), organizations: safeStrings(profile.organizations), eventTypes: safeStrings(profile.eventTypes),
  works: safeStrings(profile.works), productsServices: safeStrings(profile.productsServices), events: safeStrings(profile.events),
  relationships: safeStrings(profile.relationships), phenomena: safeStrings(profile.phenomena), conditions: safeStrings(profile.conditions), symptoms: safeStrings(profile.symptoms),
  distinctiveFacts: safeStrings(profile.distinctiveFacts, 8, 180), aliases: safeStrings(profile.aliases), uncertaintyPhrases: safeStrings(profile.uncertaintyPhrases, 4, 240),
});
const safeParsedSuggestion = (value = {}) => {
  const storyFingerprint = safeFingerprint(value.storyFingerprint);
  const byType = (type) => storyFingerprint.filter((item) => item.type === type).map(({ label }) => label);
  const profile = safeProfile(value.storyProfile);
  return {
    watchTitle: cleanString(value.watchTitle, 100),
    watchingFor: cleanString(value.watchingFor, 300),
    description: cleanString(value.description, 300),
    storyFingerprint,
    storyProfile: profile,
    primaryPeople: profile.primaryPeople,
    otherPeople: profile.otherPeople,
    organizations: profile.organizations,
    locations: profile.locations,
    works: [...new Set([...profile.works, ...byType('work')])],
    productsServices: [...new Set([...profile.productsServices, ...byType('product_service')])],
    events: [...new Set([...profile.events, ...profile.eventTypes, ...byType('event')])],
    relationships: [...new Set([...profile.relationships, ...byType('relationship')])],
    phenomena: [...new Set([...profile.phenomena, ...byType('phenomenon')])],
    conditions: [...new Set([...profile.conditions, ...byType('condition')])],
    symptoms: [...new Set([...profile.symptoms, ...byType('symptom')])],
    distinctiveFacts: profile.distinctiveFacts,
    uncertaintyPhrases: profile.uncertaintyPhrases,
  };
};

export const isArticleDiagnosticsAvailable = (env = process.env) => env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development' || (!env.VERCEL_ENV && env.NODE_ENV !== 'production');

const findSourceExcerpt = (source, label) => {
  const text = String(source || ''); const needle = String(label || ''); const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return cleanString(text, 220);
  return cleanString(text.slice(Math.max(0, index - 90), index + needle.length + 90), 220);
};

const getSuspiciousExtractionRules = (originalText, cleanedText) => {
  const source = `${originalText}\n${cleanedText}`;
  return [
    [/London Kreitzman['’]s Mile/i, 'known_compound_phrase_detected'],
    [/\b(?:related content|read more|sign up|share this article)\b[^.!?\n]{0,80}\b[A-Z][a-z]+/i, 'navigation_text_join_detected'],
    [/\b(?:image source|image caption|photo credit|picture credit)\b[^.!?\n]{0,100}\b(?:said|reported|according|after|before)\b/i, 'media_caption_text_join_detected'],
  ].filter(([pattern]) => pattern.test(source)).map(([, rule]) => rule);
};

export const describeNormalization = (beforeValues, afterValues, context = {}) => {
  const before = safeFingerprint(beforeValues); const after = safeFingerprint(afterValues);
  const transformations = before.map((candidate, index) => {
    const exact = after.find((item) => sameConcept(candidate, item));
    const previousDuplicate = before.slice(0, index).some((item) => sameConcept(candidate, item));
    if (exact && previousDuplicate) return { before: candidate, after: exact, action: 'merged_or_deduplicated', rule: 'exact_typed_duplicate' };
    if (exact) return { before: candidate, after: exact, action: 'retained', rule: 'automatic_identifier_retained' };
    const sameLabel = after.find((item) => item.label.toLocaleLowerCase() === candidate.label.toLocaleLowerCase());
    if (sameLabel) return { before: candidate, after: sameLabel, action: 'reclassified', rule: 'type_normalization' };
    const normalized = normalizeAutomaticStoryFingerprint([candidate], 1)[0];
    if (normalized) {
      const renamed = after.find((item) => sameConcept(normalized, item));
      if (renamed) return { before: candidate, after: renamed, action: candidate.label === renamed.label ? 'retained' : 'renamed', rule: candidate.label === renamed.label ? 'automatic_identifier_retained' : 'label_normalization' };
    }
    return {
      before: candidate,
      after: null,
      action: 'removed',
      rule: index >= 5
        ? 'automatic_identifier_limit'
        : normalized ? 'identifier_removed_without_equivalence' : 'automatic_identifier_validation_rejected',
    };
  });
  return { before, after, transformations, createdByNormalization: after.filter((item) => !before.some((candidate) => sameConcept(candidate, item))), contextualFieldAffectedSelection: Boolean(context.contextualFieldAffectedSelection), manualProtectionRulesInvolved: before.some((item) => item.type === 'manual') };
};

const readJsonBody = (request) => new Promise((resolve, reject) => { let body=''; request.setEncoding('utf8'); request.on('data',(chunk)=>{body+=chunk;if(Buffer.byteLength(body)>MAX_REQUEST_BYTES){const error=new Error('request_too_large');error.statusCode=413;reject(error);request.destroy();}});request.on('end',()=>{try{resolve(JSON.parse(body||'{}'))}catch{const error=new Error('malformed_json');error.statusCode=400;reject(error)}});request.on('error',reject); });
const sendJson = (response,status,value) => { response.statusCode=status; response.setHeader('Content-Type','application/json; charset=utf-8'); response.setHeader('Cache-Control','no-store, private'); response.end(JSON.stringify(value)); };
const sendUnavailable = (response) => { response.statusCode=404; response.setHeader('Cache-Control','no-store, private'); response.end('Not found'); };

const validateDiagnosticUrl = async (value, validateUrl) => {
  if (typeof value !== 'string' || !value.trim()) { const error=new Error('missing_url');error.statusCode=400;throw error; }
  let parsed; try { parsed=new URL(value); } catch { const error=new Error('malformed_url');error.statusCode=400;throw error; }
  if (!['http:','https:'].includes(parsed.protocol)) { const error=new Error('unsupported_url_scheme');error.statusCode=400;throw error; }
  if (!allowedUrls.has(parsed.href)) { const error=new Error('diagnostic_url_not_allowed');error.statusCode=400;throw error; }
  return validateUrl(parsed.href);
};

const classifyResult = ({ extraction, provenance, normalization, finalIdentifiers, structuredProfile }) => {
  if (extraction.status === 'partial') return 'extraction_incomplete';
  if (extraction.suspiciousContentBoundaryJoins.detected) return 'extraction_corrupted';
  if (provenance === 'fallback' && !finalIdentifiers.length) return 'fallback_generation_failure';
  if (provenance === 'fallback') return 'manual_review_required';
  if (normalization?.before?.length && !normalization.after.length) return 'normalization_overfiltering';
  if (normalization?.transformations?.some(({ rule }) => rule === 'identifier_removed_without_equivalence')) return 'normalization_overfiltering';
  const structuredTypes = new Map([
    ...safeStrings(structuredProfile?.works).map((label) => [label.toLocaleLowerCase(), 'work']),
    ...safeStrings(structuredProfile?.locations).map((label) => [label.toLocaleLowerCase(), 'location']),
    ...safeStrings(structuredProfile?.organizations).map((label) => [label.toLocaleLowerCase(), 'organization']),
  ]);
  if (finalIdentifiers.some(({ label, type }) => structuredTypes.has(label.toLocaleLowerCase()) && structuredTypes.get(label.toLocaleLowerCase()) !== type)) return 'normalization_misclassification';
  if (finalIdentifiers.length === 1 && finalIdentifiers[0].type === 'location' && finalIdentifiers[0].label.split(/\s+/).length <= 2) return 'manual_review_required';
  if (provenance === 'ai' && !normalization?.after?.length) return 'ai_identifier_omission';
  return normalization?.after?.length ? 'no_material_problem' : 'manual_review_required';
};

export const runArticleAnalysisDiagnostic = async (requestedUrl, options = {}) => {
  const { apiKey, model='gpt-5.6-luna', fetchImpl=fetch, validateUrl=validatePublicUrl, fetchPageMetadataImpl=fetchPageMetadata, generateWatchSuggestionImpl=generateWatchSuggestion, fallbackImpl=createSourceDerivedFallback, createStoryProfileImpl=createStoryProfile,signal,providerTimeoutMs,maxAttempts,retryDelayMs,sleepImpl,randomImpl }=options;
  const runAt=new Date().toISOString(); const diagnosticId=randomUUID(); let validatedUrl;
  try { validatedUrl=await validateDiagnosticUrl(requestedUrl,validateUrl); } catch(error) { throw error; }
  let page;
  try { page=await fetchPageMetadataImpl(validatedUrl.href,fetchImpl); } catch { return { ok:false,runAt,requestedUrl,provenance:'analysis_failed',fallbackReasonCode:null,classification:'extraction_incomplete',extraction:{requestedUrl,finalResolvedUrl:null,fetchStatus:'failed',status:'failed',safeErrorCode:'article_extraction_failed'},openAI:{attempted:false,succeeded:false,outcomeCode:'not_attempted'},fallback:null,normalization:null,finalResult:null }; }
  const originalText=String(page.articleText||''); const cleanedText=cleanArticleContentForAnalysis(originalText); const exactPhrase='London Kreitzman’s Mile';
  const suspiciousRules=getSuspiciousExtractionRules(originalText,cleanedText);const suspicious=suspiciousRules.length>0;
  const extraction={requestedUrl,finalResolvedUrl:page.sourceUrl||validatedUrl.href,fetchStatus:'retrieved',status:cleanedText?(originalText.length>=12000?'partial':'complete'):'empty',title:cleanString(page.title,200),description:cleanString(page.description,400),contentLengthBeforeCleanup:originalText.length,contentLengthAfterCleanup:cleanedText.length,analysisExcerpt:cleanedText.slice(0,MAX_EXCERPT_LENGTH),excerptLength:Math.min(cleanedText.length,MAX_EXCERPT_LENGTH),excerptTruncated:cleanedText.length>MAX_EXCERPT_LENGTH,extractionMethod:page.extractionMethod||'unknown',articleBodyCount:page.articleBodyCount||0,includedArticleBodyCount:page.includedArticleBodyCount||0,suspiciousContentBoundaryJoins:{detected:suspicious,rules:suspiciousRules},warnings:[...(originalText.length>=12000?['source_text_reached_pipeline_limit']:[]),...(suspicious?['suspicious_extraction_join_detected']:[])],exactPhrase:{value:exactPhrase,inOriginalExtractedText:originalText.includes(exactPhrase),inCleanedAnalysisText:cleanedText.includes(exactPhrase)}};
  const aiEvents=[]; let parsedAi=null; let suggestion; let provenance='ai'; let fallbackReasonCode=null; let fallbackTrace=null;
  try { suggestion=await generateWatchSuggestionImpl({title:page.title,description:page.description,articleText:cleanedText,author:page.author,slug:new URL(validatedUrl.href).pathname.split('/').filter(Boolean).at(-1)||'',apiKey,model,fetchImpl,diagnosticId,signal,providerTimeoutMs,maxAttempts,retryDelayMs,sleepImpl,randomImpl,onDiagnostic:(event)=>{if(event.stage==='parsed')parsedAi=safeParsedSuggestion(event.value);else aiEvents.push(event)}}); }
  catch(error){ provenance='fallback'; fallbackReasonCode=safeCode(error instanceof ArticleAnalysisError?error.code:error?.code); suggestion=fallbackImpl({...page,articleText:cleanedText},validatedUrl.href,{fallbackReasonCode,analysisDiagnosticId:diagnosticId,diagnosticCollector:(trace)=>{fallbackTrace=trace}}); }
  const suppliedFingerprint=provenance==='ai'?(parsedAi?.storyFingerprint||suggestion.storyFingerprint):(fallbackTrace?.candidates||[]);
  const pipelineFingerprint=normalizeAutomaticStoryFingerprint(suggestion.storyFingerprint||[],5);
  const storyProfile=createStoryProfileImpl({storyFingerprint:pipelineFingerprint,profile:suggestion.storyProfile,articleText:cleanedText,sourcePublication:page.siteName||new URL(validatedUrl.href).hostname,sourceTitle:page.title,sourceUrl:page.sourceUrl||validatedUrl.href,publishedAt:page.publishedAt});
  const normalization=describeNormalization(suppliedFingerprint,storyProfile.concepts,{contextualFieldAffectedSelection:provenance==='ai'&&safeFingerprint(parsedAi?.storyFingerprint).length!==safeFingerprint(suggestion.storyFingerprint).length});
  const fallback=fallbackTrace?{finalFingerprint:safeFingerprint(suggestion.storyFingerprint),candidates:fallbackTrace.candidates.map((candidate)=>{const transformation=normalization.transformations.find((item)=>sameConcept(item.before,candidate))||describeNormalization([candidate],suggestion.storyFingerprint).transformations[0];const matchingBlocks=(fallbackTrace.sourceBlocks||[]).filter((block)=>String(block).toLocaleLowerCase().includes(candidate.label.toLocaleLowerCase()));const suspiciousCompound=candidate.label===exactPhrase;return {...candidate,sourceExcerpt:findSourceExcerpt(fallbackTrace.sourceText,candidate.label),confidence:null,accepted:Boolean(suggestion.storyFingerprint.some((item)=>sameConcept(item,candidate))),acceptanceRule:transformation.rule,transformation:transformation.action,rewritten:transformation.action==='renamed',combined:transformation.action==='merged_or_deduplicated',truncated:transformation.rule==='automatic_identifier_limit',classified:Boolean(candidate.type),reclassified:transformation.action==='reclassified',combinedTextSegments:suspiciousCompound?matchingBlocks.map((block)=>findSourceExcerpt(block,candidate.label)):[],spansMultipleExtractedBlocks:matchingBlocks.length>1,boundaryAssessment:suspiciousCompound&&!matchingBlocks.length?'source_html_boundaries_not_retained_by_current_extractor':'assessed_from_retained_article_blocks'}})}:null;
  const finalResult={storySummary:cleanString(storyProfile.storySummary||suggestion.watchingFor||suggestion.description,360),storyIdentifiers:safeFingerprint(storyProfile.concepts),provenance,fallbackReasonCode,limitedFallbackAnalysisWarning:provenance==='fallback',zeroIdentifiersIsSuccessfulAi:provenance==='ai'&&storyProfile.concepts.length===0,fingerprintDiffersFromOriginal:JSON.stringify(safeFingerprint(suppliedFingerprint))!==JSON.stringify(safeFingerprint(storyProfile.concepts)),storyProfile:safeProfile(storyProfile),sourcePublication:cleanString(storyProfile.sourceArticle?.publication,100)};
  const safeEvents=aiEvents.map((event)=>({
    stage:cleanString(event.stage,40),
    attempt:Number.isInteger(event.attempt)?event.attempt:null,
    attempted:Boolean(event.attempted),
    succeeded:Boolean(event.succeeded),
    durationMs:Number.isFinite(event.durationMs)?Math.max(0,Math.round(event.durationMs)):null,
    outcomeCode:cleanString(event.outcomeCode,80)||null,
    retryOccurred:Boolean(event.retryOccurred),
    retryScheduled:Boolean(event.retryScheduled),
    aborted:Boolean(event.aborted),
    ...(event.validation?{validation:{stage:cleanString(event.validation.stage,60),path:cleanString(event.validation.path,120),rule:cleanString(event.validation.rule,80),description:cleanString(event.validation.description,200)}}:{}),
  }));
  const attempts=safeEvents.filter((event)=>event.stage==='provider_attempt');
  const openAI={attempted:attempts.length>0||aiEvents.some((event)=>event.attempted),succeeded:provenance==='ai',outcomeCode:provenance==='ai'?'success':fallbackReasonCode,retryOccurred:attempts.some((event)=>event.retryOccurred),aborted:attempts.some((event)=>event.aborted),attempts,validation:attempts.findLast((event)=>event.validation)?.validation||null,parsedStructuredFields:parsedAi,preNormalizationStoryFingerprint:parsedAi?.storyFingerprint||null,events:safeEvents};
  const classification=classifyResult({extraction,provenance,normalization,finalIdentifiers:finalResult.storyIdentifiers,structuredProfile:parsedAi});
  return {ok:true,runAt,requestedUrl,provenance,fallbackReasonCode,classification,extraction,openAI,fallback,normalization,finalResult};
};

export const createArticleAnalysisDiagnosticsMiddleware = (options = {}) => async (request,response,next=()=>{}) => {
  const pathname=new URL(request.url,'http://localhost').pathname;
  if (!['/api/article-analysis-diagnostics','/api/article-analysis-diagnostics-page'].includes(pathname)) { next(); return; }
  if (!isArticleDiagnosticsAvailable(options.environment||process.env)) { sendUnavailable(response); return; }
  if (pathname.endsWith('-page')) { if(request.method!=='GET'){sendJson(response,405,{error:'Method not allowed.'});return;} const {createArticleAnalysisDiagnosticsPage}=await import('./article-analysis-diagnostics-page.js'); response.statusCode=200;response.setHeader('Content-Type','text/html; charset=utf-8');response.setHeader('Cache-Control','no-store, private');response.end(createArticleAnalysisDiagnosticsPage());return; }
  if(request.method!=='POST'){sendJson(response,405,{error:'Method not allowed.'});return;}
  try{const body=await readJsonBody(request);const controller=new AbortController();request.once?.('aborted',()=>controller.abort(new DOMException('The caller disconnected.','AbortError')));response.once?.('close',()=>{if(!response.writableEnded)controller.abort(new DOMException('The caller disconnected.','AbortError'));});const result=await runArticleAnalysisDiagnostic(body.url,{...options,signal:controller.signal});sendJson(response,200,result);}catch(error){sendJson(response,error.statusCode||400,{error:'Diagnostic request rejected.',safeErrorCode:cleanString(error.message,80)});}
};

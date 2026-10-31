import {PILOT_OWNER,pilotEnabled} from './v3-pilot.js';
import {resolveCurrentRole} from './role-development.js';
import {roleDevelopmentIntent} from '../src/js/role-development.js';
import {mediaDailyDigestEnabled} from './media-watch-digest.js';
import { structuredCreationEnabled, requireStructuredCreationAccess } from './structured-creation-access.js';
// Disabled-by-default endpoint; every operation requires server-authorized test access.
import { authenticateSupabaseRequest } from './supabase-user.js';
import { createSupabaseServiceClient } from './supabase-service.js';
import { validateInterpretation } from '../src/js/watch-interpretation.js';
import { validateCompiledMonitoringPlan } from './watch-capabilities.js';
import { createWatchDefinition, validateWatchDefinition, structuredMonitoringSource } from '../src/js/watch-definition.js';
import { authorizationError, authorizationConfiguration, authorizationBindings, issuePlanAuthorization, verifyPlanAuthorization } from './structured-watch-authorization.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY_BYTES = 98304;
const safeCodes = new Set(['ROLE_EVIDENCE_UNAVAILABLE','STRUCTURED_FEATURE_UNAVAILABLE','AUTH_REQUIRED','INVALID_SESSION','AUTH_UNAVAILABLE','SERVER_NOT_CONFIGURED','INVALID_BODY',
  'INVALID_PLAN_AUTHORIZATION','UNSUPPORTED_AUTHORIZATION_VERSION','PLAN_AUDIENCE_MISMATCH','EXPIRED_PLAN_AUTHORIZATION',
  'PLAN_OWNER_MISMATCH','PLAN_WATCH_MISMATCH','PLAN_OPERATION_MISMATCH','PLAN_MUTATION_MISMATCH','PLAN_REVISION_MISMATCH',
  'PLAN_DEFINITION_MISMATCH','PLAN_VERSION_MISMATCH','UNSUPPORTED_WATCH_VERSION','INVALID_WATCH_DEFINITION','WATCH_SOURCE_MISMATCH',
  'INVALID_STRUCTURED_INTERPRETATION','MONITORING_PLAN_NOT_SUPPORTED','INVALID_MONITORING_PLAN','WATCH_CONFLICT',
  'STRUCTURED_REVISION_CONFLICT','STRUCTURED_MUTATION_CONFLICT','STRUCTURED_ADAPTER_CONFLICT','STRUCTURED_PERSISTENCE_UNAVAILABLE']);
const readBody = async request => {
  let value = request.body;
  if (value === undefined) {
    let bytes = 0; const chunks = [];
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk); bytes += buffer.length;
      if (bytes > MAX_BODY_BYTES) throw authorizationError('INVALID_BODY',413);
      chunks.push(buffer);
    }
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw authorizationError('INVALID_BODY',400); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.byteLength(JSON.stringify(value)) > MAX_BODY_BYTES) throw authorizationError('INVALID_BODY',400);
  if (value.action === 'monitoring') {
    if (Object.keys(value).sort().join(',') !== 'action,active,expectedRevision,watchId'
      || !uuid.test(value.watchId) || typeof value.active !== 'boolean'
      || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 1) throw authorizationError('INVALID_BODY',400);
    return value;
  }
  const required = ['action','watchId','operation','mutationId','expectedRevision','title'];
  const payload = value.action === 'issue' ? ['interpretation','plan'] : value.action === 'confirm' ? ['token','definition'] : [];
  const allowed = [...required,...payload,...(value.action === 'issue' ? ['category','whyFollowing'] : [])];
  if (!payload.length || ![...required,...payload].every(key => Object.hasOwn(value,key)) || Object.keys(value).some(key => !allowed.includes(key))
    || !uuid.test(value.watchId) || !uuid.test(value.mutationId) || !['create','update'].includes(value.operation)
    || !Number.isSafeInteger(value.expectedRevision) || (value.operation === 'create' ? value.expectedRevision !== 0 : value.expectedRevision < 1)
    || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200
    || /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value.title)) throw authorizationError('INVALID_BODY',400);
  return value;
};
export const createStructuredWatchMiddleware = ({ env = process.env, authenticate = authenticateSupabaseRequest,
  serviceClient, resolveRole = resolveCurrentRole, now = Date.now, creationOnly = false, ...options } = {}) => async (request,response,next) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname !== '/api/structured-watches') return next?.();
  const send = (status,body) => {
    response.statusCode = status;
    response.setHeader('Content-Type','application/json'); response.setHeader('Cache-Control','no-store, private');
    response.end(JSON.stringify(body));
  };
  if (env.STRUCTURED_WATCH_BACKEND_ENABLED !== 'true') return send(404,{code:'STRUCTURED_BACKEND_DISABLED'});
  if (!structuredCreationEnabled(env)) return send(404,{code:'STRUCTURED_FEATURE_UNAVAILABLE'});
  if (!['GET','POST'].includes(request.method)) return send(405,{code:'METHOD_NOT_ALLOWED'});
  if (url.search) return send(400,{code:'INVALID_BODY'});
  try {
    const { user, client } = await authenticate(request,{env,...options});
    requireStructuredCreationAccess(user,env);
    if (request.method === 'GET') return send(200,{enabled:true,monitoringEnabled:env.STRUCTURED_MEDIA_SCHEDULED_ENABLED === 'true',...(pilotEnabled(env)&&user.id===PILOT_OWNER?{v3Pilot:true}:{})});
    const body = await readBody(request);
    if (body.action === 'monitoring') {
      // Authenticated owner and the exact Staging rollout gates are authoritative.
      // Pausing remains available even when scheduled execution is disabled.
      if (body.active && env.STRUCTURED_MEDIA_SCHEDULED_ENABLED !== 'true') throw authorizationError('STRUCTURED_FEATURE_UNAVAILABLE',409);
      const {data:rows,error:readError} = await client.from('watches').select('id,watch_definition,monitoring_source,media_revision')
        .eq('id',body.watchId).eq('user_id',user.id).is('deleted_at',null).range(0,0);
      if (readError) throw authorizationError('STRUCTURED_PERSISTENCE_UNAVAILABLE',503);
      const row = rows?.[0];
      if (!row || row.media_revision !== body.expectedRevision) throw authorizationError('WATCH_CONFLICT',409);
      const definition = validateWatchDefinition(row.watch_definition,row.monitoring_source);
      if (definition.plan.domain !== 'media_news' || definition.plan.adapter !== 'google_news_literal_v1') throw authorizationError('STRUCTURED_ADAPTER_CONFLICT',422);
      const service = serviceClient || createSupabaseServiceClient({env,...options});
      const {data,error} = await service.rpc('set_structured_media_monitoring',{
        p_watch_id:body.watchId,p_owner:user.id,p_revision:body.expectedRevision,p_active:body.active,p_interval_seconds:86400,
      });
      if (error) throw authorizationError('STRUCTURED_PERSISTENCE_UNAVAILABLE',503);
      if (data !== true) throw authorizationError('WATCH_CONFLICT',409);
      return send(200,{id:body.watchId,ownerId:user.id,revision:body.expectedRevision+1,monitoringState:body.active?'monitoring':'paused'});
    }
    const config = authorizationConfiguration(env);
    if (creationOnly && body.operation !== 'create') throw authorizationError('INVALID_BODY',400);
    let definition;
    if (body.action === 'issue') {
      let interpretation;
      try { interpretation = validateInterpretation(body.interpretation); }
      catch { throw authorizationError('INVALID_STRUCTURED_INTERPRETATION',422); }
      if(body.plan?.criteria?.roleResolution){
        const r=body.plan.criteria.roleResolution,intent=roleDevelopmentIntent(interpretation);
        if(!intent)throw authorizationError('INVALID_MONITORING_PLAN',422);
        const current=await resolveRole(intent);
        if(current.personId!==r.personId||JSON.stringify(current.names)!==JSON.stringify(r.names)||current.sourceUrl!==r.sourceUrl
          ||now()-Date.parse(r.verifiedAt)>3600000||Date.parse(r.verifiedAt)>now())throw authorizationError('INVALID_MONITORING_PLAN',422);
      }
      let plan;
      try { plan = validateCompiledMonitoringPlan(body.plan,interpretation,{structured:true}); }
      catch (error) { throw authorizationError(error.code === 'MONITORING_PLAN_NOT_SUPPORTED' ? error.code : 'INVALID_MONITORING_PLAN',422); }
      definition = createWatchDefinition(interpretation,plan,{...(body.category === undefined ? {} : {category:body.category}),...(body.whyFollowing === undefined ? {} : {whyFollowing:body.whyFollowing})});
      if (body.operation === 'update') {
        const {data,error} = await client.from('watches').select('watch_definition,monitoring_source,monitoring_state')
          .eq('id',body.watchId).eq('user_id',user.id).is('deleted_at',null).range(0,0);
        if (error) throw authorizationError('STRUCTURED_PERSISTENCE_UNAVAILABLE',503);
        if (!data?.[0] || !['paused','preparing'].includes(data[0].monitoring_state)) throw authorizationError('WATCH_CONFLICT',409);
        const previous = validateWatchDefinition(data[0].watch_definition,data[0].monitoring_source);
        if (previous.plan.adapter !== definition.plan.adapter || (previous.plan.domain === 'official_company'
          && previous.plan.criteria.siren !== definition.plan.criteria.siren)) throw authorizationError('STRUCTURED_ADAPTER_CONFLICT',409);
      }
    } else definition = validateWatchDefinition(body.definition);
    if (creationOnly && definition.plan.adapter !== 'google_news_literal_v1') throw authorizationError('STRUCTURED_ADAPTER_CONFLICT',422);
    const source = structuredMonitoringSource(definition.plan.criteria);
    const bindings = authorizationBindings({ownerId:user.id,watchId:body.watchId,operation:body.operation,
      mutationId:body.mutationId,expectedRevision:body.expectedRevision,title:body.title,definition,source});
    if (body.action === 'issue') return send(200,{...issuePlanAuthorization(bindings,config,now()),definition,source,executable:false});
    verifyPlanAuthorization(body.token,bindings,config,now());
    const service = serviceClient || createSupabaseServiceClient({env,...options});
    const {data,error} = await service.rpc(mediaDailyDigestEnabled(env) ? 'persist_structured_watch_with_digest' : 'persist_structured_watch_v1',{
      p_owner:user.id,p_id:body.watchId,p_operation:body.operation,p_mutation:body.mutationId,p_revision:body.expectedRevision,
      p_title:body.title,p_source:source,p_definition:definition,p_definition_fingerprint:bindings.definitionFingerprint,p_payload_fingerprint:bindings.payloadFingerprint,
    });
    if (error) {
      if (error.code === 'PT409') throw authorizationError(['STRUCTURED_REVISION_CONFLICT','STRUCTURED_MUTATION_CONFLICT','STRUCTURED_ADAPTER_CONFLICT'].includes(error.message) ? error.message : 'WATCH_CONFLICT',409);
      if (error.code === '23505') throw authorizationError('WATCH_CONFLICT',409);
      if (error.code === 'PT422') throw authorizationError('INVALID_WATCH_DEFINITION',422);
      throw authorizationError('STRUCTURED_PERSISTENCE_UNAVAILABLE',503);
    }
    if (!data || data.id !== body.watchId || data.ownerId !== user.id || data.mutationId !== body.mutationId
      || data.operation !== body.operation || data.expectedRevision !== body.expectedRevision || !Number.isSafeInteger(data.revision) || data.revision < 1
      || data.definitionFingerprint !== bindings.definitionFingerprint || data.payloadFingerprint !== bindings.payloadFingerprint
      || data.monitoringState !== 'paused') throw authorizationError('STRUCTURED_PERSISTENCE_UNAVAILABLE',503);
    return send(200,{receipt:data,executable:false});
  } catch (error) {
    const code = error.code === 'SERVER_CONFIGURATION_ERROR' ? 'SERVER_NOT_CONFIGURED' : safeCodes.has(error.code) ? error.code : 'STRUCTURED_PERSISTENCE_UNAVAILABLE';
    const status = code === 'STRUCTURED_PERSISTENCE_UNAVAILABLE' || code === 'SERVER_NOT_CONFIGURED' ? 503
      : error.statusCode || (['INVALID_MONITORING_PLAN','MONITORING_PLAN_NOT_SUPPORTED','INVALID_WATCH_DEFINITION','UNSUPPORTED_WATCH_VERSION','WATCH_SOURCE_MISMATCH'].includes(code) ? 422 : 400);
    return send(status,{code}); // No tokens, requests, provider responses or SQL details are logged or returned.
  }
};

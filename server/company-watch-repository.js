import { applyFeedCheckResult } from '../src/js/watch-monitoring.js';
import { deriveCompanyStatus } from '../src/js/company-watch-status.js';
import { normalizeAdministrativeStatus } from '../src/js/company-administrative-status.js';
import { fetchBodaccAnnouncements, normalizeSiren } from './bodacc-api.js';
import { fetchCompanyIdentity } from './company-directory-api.js';

const WATCH_SELECT = '*, company_watch_snapshots(*)';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class CompanyWatchRepositoryError extends Error {
  constructor(code, statusCode, message) {
    super(message);
    this.name = 'CompanyWatchRepositoryError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const validateWatchId = (value) => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new CompanyWatchRepositoryError('INVALID_WATCH_ID', 400, 'The Watch ID is invalid.');
  }
  return value;
};

const cleanText = (value, maxLength, { required = false } = {}) => {
  const text = typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
  if (required && !text) {
    throw new CompanyWatchRepositoryError('INVALID_BODY', 400, 'A required field is missing.');
  }
  return text ? text.slice(0, maxLength) : null;
};

const getSnapshot = (row) => Array.isArray(row?.company_watch_snapshots)
  ? row.company_watch_snapshots[0] || null
  : row?.company_watch_snapshots || null;

export const mapCompanyWatchRow = (row) => {
  if (!row) return null;
  const snapshot = getSnapshot(row);
  const lastChange = row.current_status === 'updated' && row.last_change_item_id ? {
    id: row.last_change_item_id,
    timestamp: row.last_change_published_at || row.last_checked_at,
    publishedAt: row.last_change_published_at,
    detectedAt: row.last_checked_at,
    sourceUrl: row.last_change_url,
    sourceTitle: row.last_change_title,
    sourceName: 'BODACC',
    summary: row.last_change_summary,
    status: 'new',
    rawMonitoringResult: {
      id: row.last_change_item_id,
      eventType: row.last_change_event_type,
      title: row.last_change_title,
      url: row.last_change_url,
      excerpt: row.last_change_summary,
      publishedAt: row.last_change_published_at,
      source: 'BODACC',
      sirens: [row.siren],
    },
  } : null;
  return {
    id: row.id,
    request: row.request || `Monitor company ${row.siren}`,
    whyFollowing: row.summary || '',
    title: row.title,
    inputType: 'company',
    company: {
      siren: row.siren,
      name: row.company_name,
      administrativeStatus: row.administrative_status || 'unknown',
      status: row.company_status || 'unknown',
    },
    monitoringSource: {
      type: 'bodacc', provider: 'dila', siren: row.siren, title: 'BODACC',
      discovery: 'official-company',
    },
    monitoringSnapshot: snapshot ? {
      checkedAt: snapshot.checked_at,
      source: { title: snapshot.source_title, url: snapshot.source_url },
      itemIds: snapshot.item_ids || [],
      items: snapshot.items || [],
    } : null,
    status: row.monitoring_state === 'paused' ? 'paused' : 'watching',
    currentStatus: row.current_status || 'watching',
    monitoringState: row.monitoring_state || 'monitoring',
    monitoringStatus: { state: 'active', reason: null },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastChecked: row.last_checked_at,
    lastCheckOutcome: row.last_check_outcome ? {
      type: row.last_check_outcome,
      checkedAt: row.last_checked_at,
      newItemIds: lastChange ? [lastChange.id] : [],
      candidateItemIds: lastChange ? [lastChange.id] : [],
      diagnostics: {},
    } : null,
    lastCheckResult: row.last_check_outcome ? {
      type: row.last_check_outcome,
      checkedAt: row.last_checked_at,
      newItemIds: lastChange ? [lastChange.id] : [],
      candidateItemIds: lastChange ? [lastChange.id] : [],
      diagnostics: {},
    } : null,
    lastCheckAttempt: row.last_check_error_code
      ? { status: 'failed', attemptedAt: row.updated_at, code: row.last_check_error_code }
      : row.last_checked_at
        ? { status: 'succeeded', attemptedAt: row.last_checked_at, outcome: row.last_check_outcome }
        : null,
    updates: lastChange ? [lastChange] : [],
    candidateUpdates: lastChange ? [{ ...lastChange.rawMonitoringResult, status: 'candidate' }] : [],
    monitoringUpdates: lastChange ? [{ ...lastChange.rawMonitoringResult, status: 'candidate' }] : [],
    unreadUpdateCount: lastChange ? 1 : 0,
    lastUpdated: lastChange?.timestamp || null,
    latestUpdateAt: lastChange ? row.last_checked_at : null,
  };
};

const throwDatabaseError = (error) => {
  if (error?.code === '23505') {
    throw new CompanyWatchRepositoryError(
      'ACTIVE_WATCH_EXISTS', 409, 'An active Company Watch already exists for this SIREN.',
    );
  }
  throw new CompanyWatchRepositoryError('DATABASE_ERROR', 500, 'The Company Watch could not be saved.');
};

const fetchCompanyData = async (siren, options) => {
  const identityPromise = fetchCompanyIdentity(siren, {
    fetchImpl: options.directoryFetchImpl || options.fetchImpl || fetch,
    timeoutMs: options.directoryTimeoutMs,
  }).catch(() => null);
  const [monitoring, company] = await Promise.all([
    fetchBodaccAnnouncements(siren, options),
    identityPromise,
  ]);
  return { ...monitoring, ...(company ? { company } : {}) };
};

export const createCompanyWatchRepository = ({ client, user, ...options }) => {
  const get = async (watchId) => {
    validateWatchId(watchId);
    const { data, error } = await client.from('watches').select(WATCH_SELECT)
      .eq('id', watchId).is('deleted_at', null).maybeSingle();
    if (error) throwDatabaseError(error);
    if (!data) throw new CompanyWatchRepositoryError('WATCH_NOT_FOUND', 404, 'The Company Watch was not found.');
    return mapCompanyWatchRow(data);
  };

  const list = async () => {
    const { data, error } = await client.from('watches').select(WATCH_SELECT)
      .eq('type', 'company_bodacc').is('deleted_at', null).order('created_at');
    if (error) throwDatabaseError(error);
    return (data || []).map(mapCompanyWatchRow);
  };

  const completeCheck = async (watch, response) => {
    const result = applyFeedCheckResult(watch, response, { trustedSourceType: 'bodacc' });
    const latestChange = result.matchedItems[0] || null;
    const companyName = cleanText(
      result.changes.company?.name || response.company?.officialName || watch.company?.name,
      200,
    );
    const administrativeStatus = normalizeAdministrativeStatus(
      result.changes.company?.administrativeStatus || response.company?.administrativeStatus,
    );
    const companyStatus = result.changes.company?.status
      || deriveCompanyStatus(response.items, watch.company?.status);
    const { error } = await client.rpc('complete_company_watch_check', {
      p_watch_id: watch.id,
      p_checked_at: result.changes.monitoringSnapshot.checkedAt,
      p_source_title: result.changes.monitoringSnapshot.source?.title,
      p_source_url: result.changes.monitoringSnapshot.source?.url,
      p_item_ids: result.changes.monitoringSnapshot.itemIds,
      p_items: result.changes.monitoringSnapshot.items,
      p_company_name: companyName,
      p_administrative_status: administrativeStatus,
      p_company_status: companyStatus,
      p_outcome: result.outcome,
      p_current_status: latestChange ? 'updated' : 'watching',
      p_last_change_item_id: latestChange?.id || null,
      p_last_change_title: latestChange?.title || null,
      p_last_change_url: latestChange?.url || null,
      p_last_change_summary: latestChange?.excerpt || null,
      p_last_change_event_type: latestChange?.eventType || null,
      p_last_change_published_at: latestChange?.publishedAt || null,
    });
    if (error) throwDatabaseError(error);
    return { watch: await get(watch.id), result };
  };

  const create = async (input) => {
    const siren = normalizeSiren(input.siren);
    const title = cleanText(input.title, 200, { required: true });
    const request = cleanText(input.request, 500) || `Monitor company ${siren}`;
    const summary = cleanText(input.summary, 1000);
    const companyName = cleanText(input.companyName, 200);
    const { data, error } = await client.from('watches').insert({
      user_id: user.id,
      type: 'company_bodacc',
      title,
      siren,
      request,
      summary,
      company_name: companyName,
      administrative_status: 'unknown',
      company_status: 'unknown',
      monitoring_state: 'preparing',
      current_status: 'watching',
      check_started_at: new Date().toISOString(),
    }).select(WATCH_SELECT).single();
    if (error) throwDatabaseError(error);
    const provisional = mapCompanyWatchRow(data);
    try {
      const response = await fetchCompanyData(siren, options);
      return await completeCheck(provisional, response);
    } catch (cause) {
      await client.from('watches').update({
        deleted_at: new Date().toISOString(), check_started_at: null,
      }).eq('id', provisional.id);
      throw cause;
    }
  };

  const update = async (watchId, input) => {
    validateWatchId(watchId);
    const changes = {};
    if (Object.hasOwn(input, 'title')) changes.title = cleanText(input.title, 200, { required: true });
    if (Object.hasOwn(input, 'summary')) changes.summary = cleanText(input.summary, 1000);
    if (Object.hasOwn(input, 'monitoringState')) {
      if (!['monitoring', 'paused'].includes(input.monitoringState)) {
        throw new CompanyWatchRepositoryError('INVALID_BODY', 400, 'The monitoring state is invalid.');
      }
      changes.monitoring_state = input.monitoringState;
      changes.current_status = input.monitoringState === 'paused' ? 'paused' : 'watching';
    }
    if (!Object.keys(changes).length) {
      throw new CompanyWatchRepositoryError('INVALID_BODY', 400, 'No supported changes were provided.');
    }
    const { data, error } = await client.from('watches').update(changes)
      .eq('id', watchId).is('deleted_at', null).select(WATCH_SELECT).maybeSingle();
    if (error) throwDatabaseError(error);
    if (!data) throw new CompanyWatchRepositoryError('WATCH_NOT_FOUND', 404, 'The Company Watch was not found.');
    return mapCompanyWatchRow(data);
  };

  const remove = async (watchId) => {
    validateWatchId(watchId);
    const { data, error } = await client.from('watches').update({
      deleted_at: new Date().toISOString(), check_started_at: null,
    }).eq('id', watchId).is('deleted_at', null).select('id').maybeSingle();
    if (error) throwDatabaseError(error);
    if (!data) throw new CompanyWatchRepositoryError('WATCH_NOT_FOUND', 404, 'The Company Watch was not found.');
  };

  const check = async (watchId) => {
    const watch = await get(watchId);
    const { data: claimed, error: claimError } = await client.rpc('claim_company_watch_check', {
      p_watch_id: watch.id,
    });
    if (claimError) throwDatabaseError(claimError);
    if (!claimed) {
      throw new CompanyWatchRepositoryError('CHECK_IN_PROGRESS', 409, 'A check is already in progress.');
    }
    try {
      const response = await fetchCompanyData(watch.company.siren, options);
      return await completeCheck(watch, response);
    } catch (cause) {
      await client.rpc('fail_company_watch_check', {
        p_watch_id: watch.id,
        p_error_code: cause?.code || 'CHECK_FAILED',
      });
      throw cause;
    }
  };

  return { list, get, create, update, remove, check };
};

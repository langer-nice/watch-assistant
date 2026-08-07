import he from 'he';
import { fetchCompanyIdentity } from './company-directory-api.js';

export const BODACC_API_ORIGIN = 'https://bodacc-datadila.opendatasoft.com';
export const BODACC_DATASET = 'annonces-commerciales';
export const BODACC_PAGE_LIMIT = 100;
export const BODACC_TIMEOUT_MS = 8_000;
export const CHECK_COMPANY_ENDPOINT = '/api/check-company';

const MAX_TITLE_LENGTH = 300;
const MAX_EXCERPT_LENGTH = 500;
const MAX_AUTHOR_LENGTH = 300;
const MAX_REQUEST_BYTES = 4 * 1024;

export class BodaccError extends Error {
  constructor(code, statusCode, clientMessage, message = clientMessage, options) {
    super(message, options);
    this.name = 'BodaccError';
    this.code = code;
    this.statusCode = statusCode;
    this.clientMessage = clientMessage;
  }

  toJSON() {
    return { code: this.code, error: this.clientMessage };
  }
}

const cleanText = (value, maxLength) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = he.decode(String(value))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, maxLength) : null;
};

const isLuhnValid = (value) => {
  const sum = [...value].reduce((total, digit, index) => {
    const number = Number(digit);
    const product = index % 2 === 1 ? number * 2 : number;
    return total + (product > 9 ? product - 9 : product);
  }, 0);
  return sum % 10 === 0;
};

const getRecordSirens = (value) => {
  const registryValues = Array.isArray(value) ? value : [value];
  const sirens = registryValues.flatMap((registryValue) => (
    typeof registryValue === 'string' || typeof registryValue === 'number'
      ? String(registryValue).match(/\d(?:[\s\u00a0\u202f]*\d){8}/gu) || []
      : []
  )).map((candidate) => candidate.replace(/[\s\u00a0\u202f]/gu, ''))
    .filter((candidate) => /^\d{9}$/.test(candidate) && isLuhnValid(candidate));
  return [...new Set(sirens)];
};

export const normalizeSiren = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new BodaccError('INVALID_SIREN', 400, 'SIREN must contain exactly 9 digits.');
  }
  const siren = String(value).replace(/\s/g, '');
  if (!/^\d{9}$/.test(siren) || !isLuhnValid(siren)) {
    throw new BodaccError('INVALID_SIREN', 400, 'SIREN must be a valid 9-digit identifier.');
  }
  return siren;
};

export const createBodaccRequestUrl = (siren) => {
  const normalizedSiren = normalizeSiren(siren);
  const url = new URL(
    `/api/explore/v2.1/catalog/datasets/${BODACC_DATASET}/records`,
    BODACC_API_ORIGIN,
  );
  url.searchParams.set('refine', `registre:"${normalizedSiren}"`);
  url.searchParams.set('order_by', 'dateparution desc,id desc');
  url.searchParams.set('limit', String(BODACC_PAGE_LIMIT));
  url.searchParams.set('offset', '0');
  return url;
};

const parseNestedJson = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const firstText = (...values) => values
  .map((value) => cleanText(value, MAX_EXCERPT_LENGTH))
  .find(Boolean) || null;

const normalizeClassificationText = (...values) => values
  .map((value) => cleanText(value, MAX_EXCERPT_LENGTH))
  .filter(Boolean)
  .join(' ')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const classifyBodaccBusinessEvent = (record) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'unknown_change';

  const judgement = parseNestedJson(record.jugement);
  const act = parseNestedJson(record.acte);
  const modification = parseNestedJson(record.modificationsgenerales);
  const deposit = parseNestedJson(record.depot);
  const radiation = parseNestedJson(record.radiationaurcs);
  const family = normalizeClassificationText(record.familleavis, record.familleavis_lib);
  const judgementNature = normalizeClassificationText(judgement?.nature);
  const judgementComplement = normalizeClassificationText(judgement?.complementJugement);
  const liquidationOpened = (
    /\bjugement (?:d ouverture (?:d une procedure de |de )?|prononcant |de conversion en )liquidation judiciaire\b/u
      .test(judgementNature)
    || /\b(?:ouvre|ouverture de|prononce) (?:une procedure de |la )?liquidation judiciaire\b/u
      .test(judgementComplement)
  );
  const receivershipOpened = (
    /\bjugement d ouverture d une procedure de redressement judiciaire\b/u
      .test(judgementNature)
    || /\b(?:ouvre|ouverture d une procedure de|prononce l ouverture d une procedure de) redressement judiciaire\b/u
      .test(judgementComplement)
  );
  const judicialProceedingsOpened = (
    /\bjugement d ouverture d une procedure de sauvegarde\b/u.test(judgementNature)
    || /\b(?:ouvre|ouverture d une procedure de) sauvegarde\b/u.test(judgementComplement)
  );

  if (liquidationOpened) return 'judicial_liquidation';
  if (receivershipOpened) return 'receivership';
  if (judicialProceedingsOpened) return 'judicial_proceedings';
  if (deposit || /\b(?:dpc|depot des comptes)\b/u.test(family)) return 'accounts_filed';
  if (radiation || /\bradiation(?:s)?\b/u.test(family)) return 'company_struck_off';
  if (act?.vente || /\b(?:vente|ventes et cessions)\b/u.test(family)) return 'business_sale';
  if (
    act?.creation
    || /\b(?:creation|immatriculation|immatriculations)\b/u.test(family)
  ) return 'company_created';

  const changeText = normalizeClassificationText(
    modification?.descriptif,
    act?.descriptif,
  );
  if (/\bdissolution\b/u.test(changeText)) return 'company_dissolved';

  const candidates = new Set();
  if (
    /\baugmentation\b[^.]{0,100}\bcapital\b/u.test(changeText)
    || /\bcapital\b[^.]{0,100}\baugmentation\b/u.test(changeText)
  ) candidates.add('capital_increase');
  if (
    /\breduction\b[^.]{0,100}\bcapital\b/u.test(changeText)
    || /\bcapital\b[^.]{0,100}\breduction\b/u.test(changeText)
  ) candidates.add('capital_reduction');
  if (/\b(?:administration|representant|dirigeant|gerant|president)\b/u.test(changeText)) {
    candidates.add('director_change');
  }
  if (
    /\btransfert\b[^.]{0,80}\bsiege\b/u.test(changeText)
    || /\bsiege(?: social)?\b[^.]{0,80}\b(?:transfert|adresse|deplace)\b/u.test(changeText)
  ) candidates.add('registered_office_change');

  return candidates.size === 1 ? [...candidates][0] : 'unknown_change';
};

const getAnnouncementExcerpt = (record) => {
  const modification = parseNestedJson(record.modificationsgenerales);
  const judgement = parseNestedJson(record.jugement);
  const act = parseNestedJson(record.acte);
  const deposit = parseNestedJson(record.depot);
  const miscellaneous = parseNestedJson(record.divers);

  return firstText(
    modification?.descriptif,
    judgement?.nature && judgement?.complementJugement
      ? `${judgement.nature}. ${judgement.complementJugement}`
      : judgement?.nature || judgement?.complementJugement,
    act?.descriptif,
    act?.creation?.categorieCreation,
    deposit?.typeDepot && deposit?.dateCloture
      ? `${deposit.typeDepot} · clôture ${deposit.dateCloture}`
      : deposit?.typeDepot,
    record.radiationaurcs ? 'Radiation au registre du commerce et des sociétés.' : null,
    miscellaneous?.descriptif,
    record.familleavis_lib,
  );
};

const normalizeOfficialUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname === 'www.bodacc.fr' ? url.href : null;
  } catch {
    return null;
  }
};

const normalizePublicationDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date.toISOString();
};

export const normalizeBodaccAnnouncement = (record) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new BodaccError('MALFORMED_RESPONSE', 502, 'BODACC returned an invalid response.');
  }
  const id = cleanText(record.id, 1_000);
  const publishedAt = normalizePublicationDate(record.dateparution);
  if (!id || !publishedAt) {
    throw new BodaccError('MALFORMED_RESPONSE', 502, 'BODACC returned an invalid response.');
  }

  const family = cleanText(record.familleavis_lib, MAX_TITLE_LENGTH) || 'Annonce BODACC';
  const merchant = cleanText(record.commercant, MAX_TITLE_LENGTH);
  return {
    id,
    sirens: getRecordSirens(record.registre),
    eventType: classifyBodaccBusinessEvent(record),
    title: cleanText(merchant ? `${family} · ${merchant}` : family, MAX_TITLE_LENGTH),
    url: normalizeOfficialUrl(record.url_complete),
    publishedAt,
    source: 'BODACC',
    author: cleanText(record.tribunal, MAX_AUTHOR_LENGTH),
    excerpt: getAnnouncementExcerpt(record) || family,
  };
};

const validateBodaccResponse = (value) => {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || !Number.isInteger(value.total_count)
    || value.total_count < 0
    || !Array.isArray(value.results)
    || value.results.length > BODACC_PAGE_LIMIT
  ) {
    throw new BodaccError('MALFORMED_RESPONSE', 502, 'BODACC returned an invalid response.');
  }
  return value.results;
};

export const fetchBodaccAnnouncements = async (siren, {
  fetchImpl = fetch,
  timeoutMs = BODACC_TIMEOUT_MS,
  now = () => new Date(),
} = {}) => {
  const requestUrl = createBodaccRequestUrl(siren);
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new BodaccError('TIMEOUT', 504, 'The BODACC request timed out.'));
    }, timeoutMs);
  });

  try {
    let response;
    try {
      response = await Promise.race([
        fetchImpl(requestUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'WatchAssistantPrototype/1.0',
          },
          redirect: 'error',
          signal: controller.signal,
        }),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof BodaccError) throw error;
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new BodaccError('TIMEOUT', 504, 'The BODACC request timed out.');
      }
      throw new BodaccError(
        'NETWORK_ERROR',
        502,
        'BODACC could not be reached.',
        'The upstream BODACC request failed.',
        { cause: error },
      );
    }

    if (!response || typeof response.ok !== 'boolean') {
      throw new BodaccError('MALFORMED_RESPONSE', 502, 'BODACC returned an invalid response.');
    }
    if (!response.ok) {
      throw new BodaccError(
        'UPSTREAM_ERROR',
        502,
        'BODACC could not complete the request.',
        `BODACC returned HTTP ${Number(response.status) || 'error'}.`,
      );
    }

    let body;
    try {
      body = await Promise.race([response.json(), timeout]);
    } catch (error) {
      if (error instanceof BodaccError) throw error;
      throw new BodaccError(
        'MALFORMED_RESPONSE',
        502,
        'BODACC returned an invalid response.',
        undefined,
        { cause: error },
      );
    }
    const results = validateBodaccResponse(body);
    return {
      source: {
        title: 'BODACC',
        url: 'https://www.bodacc.fr/',
      },
      checkedAt: now().toISOString(),
      items: results.map(normalizeBodaccAnnouncement),
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const readJsonBody = async (request) => {
  if (request.body !== undefined) {
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      throw new BodaccError('INVALID_BODY', 400, 'The request body must be a JSON object.');
    }
    if (Buffer.byteLength(JSON.stringify(request.body)) > MAX_REQUEST_BYTES) {
      throw new BodaccError('INVALID_BODY', 400, 'The request body is too large.');
    }
    return request.body;
  }

  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
      throw new BodaccError('INVALID_BODY', 400, 'The request body is too large.');
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(body || '');
  } catch (error) {
    throw new BodaccError(
      'INVALID_BODY',
      400,
      'The request body must be valid JSON.',
      undefined,
      { cause: error },
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BodaccError('INVALID_BODY', 400, 'The request body must be a JSON object.');
  }
  return parsed;
};

const sendJson = (response, statusCode, body) => {
  if (typeof response.status === 'function' && typeof response.json === 'function') {
    response.status(statusCode).json(body);
    return;
  }
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
};

const toBodaccError = (error) => (
  error instanceof BodaccError
    ? error
    : new BodaccError('INTERNAL_ERROR', 500, 'The company could not be checked.')
);

export const createCheckCompanyMiddleware = (options = {}) => (
  async (request, response, next) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname !== CHECK_COMPANY_ENDPOINT) {
      next?.();
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const siren = normalizeSiren(body.siren);
      const identityPromise = fetchCompanyIdentity(siren, {
        fetchImpl: options.directoryFetchImpl || options.fetchImpl || fetch,
        timeoutMs: options.directoryTimeoutMs,
      }).catch(() => null);
      const [bodacc, company] = await Promise.all([
        fetchBodaccAnnouncements(siren, options),
        identityPromise,
      ]);
      sendJson(response, 200, {
        ...bodacc,
        ...(company ? { company } : {}),
      });
    } catch (cause) {
      const error = toBodaccError(cause);
      console.error(`[Check Company] ${error.code}: ${error.message}`);
      sendJson(response, error.statusCode, error.toJSON());
    }
  }
);

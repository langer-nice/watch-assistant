export const COMPANY_DIRECTORY_ORIGIN = 'https://recherche-entreprises.api.gouv.fr';
export const COMPANY_DIRECTORY_TIMEOUT_MS = 5_000;

const MAX_NAME_LENGTH = 300;

export class CompanyDirectoryError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'CompanyDirectoryError';
    this.code = code;
  }
}

const normalizeSiren = (value) => {
  const siren = typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\s/g, '')
    : '';
  if (!/^\d{9}$/.test(siren)) {
    throw new CompanyDirectoryError('INVALID_SIREN', 'SIREN must contain exactly 9 digits.');
  }
  return siren;
};

const cleanName = (value) => {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  return name ? name.slice(0, MAX_NAME_LENGTH) : null;
};

export const normalizeAdministrativeStatus = (value) => {
  const rawStatus = typeof value === 'string' && value.trim()
    ? value.trim().toUpperCase()
    : null;
  return {
    administrativeStatus: rawStatus === 'A'
      ? 'active'
      : rawStatus === 'C' ? 'ceased' : 'unknown',
    rawStatus,
  };
};

export const createCompanyDirectoryUrl = (siren) => {
  const url = new URL('/search', COMPANY_DIRECTORY_ORIGIN);
  url.searchParams.set('q', normalizeSiren(siren));
  return url;
};

export const normalizeCompanyDirectoryResponse = (value, siren) => {
  const normalizedSiren = normalizeSiren(siren);
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.results)) {
    throw new CompanyDirectoryError('MALFORMED_RESPONSE', 'The company directory returned an invalid response.');
  }
  const company = value.results.find((result) => (
    result && typeof result === 'object' && !Array.isArray(result) && result.siren === normalizedSiren
  ));
  if (!company) return null;

  const { administrativeStatus, rawStatus } = normalizeAdministrativeStatus(
    company.etat_administratif,
  );
  return {
    siren: normalizedSiren,
    officialName: cleanName(company.nom_complet) || cleanName(company.nom_raison_sociale),
    administrativeStatus,
    rawStatus,
    source: 'recherche-entreprises',
  };
};

export const fetchCompanyIdentity = async (siren, {
  fetchImpl = fetch,
  timeoutMs = COMPANY_DIRECTORY_TIMEOUT_MS,
} = {}) => {
  const url = createCompanyDirectoryUrl(siren);
  const controller = new AbortController();
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new CompanyDirectoryError('TIMEOUT', 'The company directory request timed out.'));
    }, timeoutMs);
  });

  try {
    let response;
    try {
      response = await Promise.race([
        fetchImpl(url, {
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
      if (error instanceof CompanyDirectoryError) throw error;
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new CompanyDirectoryError('TIMEOUT', 'The company directory request timed out.');
      }
      throw new CompanyDirectoryError(
        'NETWORK_ERROR',
        'The company directory could not be reached.',
        { cause: error },
      );
    }
    if (!response || typeof response.ok !== 'boolean') {
      throw new CompanyDirectoryError('MALFORMED_RESPONSE', 'The company directory returned an invalid response.');
    }
    if (!response.ok) {
      throw new CompanyDirectoryError('UPSTREAM_ERROR', 'The company directory request failed.');
    }

    let body;
    try {
      body = await Promise.race([response.json(), timeout]);
    } catch (error) {
      if (error instanceof CompanyDirectoryError) throw error;
      throw new CompanyDirectoryError(
        'MALFORMED_RESPONSE',
        'The company directory returned an invalid response.',
        { cause: error },
      );
    }
    return normalizeCompanyDirectoryResponse(body, siren);
  } finally {
    clearTimeout(timeoutId);
  }
};

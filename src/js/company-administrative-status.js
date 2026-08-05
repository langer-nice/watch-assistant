import { normalizeCompanyStatus } from './company-watch-status.js';

const ADMINISTRATIVE_STATUS_VALUES = new Set(['active', 'ceased', 'unknown']);

export const normalizeAdministrativeStatus = (value) => (
  ADMINISTRATIVE_STATUS_VALUES.has(value) ? value : 'unknown'
);

export const normalizeCompanyIdentity = (value, expectedSiren = '') => {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.source !== 'recherche-entreprises'
    || value.siren !== expectedSiren
  ) return null;
  const officialName = typeof value.officialName === 'string' && value.officialName.trim()
    ? value.officialName.replace(/\s+/g, ' ').trim().slice(0, 300)
    : null;
  return {
    siren: expectedSiren,
    officialName,
    administrativeStatus: normalizeAdministrativeStatus(value.administrativeStatus),
    rawStatus: typeof value.rawStatus === 'string' && value.rawStatus.trim()
      ? value.rawStatus.trim().slice(0, 50)
      : null,
    source: 'recherche-entreprises',
  };
};

export const getAdministrativeStatusPresentation = (value, translate = () => '') => {
  const status = normalizeAdministrativeStatus(value);
  return {
    status,
    known: status !== 'unknown',
    label: status === 'unknown' ? '' : translate(`administrativeStatus.labels.${status}`),
    description: status === 'unknown'
      ? ''
      : translate(`administrativeStatus.descriptions.${status}`),
    tone: status === 'active' ? 'stable' : 'error',
  };
};

export const shouldShowCompanyMonitoringStatus = (
  administrativeStatus,
  monitoringStatus,
) => {
  const normalizedMonitoringStatus = normalizeCompanyStatus(monitoringStatus);
  if (normalizedMonitoringStatus === 'unknown') return false;
  return normalizeAdministrativeStatus(administrativeStatus) !== normalizedMonitoringStatus;
};

import { isValidSiren, normalizeSiren } from './company-watch-request.js';

const cleanText = (value) => (
  typeof value === 'string' && value.trim() ? value.replace(/\s+/gu, ' ').trim() : ''
);

export const isCompanyWatch = (watch) => watch?.inputType === 'company';

export const getCompanyWatchIdentity = (watch) => {
  if (!isCompanyWatch(watch)) return null;

  const companySiren = normalizeSiren(watch.company?.siren);
  const sourceSiren = normalizeSiren(watch.monitoringSource?.siren);
  const siren = isValidSiren(companySiren)
    ? companySiren
    : isValidSiren(sourceSiren) ? sourceSiren : '';

  return {
    companyName: cleanText(watch.company?.name) || cleanText(watch.title),
    siren,
  };
};

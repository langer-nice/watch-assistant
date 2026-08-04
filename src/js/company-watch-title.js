const cleanName = (value) => (
  typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim().slice(0, 200) : null
);

export const isGenericCompanyName = (value, siren = '') => {
  const name = cleanName(value);
  if (!name) return true;
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const normalizedSiren = String(siren || '').replace(/\s/g, '');
  return normalized === `company siren ${normalizedSiren}`
    || normalized === `entreprise siren ${normalizedSiren}`;
};

export const normalizeCompanyName = (value, siren = '') => (
  isGenericCompanyName(value, siren) ? null : cleanName(value)
);

export const getCompanyWatchTitle = (watch, {
  storedTitle = '',
  formatFallback = () => '',
} = {}) => {
  if (watch?.inputType !== 'company') return cleanName(storedTitle) || '';
  const siren = typeof watch.company?.siren === 'string' ? watch.company.siren : '';
  const name = normalizeCompanyName(watch.company?.name, siren);
  if (name) return name;
  return /^\d{9}$/.test(siren)
    ? cleanName(formatFallback(siren)) || cleanName(storedTitle) || ''
    : cleanName(storedTitle) || '';
};

export const getOfficialCompanyNameFromBodaccItems = (items) => {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    if (item?.source !== 'BODACC' || typeof item.title !== 'string') continue;
    const separatorIndex = item.title.indexOf(' · ');
    if (separatorIndex < 0) continue;
    const name = normalizeCompanyName(item.title.slice(separatorIndex + 3));
    if (name) return name;
  }
  return null;
};

export const getCompanyNameEnrichment = (watch, items) => {
  if (watch?.inputType !== 'company' || !/^\d{9}$/.test(watch.company?.siren || '')) return null;
  if (normalizeCompanyName(watch.company?.name, watch.company.siren)) return null;
  return getOfficialCompanyNameFromBodaccItems(items);
};

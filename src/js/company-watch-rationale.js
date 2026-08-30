export const LEGACY_COMPANY_NEWS_RATIONALE = 'This Watch will follow relevant future reporting, including major developments and significant follow-up reporting.';

export const isLegacyCompanyNewsRationale = (value) => (
  typeof value === 'string' && value.trim() === LEGACY_COMPANY_NEWS_RATIONALE
);

const cleanIdentityPart = (value) => (
  typeof value === 'string' && value.trim() ? value.trim() : ''
);

export const getCompanyWatchRationale = (watch, translate = () => '') => {
  if (watch?.inputType !== 'company') return null;

  const companyName = cleanIdentityPart(watch.company?.name);
  const siren = cleanIdentityPart(watch.company?.siren);
  const identityKey = companyName && siren
    ? 'detail.companyRationaleIdentityNameAndSiren'
    : companyName
      ? 'detail.companyRationaleIdentityName'
      : siren
        ? 'detail.companyRationaleIdentitySiren'
        : 'detail.companyRationaleIdentityUnknown';
  const companyIdentity = translate(identityKey, { companyName, siren });

  return translate('detail.companyRationale', { companyIdentity });
};

export const getWatchRationalePresentation = (watch, storedValue, translate = () => '') => {
  if (watch?.inputType !== 'company') return storedValue;
  return cleanIdentityPart(storedValue) && !isLegacyCompanyNewsRationale(storedValue)
    ? storedValue
    : getCompanyWatchRationale(watch, translate);
};

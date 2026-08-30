import {
  getCompanyWatchIdentity,
  isCompanyWatch,
} from './company-watch-classification.js';

export const getCompanyWatchRationale = (watch, translate = () => '') => {
  const identity = getCompanyWatchIdentity(watch);
  if (!identity) return null;

  const { companyName, siren } = identity;
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
  if (!isCompanyWatch(watch)) return storedValue;
  return getCompanyWatchRationale(watch, translate);
};

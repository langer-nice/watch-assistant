const BODACC_HOSTNAME = 'www.bodacc.fr';

const normalizeOfficialBodaccUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname === BODACC_HOSTNAME ? url.href : null;
  } catch {
    return null;
  }
};

const belongsToSiren = (item, siren) => {
  const declaredSirens = [
    ...(Array.isArray(item?.sirens) ? item.sirens : []),
    item?.siren,
  ];
  return declaredSirens.some((value) => (
    typeof value === 'string' && value.replace(/[\s\u00a0\u202f]/gu, '') === siren
  ));
};

const getVerifiedPublicationUrl = (item, siren) => {
  if (!belongsToSiren(item, siren)) return null;
  return normalizeOfficialBodaccUrl(item?.sourceUrl || item?.url);
};

export const getCompanyBodaccUrl = (watch) => {
  const siren = watch?.inputType === 'company' && /^\d{9}$/.test(watch.company?.siren || '')
    ? watch.company.siren
    : null;
  if (!siren) return null;

  const items = Array.isArray(watch.monitoringSnapshot?.items)
    ? watch.monitoringSnapshot.items
    : [];
  const updates = Array.isArray(watch.updates) ? [...watch.updates].reverse() : [];
  const publicationUrl = [
    ...updates.map((update) => ({
      ...update?.rawMonitoringResult,
      sourceUrl: update?.sourceUrl,
    })),
    ...items,
  ]
    .map((item) => getVerifiedPublicationUrl(item, siren))
    .find(Boolean);
  if (publicationUrl) return publicationUrl;

  const searchUrl = new URL(
    '/explore/dataset/annonces-commerciales/table/',
    'https://www.bodacc.fr',
  );
  searchUrl.searchParams.set('q', siren);
  return searchUrl.href;
};

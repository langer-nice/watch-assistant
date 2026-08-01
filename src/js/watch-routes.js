export const normalizeWatchId = (watchId) => {
  const value = typeof watchId === 'number' && Number.isFinite(watchId)
    ? String(watchId)
    : watchId;
  return typeof value === 'string' && value.trim() && value.length <= 512 ? value : null;
};

export const CURRENT_UPDATE_FRAGMENT = 'current-situation';

export const getWatchDetailHref = (watchId, { revealLatestUpdate = false } = {}) => {
  const normalizedId = normalizeWatchId(watchId);
  return normalizedId
    ? `watch-detail.html?id=${encodeURIComponent(normalizedId)}${
      revealLatestUpdate ? `#${CURRENT_UPDATE_FRAGMENT}` : ''
    }`
    : null;
};

export const getCreatedWatchDetailHref = (watchId) => {
  const normalizedId = normalizeWatchId(watchId);
  const detailHref = getWatchDetailHref(normalizedId);
  return detailHref
    ? `${detailHref}&watchCreated=${encodeURIComponent(normalizedId)}`
    : null;
};

export const getWatchIdFromLocation = (location) => {
  try {
    const url = new URL(
      typeof location === 'string' ? location : location?.href,
      'https://watch-assistant.local/',
    );
    return normalizeWatchId(url.searchParams.get('id'));
  } catch {
    return null;
  }
};

export const getWatchDetailHref = (watchId) => (
  `watch-detail.html?id=${encodeURIComponent(String(watchId || ''))}`
);

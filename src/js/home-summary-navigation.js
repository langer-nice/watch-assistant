const HOME_STATUS_TARGET_IDS = Object.freeze({
  attention: 'home-needs-attention',
  updated: 'home-updated',
  new: 'home-new',
});

export const getHomeStatusTargetId = (status) => HOME_STATUS_TARGET_IDS[status] || null;

export const getFirstRenderedHomeWatch = (root, status) => (
  getHomeStatusTargetId(status)
    ? root?.querySelector?.(`#${getHomeStatusTargetId(status)}[data-home-watch-status="${status}"]`) || null
    : null
);

export const navigateToHomeWatchStatus = (root, status) => {
  const target = getFirstRenderedHomeWatch(root, status);
  if (!target) return false;

  target.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  target.querySelector?.('.briefing-item__link')?.focus?.({ preventScroll: true });
  return true;
};

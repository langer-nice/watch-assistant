const HOME_STATUSES = new Set(['attention', 'updated']);

export const getFirstRenderedHomeWatch = (root, status) => (
  HOME_STATUSES.has(status)
    ? root?.querySelector?.(`[data-home-watch-status="${status}"]`) || null
    : null
);

export const navigateToHomeWatchStatus = (root, status) => {
  const target = getFirstRenderedHomeWatch(root, status);
  if (!target) return false;

  target.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  target.querySelector?.('.briefing-item__link')?.focus?.({ preventScroll: true });
  return true;
};

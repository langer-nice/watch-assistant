import { getWatchDetailHref, normalizeWatchId } from './watch-routes.js';

const escapeAttribute = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

export const renderWatchCardLink = ({
  watchId,
  className,
  content,
  revealLatestUpdate = false,
}) => {
  const normalizedId = normalizeWatchId(watchId);
  const href = getWatchDetailHref(normalizedId, { revealLatestUpdate });
  if (!normalizedId || !href) return '';
  return `<a class="${escapeAttribute(className)}" data-watch-id="${escapeAttribute(normalizedId)}" href="${escapeAttribute(href)}">${content}</a>`;
};

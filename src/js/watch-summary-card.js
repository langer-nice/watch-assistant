// Shared presentation for real Watch summaries and explicit static examples.
// Callers own navigation; this component has no model, account or storage access.
export const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const hasText = value => typeof value === 'string' && value.trim().length >= 3 && /[\p{L}\p{N}]/u.test(value);

const categoryIcons = new Map([
  ['general', ['layout-grid', '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>']],
  ['travel', ['plane', '<path d="M10 4a2 2 0 0 1 4 0v6l7 4v3l-7-2v3l2 2v1l-4-1-4 1v-1l2-2v-3l-7 2v-3l7-4z"/>']],
  ['news', ['newspaper', '<path d="M6 10H4a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H4"/><path d="M10 7h8v4h-8zM10 14h8m-8 3h5"/>']],
  ['property', ['house', '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-7h6v7"/>']],
  ['price', ['tag', '<path d="M12 3H4a1 1 0 0 0-1 1v8l8 8a2 2 0 0 0 3 0l6-6a2 2 0 0 0 0-3z"/><circle cx="7.5" cy="7.5" r=".5"/>']],
  ['events', ['calendar-days', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01M16 17h.01"/>']],
  ['entertainment', ['square-play', '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m10 8 6 4-6 4z"/>']],
  ['finance', ['chart-no-axes-combined', '<path d="M3 20v-2m5 2v-4m5 4v-5m5 5v-9m4 9V7M3 13l6-5 4 2 8-7m-5 0h5v5"/>']],
]);

const renderCategoryIcon = storedCategory => {
  const [name, paths] = categoryIcons.get(storedCategory) ?? categoryIcons.get('general');
  return `<svg class="category-label__icon" data-category-icon="${name}" aria-hidden="true" focusable="false"
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
};

export const getUpdateSummaryPreview = update => (
  [update?.summary, update?.sourceTitle].find(hasText) || ''
);

export const renderSummaryCard = ({
  title, category, categoryModifier = 'general', storedCategory, statusPresentation = null,
  supportingText = '', clampSummary = false, timestamp = '', historicalResult = null,
  articleId = '', dataAttribute = '', warning = '', renderLink,
}) => {
  const link = renderLink(`
      <div class="briefing-item__header">
        <div class="briefing-item__metadata">
          <span class="category-label category-label--${escapeHtml(categoryModifier)}">${storedCategory === undefined ? '' : renderCategoryIcon(storedCategory)}${escapeHtml(category)}</span>
          ${hasText(timestamp)
    ? `<span class="briefing-item__time">${escapeHtml(timestamp)}</span>`
    : ''}
        </div>
        ${statusPresentation ? `
          <div class="briefing-item__statuses">
            <span class="status-label status-label--${statusPresentation.modifier}">${escapeHtml(statusPresentation.label)}</span>
          </div>
        ` : ''}
      </div>
      <h2>${warning ? '<span class="brief-warning-icon" aria-hidden="true">&#9888;&#65038;</span> ' : ''}${escapeHtml(title)}</h2>
      ${warning ? `<p class="briefing-item__warning">${escapeHtml(warning)}</p>` : ''}
      ${hasText(supportingText) ? `<p${clampSummary ? ' class="briefing-item__summary"' : ''}>${escapeHtml(supportingText)}</p>` : ''}
      ${historicalResult ? `<div class="briefing-item__historical-result">
        <p><strong>${escapeHtml(historicalResult.label)}</strong></p>
        ${hasText(historicalResult.summary) ? `<p>${escapeHtml(historicalResult.summary)}</p>` : ''}
        ${historicalResult.dates.map(date => `<p>${escapeHtml(date.label)} : <time datetime="${escapeHtml(date.value)}">${escapeHtml(date.text)}</time></p>`).join('')}
      </div>` : ''}
    `);
  if (!link) return '';
  return `<article class="briefing-item"${articleId ? ` id="${escapeHtml(articleId)}"` : ''}${dataAttribute}>${link}</article>`;
};

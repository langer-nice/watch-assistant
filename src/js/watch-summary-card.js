// Shared presentation for real Watch summaries and explicit static examples.
// Callers own navigation; this component has no model, account or storage access.
export const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const hasText = value => typeof value === 'string' && value.trim().length >= 3 && /[\p{L}\p{N}]/u.test(value);

export const getUpdateSummaryPreview = update => (
  [update?.summary, update?.sourceTitle].find(hasText) || ''
);

export const renderSummaryCard = ({
  title, category, categoryModifier = 'general', statusPresentation = null,
  supportingText = '', clampSummary = false, timestamp = '', historicalResult = null,
  articleId = '', dataAttribute = '', warning = '', renderLink,
}) => {
  const link = renderLink(`
      <div class="briefing-item__header">
        <div class="briefing-item__metadata">
          <span class="category-label category-label--${escapeHtml(categoryModifier)}">${escapeHtml(category)}</span>
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

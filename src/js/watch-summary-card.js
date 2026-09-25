// Shared presentation for real Watch summaries and explicit static examples.
// Callers own navigation; this component has no model, account or storage access.
export const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const hasText = value => typeof value === 'string' && value.trim().length >= 3 && /[\p{L}\p{N}]/u.test(value);

export const renderSummaryCard = ({
  title, category, categoryModifier = 'general', statusPresentation = null,
  supportingText = '', timestamp = '', articleId = '', dataAttribute = '', renderLink,
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
      <h2>${escapeHtml(title)}</h2>
      ${hasText(supportingText) ? `<p>${escapeHtml(supportingText)}</p>` : ''}
    `);
  if (!link) return '';
  return `<article class="briefing-item"${articleId ? ` id="${escapeHtml(articleId)}"` : ''}${dataAttribute}>${link}</article>`;
};

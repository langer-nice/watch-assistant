import {checkUpdateTargetId} from './check-result-navigation.js';

// Presentation only: copy and order records without changing stored history.
export const renderUpdateHistory = ({items, language, t, escapeHtml, formatTimestamp}) => {
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const day = new Intl.DateTimeFormat(locale, {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const dateKey = new Intl.DateTimeFormat('en-CA', {year:'numeric', month:'2-digit', day:'2-digit'});
  const clock = new Intl.DateTimeFormat(locale, {hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
  const ordered = items.map((item, index) => ({item, index, at:Date.parse(item.timestamp)}))
    .sort((a,b) => (Number.isFinite(b.at)?b.at:-Infinity) - (Number.isFinite(a.at)?a.at:-Infinity) || a.index-b.index);
  const groups = new Map();
  for (const entry of ordered) {
    const date = Number.isFinite(entry.at) ? new Date(entry.at) : null;
    const key = date ? dateKey.format(date) : 'unknown';
    if (!groups.has(key)) groups.set(key, {label:date ? day.format(date) : t('detail.historyDetectionUnknown'), entries:[]});
    groups.get(key).entries.push({...entry,date});
  }
  return [...groups.values()].map(group => `<li class="history-day">
    <h3 class="history-day__heading">${escapeHtml(group.label)}</h3><ul class="history-day__updates">${group.entries.map(({item,date}) => {
      const detected = date ? `<time datetime="${escapeHtml(item.timestamp)}" aria-label="${escapeHtml(t('detail.detectedDate',{date:formatTimestamp(item.timestamp)}))}">${escapeHtml(clock.format(date))}</time>` : escapeHtml(t('detail.historyDetectionUnknown'));
      const publication = item.publishedAt ? t('detail.publishedDate',{date:formatTimestamp(item.publishedAt)}) : '';
      return `<li class="monitoring-update" id="${escapeHtml(checkUpdateTargetId(item.id))}" tabindex="-1">
        <p class="history-update__time"${publication ? ` title="${escapeHtml(publication)}"` : ''}>${detected}</p>
        <h4 class="monitoring-update__title">${escapeHtml(item.title)}</h4>
        <p class="monitoring-update__metadata">${escapeHtml(item.source || '')}${item.source && item.url ? ' · ' : ''}${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('detail.openArticle'))} <span aria-hidden="true">↗</span></a>` : ''}</p>
        ${item.summary ? `<p class="monitoring-update__description">${escapeHtml(item.summary)}</p>` : ''}
      </li>`;
    }).join('')}</ul></li>`).join('');
};

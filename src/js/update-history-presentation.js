import {checkUpdateTargetId} from './check-result-navigation.js';

// Only reconcile the two displayed histories; stored identities and data are untouched.
export const mergeHistoryItems = (updates, events) => {
  const result = [], identities = new Map();
  for (const record of [...updates, ...events]) {
    const keys = [record.articleId && 'article:' + record.articleId, !record.created && record.url && 'url:' + record.url,
      record.eventId && (record.created || (!record.articleId && !record.url)) && 'event:' + record.eventId].filter(Boolean);
    const index = keys.map(key => identities.get(key)).find(value => value !== undefined);
    if (index === undefined) result.push({...record});
    else {
      const existing = result[index];
      for (const [key,value] of Object.entries(record)) if ((existing[key] === undefined || existing[key] === null || existing[key] === '') && value !== undefined) existing[key] = value;
    }
    for (const key of keys) identities.set(key, index === undefined ? result.length - 1 : index);
  }
  return result;
};

// Presentation only: copy and order records without changing stored history.
export const renderUpdateHistory = ({items, language, t, escapeHtml, formatTimestamp, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone}) => {
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const day = new Intl.DateTimeFormat(locale, {timeZone, weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const dateKey = new Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric', month:'2-digit', day:'2-digit'});
  const clock = new Intl.DateTimeFormat(locale, {timeZone, hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
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
      const detected = date ? `<time datetime="${escapeHtml(item.timestamp)}" aria-label="${escapeHtml(t(item.event ? 'detail.historyEventDate' : 'detail.detectedDate',{date:formatTimestamp(item.timestamp)}))}">${escapeHtml(clock.format(date))}</time>` : escapeHtml(item.dateLabel || t('detail.historyTimeUnknown'));
      const publication = item.publishedAt ? t('detail.publishedDate',{date:formatTimestamp(item.publishedAt)}) : '';
      return `<li class="monitoring-update" id="${escapeHtml(checkUpdateTargetId(item.id))}" tabindex="-1">
        <p class="history-update__time"${publication ? ` title="${escapeHtml(publication)}"` : ''}>${detected}</p>
        <h4 class="monitoring-update__title">${escapeHtml(item.title)}</h4>
        ${item.summary ? `<p class="monitoring-update__description">${escapeHtml(item.summary)}</p>` : ''}
        <p class="monitoring-update__metadata">${escapeHtml(item.source || '')}${item.source && item.url ? ' · ' : ''}${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('detail.openArticle'))} <span aria-hidden="true">↗</span></a>` : ''}</p>
      </li>`;
    }).join('')}</ul></li>`).join('');
};

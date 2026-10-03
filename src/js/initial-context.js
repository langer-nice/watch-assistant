import { matchFeedItemToWatch, normalizeFeedUrl } from './watch-monitoring.js';
import { currencyCriteriaFor } from './currency-watch.js';

export const initialContextArticles = watch => {
  const seen = new Set();
  const items = watch?.initialContext?.items;
  return (Array.isArray(items) ? items : []).filter(item => {
    if (!item || typeof item !== 'object') return false;
    const key = item.identityKeys?.[0] || item.id;
    if (!key || seen.has(key) || !matchFeedItemToWatch(item, watch).matched) return false;
    seen.add(key);
    return true;
  });
};

// Context never enters Watch updates, unread state, or notification delivery.
export const renderInitialContext = (root, watch, { t, formatTimestamp }) => {
  if (!root) return;
  root.replaceChildren();
  root.hidden = !watch || watch.inputType === 'company' || Boolean(currencyCriteriaFor(watch))
    || !normalizeFeedUrl(watch.monitoringSource?.url || watch.feedUrl);
  if (root.hidden) return;
  const add = (tag, text, parent = root) => {
    const element = root.ownerDocument.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
  };
  const heading = add('h2', t('detail.initialContextTitle'));
  heading.className = 'section-heading';
  const body = add('div', '');
  body.className = 'detail-card__primary detail-card__field initial-context-body';
  if (!watch.initialContext) {
    add('p', t(watch.lastChecked ? 'detail.initialContextUnavailable' : 'detail.initialContextPending'), body);
    return;
  }
  add('p', t('detail.initialContextCopy', { date: formatTimestamp(watch.initialContext.checkedAt) }), body);
  const articles = initialContextArticles(watch);
  if (!articles.length) { add('p', t('detail.initialContextEmpty'), body); return; }
  const list = add('ul', '', body);
  list.className = 'initial-context-list';
  for (const item of articles) {
    const li = add('li', '', list); li.className = 'monitoring-update';
    const url = normalizeFeedUrl(item.url);
    const title = add(url ? 'a' : 'p', item.title || t('detail.untitledItem'), li);
    title.className = 'monitoring-update__title';
    if (url) { title.href = url; title.target = '_blank'; title.rel = 'noopener noreferrer'; }
    const metadata = [item.source, item.publishedAt ? formatTimestamp(item.publishedAt) : null].filter(Boolean).join(' · ');
    if (metadata) add('p', metadata, li).className = 'monitoring-update__metadata';
    if (item.excerpt && item.excerpt !== item.title) add('p', item.excerpt, li).className = 'monitoring-update__description';
  }
};

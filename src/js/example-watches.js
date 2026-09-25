import { t, translatePage, getLanguage } from './i18n.js';
import { renderSummaryCard, escapeHtml } from './watch-summary-card.js';

// Presentation-only catalog: these IDs are never Watch records.
export const activeExampleIds = Object.freeze(['news', 'company', 'regulation', 'concert', 'competitor', 'court']);
export const comingExampleIds = Object.freeze(['flights', 'price', 'bitcoin']);

const translated = (tag, key, className = '') => {
  const node = document.createElement(tag);
  node.setAttribute('data-i18n', `examples.${key}`);
  node.textContent = t(`examples.${key}`);
  node.className = className;
  return node;
};

// These rows never receive a Watch ID or pass through Watch model/storage code.
export const renderExampleWatches = () => {
  const root = document.querySelector('#exampleWatches');
  if (!root || root.dataset.language === getLanguage()) return;
  const focusedExample = root.contains(document.activeElement)
    ? document.activeElement.getAttribute('data-example-key') : null;
  root.dataset.language = getLanguage();
  root.innerHTML = `<h2 class="section-heading" id="exampleWatchesTitle">${escapeHtml(t('examples.heading'))}</h2>
    <p class="intro">${escapeHtml(t('examples.intro'))}</p>
    <div class="watch-list">${[...activeExampleIds, ...comingExampleIds].map(key => {
      const active = activeExampleIds.includes(key);
      const badge = t(active ? 'examples.badge' : 'examples.soon');
      const title = t(`examples.items.${key}.title`);
      return renderSummaryCard({
        category: badge,
        title,
        supportingText: t(`examples.items.${key}.request`),
        renderLink: content => active
          ? `<a class="briefing-item__link" data-example-key="${key}" href="watch-detail.html?example=${key}" aria-label="${escapeHtml(`${badge} — ${title}`)}">${content}</a>`
          : `<div class="briefing-item__link" data-example-key="${key}" role="group" tabindex="0" aria-disabled="true" aria-label="${escapeHtml(`${badge} — ${title}`)}">${content}</div>`,
      });
    }).join('')}</div>`;
  if (focusedExample) root.querySelector(`[data-example-key="${focusedExample}"]`)?.focus({ preventScroll: true });
};

// An explicit example route never enters the real detail pipeline (acknowledgment,
// monitoring, reports or mutations). Reuse detail layout classes, not Watch records.
export const renderExampleDetail = () => {
  const root = document.querySelector('.page--detail');
  const params = new URLSearchParams(window.location.search);
  if (!root || !params.has('example')) return false;
  const key = params.get('example');
  if (root.dataset.exampleLanguage === getLanguage() && root.dataset.exampleRoute === key) return true;
  const focusCreate = document.activeElement?.hasAttribute('data-example-create');
  const active = activeExampleIds.includes(key);
  const known = active || comingExampleIds.includes(key);
  root.dataset.exampleLanguage = getLanguage();
  root.dataset.exampleRoute = key;
  const markup = `
    <a class="editorial-link" href="watches.html">${escapeHtml(t('examples.back'))}</a>
    <header class="detail-header">
      <p class="category-pill">${escapeHtml(t(active ? 'examples.badge' : 'examples.soon'))}</p>
      <h1>${escapeHtml(t(known ? `examples.items.${key}.title` : 'examples.unavailable'))}</h1>
      <p class="detail-header__message">${escapeHtml(t('examples.intro'))}</p>
    </header>
    ${known ? `<section class="detail-card detail-panel" aria-labelledby="exampleRequestTitle">
      <h2 class="section-heading" id="exampleRequestTitle">${escapeHtml(t('examples.requestLabel'))}</h2>
      <div class="detail-card__primary"><div class="detail-card__field"><p>${escapeHtml(t(`examples.items.${key}.request`))}</p></div></div>
    </section>` : ''}
    ${active ? `<a class="button button--primary" data-example-create href="new-watch.html?example=${key}">${escapeHtml(t('examples.create'))}</a>` : ''}`;
  // Keep the live navigation/auth nodes and their listeners in place.
  [...root.children].filter(child => !child.classList.contains('top-navigation')).forEach(child => child.remove());
  root.insertAdjacentHTML('beforeend', markup);
  if (focusCreate) root.querySelector('[data-example-create]')?.focus({ preventScroll: true });
  return true;
};

// Consume a public catalog ID once; user edits remain exclusively in the existing editor.
export const applyExampleToEditor = (input) => {
  if (!input) return false;
  const url = new URL(window.location.href);
  const id = url.searchParams.get('example');
  if (!id || url.searchParams.has('edit') || !activeExampleIds.includes(id)) return false;
  url.searchParams.delete('example');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  if (input.value.trim()) return false; // Never replace a restored or resumed request.
  input.value = t(`examples.items.${id}.request`);
  const notice = translated('p', 'instruction', 'watch-composer__helper');
  notice.id = `${input.id}ExampleInstruction`;
  input.after(notice);
  input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), notice.id].filter(Boolean).join(' '));
  const cancel = translated('a', 'cancel', 'editorial-link');
  cancel.href = 'watches.html';
  cancel.addEventListener('click', () => { input.value = ''; });
  notice.after(cancel);
  translatePage(input.parentElement);
  input.focus({ preventScroll: true });
  return true;
};

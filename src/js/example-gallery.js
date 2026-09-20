import { t, translatePage } from './i18n.js';

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

export const renderExampleGallery = ({ hasWatches = false } = {}) => {
  const root = document.querySelector('#exampleGallery');
  if (!root) return;
  root.classList.toggle('example-gallery--compact', hasWatches);
  if (root.childElementCount) return; // Preserve expansion and keyboard focus on refresh.
  const heading = translated('h2', 'heading');
  heading.id = 'exampleGalleryTitle';
  root.setAttribute('aria-labelledby', heading.id);
  root.append(heading, translated('p', 'intro', 'example-gallery__intro'));
  const cards = (ids, unavailable) => {
    const grid = document.createElement('div');
    grid.className = 'example-gallery__grid';
    for (const id of ids) {
      const card = document.createElement('article');
      card.className = 'example-gallery__card';
      const badge = translated('span', unavailable ? 'soon' : 'badge', 'example-gallery__badge');
      badge.id = `example-${id}-badge`;
      const title = translated('h3', `items.${id}.title`);
      title.id = `example-${id}-title`;
      card.append(badge, title, translated('p', `items.${id}.request`));
      if (unavailable) {
        card.tabIndex = 0;
        card.setAttribute('aria-disabled', 'true');
        card.setAttribute('aria-labelledby', `${title.id} ${badge.id}`);
      } else {
        const link = translated('a', 'use', 'button button--secondary');
        link.href = `new-watch.html?example=${id}`;
        link.setAttribute('aria-describedby', title.id);
        card.append(link);
      }
      grid.append(card);
    }
    return grid;
  };
  const more = translated('button', 'more', 'button button--secondary');
  more.type = 'button';
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-controls', 'exampleGalleryMore');
  const extra = cards(comingExampleIds, true);
  extra.id = 'exampleGalleryMore';
  extra.hidden = true;
  more.addEventListener('click', () => {
    extra.hidden = !extra.hidden;
    more.setAttribute('aria-expanded', String(!extra.hidden));
  });
  root.append(cards(activeExampleIds, false), more, extra);
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
  cancel.href = 'index.html';
  cancel.addEventListener('click', () => { input.value = ''; });
  notice.after(cancel);
  translatePage(input.parentElement);
  input.focus({ preventScroll: true });
  return true;
};

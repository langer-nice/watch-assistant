import { applyExampleToEditor } from './example-gallery.js';
import { t, translatePage } from './i18n.js';

// Deliberately does not import navigation, analysis, storage, voice or Watch models.
// Only this page's textarea owns the draft. It is never restored or persisted.
export const createGuestEditor = ({ content, onSubmit, onInvalidate }) => {
  const root = document.createElement('section');
  root.dataset.guestEditor = '';
  root.innerHTML = `
    <header class="new-watch-header"><h1 data-i18n="newWatch.heading"></h1></header>
    <form data-guest-form autocomplete="off" class="watch-form">
      <div class="watch-composer">
        <label for="guestWatchInput" class="visually-hidden" data-i18n="newWatch.label"></label>
        <textarea id="guestWatchInput" class="assistant-input" rows="4" required
          autocomplete="off" data-i18n-placeholder="newWatch.placeholder"></textarea>
      </div>
      <button class="button" type="submit" data-i18n="newWatch.submit"></button>
    </form>`;
  const input = root.querySelector('textarea');
  const notice = content.querySelector('#onboardingRequestNotice');
  if (notice) {
    const copy = notice.cloneNode(true);
    copy.id = 'guestOnboardingNotice';
    root.querySelector('.watch-composer').append(copy);
    input.setAttribute('aria-describedby', copy.id);
  }
  content.after(root);
  translatePage(root);
  applyExampleToEditor(input);
  const route = window.location.pathname + window.location.search;
  let active = true;
  const isCurrent = () => active && route === window.location.pathname + window.location.search
    && !new URLSearchParams(window.location.search).has('edit');
  const clear = () => {
    input.value = '';
    input.defaultValue = '';
    input.removeAttribute('value');
    input.disabled = true;
    root.remove();
    active = false;
  };
  const invalidate = () => { clear(); onInvalidate(); };
  const pagehide = () => { if (active) invalidate(); };
  const popstate = () => {
    if (!active) return;
    invalidate();
    window.location.replace('new-watch.html');
  };
  window.addEventListener('pagehide', pagehide);
  window.addEventListener('popstate', popstate);
  root.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    if (!isCurrent()) { invalidate(); return; }
    if (!input.value.trim()) { input.focus(); return; }
    onSubmit(input.value);
  });
  return {
    isCurrent,
    show() { if (isCurrent()) { root.hidden = false; input.focus(); } },
    hide() { root.hidden = true; },
    clear,
    destroy() { clear(); window.removeEventListener('pagehide', pagehide); window.removeEventListener('popstate', popstate); },
  };
};

import { ACCOUNT_STORAGE_CHANGED_EVENT, getAccountEpoch, isAccountStorageResolved } from './account-storage.js';

// A form's DOM, callbacks and pending work belong to exactly one auth epoch.
// Clearing precedes navigation: sign-out may still be waiting for Supabase, and
// pagehide must remove sensitive fields before the browser freezes a document.
export const createEditorSession = ({ form, onInvalidate }) => {
  const epoch = getAccountEpoch();
  const page = form.closest('.page--form') || form;
  let active = true;
  let navigating = false;
  const removers = [];
  const isCurrent = () => active && epoch === getAccountEpoch() && isAccountStorageResolved();
  const invalidate = () => {
    if (!active) return;
    active = false;
    removers.splice(0).forEach(remove => remove());
    onInvalidate();
    // Clear detached controls too, including browser-restored defaults.
    for (const field of page.querySelectorAll('input, textarea, select, button')) {
      if ('value' in field) field.value = '';
      if ('defaultValue' in field) field.defaultValue = '';
      field.removeAttribute('value');
      field.disabled = true;
      field.setCustomValidity?.('');
    }
    page.querySelectorAll('dialog').forEach(dialog => { if (dialog.open) dialog.close(); });
    // Also scrub detached review/error nodes and links held by pending callbacks.
    for (const node of page.querySelectorAll('*')) {
      node.removeAttribute('href');
      node.removeAttribute('src');
      for (const name of Object.keys(node.dataset)) delete node.dataset[name];
      node.replaceChildren();
    }
    page.replaceChildren();
    window.history.replaceState(null, '', 'new-watch.html');
  };
  const restart = () => {
    if (navigating || !isAccountStorageResolved()) return;
    navigating = true;
    window.location.replace('new-watch.html');
  };
  const accountChanged = () => {
    if (isCurrent()) return; // Same-owner token refresh keeps unsaved edits.
    invalidate();
    restart();
  };
  window.addEventListener(ACCOUNT_STORAGE_CHANGED_EVENT, accountChanged);
  window.addEventListener('pagehide', invalidate);
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    invalidate();
    restart();
  });
  const session = {
    isCurrent,
    invalidate,
    listen(target, type, callback, options) {
      if (!target || !isCurrent()) return;
      const guarded = (...args) => { if (isCurrent()) return callback(...args); };
      target.addEventListener(type, guarded, options);
      removers.push(() => target.removeEventListener?.(type, guarded, options));
    },
  };
  if (!isCurrent()) invalidate();
  return session;
};

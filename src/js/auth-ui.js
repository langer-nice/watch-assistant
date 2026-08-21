import { t } from './i18n.js';
import { createSupabaseBrowserClient } from './supabase-client.js';
import { createAuthSession } from './auth-session.js';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const renderAuthState = (root, state) => {
  if (state.status === 'authenticated') {
    root.innerHTML = `
      <p class="auth-menu__email">${escapeHtml(state.session?.user?.email || t('auth.signedIn'))}</p>
      <button class="auth-menu__button" type="button" data-auth-sign-out>${t('auth.signOut')}</button>
    `;
    return;
  }

  if (['loading', 'sending', 'confirming', 'signing-out'].includes(state.status)) {
    const key = state.status === 'confirming'
      ? 'auth.confirming'
      : state.status === 'sending'
        ? 'auth.sending'
        : 'auth.loading';
    root.innerHTML = `<p role="status">${t(key)}</p>`;
    return;
  }

  if (state.status === 'unavailable') {
    root.innerHTML = `<p>${t('auth.unavailable')}</p>`;
    return;
  }

  if (state.status === 'link-sent') {
    root.innerHTML = `
      <p role="status">${t('auth.linkSent')}</p>
      <button class="auth-menu__button" type="button" data-auth-retry>${t('auth.useAnotherEmail')}</button>
    `;
    return;
  }

  root.innerHTML = `
    <form class="auth-menu__form" data-auth-form>
      <label for="authEmail">${t('auth.emailLabel')}</label>
      <input id="authEmail" name="email" type="email" autocomplete="email" required placeholder="${t('auth.emailPlaceholder')}">
      <button class="auth-menu__button" type="submit">${t('auth.sendMagicLink')}</button>
    </form>
    ${state.status === 'error' ? `<p class="auth-menu__error" role="alert">${t('auth.error')} ${escapeHtml(state.error || '')}</p>` : ''}
  `;
};

export const initAuthUi = ({ env = import.meta.env, client: injectedClient } = {}) => {
  const root = document.querySelector('[data-auth-root]');
  if (!root || root.dataset.authInitialized === 'true') return null;

  const { client } = injectedClient
    ? { client: injectedClient }
    : createSupabaseBrowserClient({ env });
  const auth = createAuthSession({ client, location: window.location });
  root.dataset.authInitialized = 'true';

  const render = (state) => renderAuthState(root, state);
  auth.subscribe(render);

  root.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-auth-form]');
    if (!form) return;
    event.preventDefault();
    const email = new FormData(form).get('email');
    await auth.sendMagicLink(String(email || ''));
  });
  root.addEventListener('click', async (event) => {
    if (event.target.closest('[data-auth-sign-out]')) await auth.signOut();
    if (event.target.closest('[data-auth-retry]')) renderAuthState(root, { status: 'anonymous' });
  });
  document.addEventListener('i18n:languageChanged', () => render(auth.getState()));

  const ready = auth.initialize();
  return { auth, client, ready };
};

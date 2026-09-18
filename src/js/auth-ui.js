import { configureAccountStorage, getAccountOwner } from './account-storage.js';
import { getLanguage, t } from './i18n.js';
import { createSupabaseBrowserClient } from './supabase-client.js';
import { createAuthSession } from './auth-session.js';
import { getCallbackReturn, getCreationReturn } from './auth-return.js';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const authErrorKey = (error = '') => {
  if (/rate|too many|429/i.test(error)) return 'auth.rateLimit';
  if (/expired|otp_expired/i.test(error)) return 'auth.expiredLink';
  if (/invalid|access_denied|bad.*(token|code)/i.test(error)) return 'auth.invalidLink';
  return 'auth.error';
};

export const renderAuthState = (root, state) => {
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
    const heading = root.hasAttribute('data-auth-gate-root') ? 'h1' : 'h2';
    root.innerHTML = `
      <div role="status"><${heading} ${heading === 'h1' ? 'id="authGateTitle"' : ''} tabindex="-1">${t('auth.checkEmail')}</${heading}>
      <p class="auth-menu__email">${escapeHtml(t('auth.linkSent', { email: state.submittedEmail || '' }))}</p></div>
      <button class="auth-menu__text-button" type="button" data-auth-retry>${t('auth.useAnotherEmail')}</button>
    `;
    return;
  }

  root.innerHTML = `
    <form class="auth-menu__form" data-auth-form>
      <label for="${root.dataset.authGateRoot !== undefined ? 'gateEmail' : 'authEmail'}">${t('auth.emailLabel')}</label>
      <input id="${root.dataset.authGateRoot !== undefined ? 'gateEmail' : 'authEmail'}" name="email" type="email" autocomplete="email" required placeholder="${t('auth.emailPlaceholder')}">
      <button class="auth-menu__button" type="submit">${t('auth.sendMagicLink')}</button>
    </form>
    ${state.status === 'error' ? `<p class="auth-menu__error" role="alert">${t(authErrorKey(state.error || ''))}</p>` : ''}
  `;
};

export const initAuthUi = ({ env = import.meta.env, client: injectedClient } = {}) => {
  const root = document.querySelector('[data-auth-root]');
  if (root?.dataset.authInitialized === 'true') return null;

  const { client } = injectedClient
    ? { client: injectedClient }
    : createSupabaseBrowserClient({ env });
  const auth = createAuthSession({ client, location: window.location });
  configureAccountStorage(auth);
  const editorContent = document.querySelector('[data-editor-content]');
  let gate = null;
  let waitingForSignIn = false;
  let enteredEditor = false;
  let emailFormOpen = false;
  let redirected = false;
  const returnTo = editorContent ? getCreationReturn(window.location) : getCallbackReturn(window.location);
  if (editorContent) {
    gate = document.createElement('section');
    gate.className = 'auth-gate';
    gate.dataset.authGate = '';
    gate.setAttribute('aria-labelledby', 'authGateTitle');
    editorContent.before(gate);
  }
  const renderGate = (state) => {
    if (!gate || enteredEditor) return;
    const busy = ['loading', 'confirming', 'signing-out'].includes(state.status);
    gate.innerHTML = `
      ${state.status === 'link-sent' ? '' : `<h1 id="authGateTitle">${t('auth.gateTitle')}</h1>
      <p>${t('auth.gateExplanation')}</p>`}
      ${emailFormOpen || busy || ['link-sent', 'sending', 'error', 'unavailable'].includes(state.status)
        ? '<div data-auth-root data-auth-gate-root></div>'
        : `<button class="auth-menu__button" type="button" data-auth-continue>${t('auth.continueEmail')}</button>`}
      <a class="auth-menu__text-button" href="flow-3.html?lang=${getLanguage()}">${t('auth.seeHow')}</a>`;
    const gateRoot = gate.querySelector('[data-auth-root]');
    if (gateRoot) renderAuthState(gateRoot, state);
  };
  const render = (state) => {
    const trigger = document.querySelector('[data-profile-trigger]');
    const label = trigger?.querySelector('[data-auth-label]');
    if (label) {
      label.textContent = state.status === 'authenticated' ? '' : t('auth.signIn');
      trigger.classList.toggle('top-navigation__sign-in', state.status !== 'authenticated');
      trigger.setAttribute('aria-label', state.status === 'authenticated' ? t('topNavigation.openProfile') : t('auth.signIn'));
    }
    if (root) renderAuthState(root, state);
    if (state.status === 'error' && !gate) {
      const menu = document.querySelector('[data-profile-menu]');
      if (menu) menu.hidden = false;
      trigger?.setAttribute('aria-expanded', 'true');
    }
    renderGate(state);
    if (!redirected && getAccountOwner() && (waitingForSignIn || (!editorContent && returnTo))) {
      redirected = true;
      window.location.replace(returnTo || 'new-watch.html');
    }
  };
  if (root) root.dataset.authInitialized = 'true';
  auth.subscribe(render);
  // Both the account menu and route gate use the same state and event handling.
  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-auth-form]');
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const email = form.querySelector('[name="email"]').value;
    const inGate = Boolean(form.closest('[data-auth-gate]'));
    await auth.sendMagicLink(email, { returnTo, language: getLanguage() });
    if (auth.getState().status === 'link-sent') (inGate ? gate : root)?.querySelector('h1, h2')?.focus();
  });
  document.addEventListener('click', async (event) => {
    if (event.target.closest('[data-auth-sign-out]')) await auth.signOut();
    if (event.target.closest('[data-auth-continue]')) {
      waitingForSignIn = true;
      emailFormOpen = true;
      renderGate(auth.getState());
      gate.querySelector('[name="email"]')?.focus();
    }
    if (event.target.closest('[data-auth-retry]')) {
      const inGate = Boolean(event.target.closest('[data-auth-gate]'));
      auth.resetEmail();
      (inGate ? gate : root)?.querySelector('[name="email"]')?.focus();
    }
  });
  document.addEventListener('i18n:languageChanged', () => render(auth.getState()));

  const ready = auth.initialize();
  return {
    auth, client, ready,
    canEnterEditor() {
      if (!editorContent) return !redirected && !(auth.getState().status === 'error' && root);
      if (!getAccountOwner()) {
        waitingForSignIn = true;
        // Do not retain browser-restored drafts or detached editor controls.
        editorContent.replaceChildren();
        return false;
      }
      enteredEditor = true;
      gate.remove();
      return true;
    },
    revealEditor() {
      if (!enteredEditor || !getAccountOwner()) return;
      editorContent.hidden = false;
      editorContent.removeAttribute('inert');
    },
  };
};

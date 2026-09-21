import { configureAccountStorage, getAccountOwner } from './account-storage.js';
import { getLanguage, t } from './i18n.js';
import { createSupabaseBrowserClient } from './supabase-client.js';
import { createAuthSession } from './auth-session.js';
import { createGuestEditor } from './guest-editor.js';
import { getCallbackReturn, getCreationReturn } from './auth-return.js';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const authErrorKey = (error = '') => {
  if (/malformed_code/.test(error)) return 'auth.malformedCode';
  if (/unresolved_auth/.test(error)) return 'auth.unresolved';
  if (/network|fetch|offline/i.test(error)) return 'auth.networkError';
  if (/already.*used|used_code/i.test(error)) return 'auth.usedCode';
  if (/invalid_code/.test(error)) return 'auth.incorrectCode';
  if (/rate|too many|429/i.test(error)) return 'auth.rateLimit';
  if (/expired|otp_expired/i.test(error)) return 'auth.expiredLink';
  if (/invalid|access_denied|bad.*(token|code)/i.test(error)) return 'auth.invalidLink';
  return 'auth.error';
};

export const renderAuthState = (root, state, { mode = 'magic-link', creation = false, cooldown = 0 } = {}) => {
  root.classList.toggle('auth-menu--otp', ['code-sent', 'verifying'].includes(state.status));
  const id = root.hasAttribute('data-auth-gate-root') ? 'gateEmail' : 'authEmail';
  if (state.status === 'authenticated') {
    root.innerHTML = `
      ${state.verifiedRequest ? `<p role="status">${t('auth.verified')}</p>` : ''}
      <p class="auth-menu__email">${escapeHtml(state.session?.user?.email || t('auth.signedIn'))}</p>
      <button class="auth-menu__button" type="button" data-auth-sign-out>${t('auth.signOut')}</button>
    `;
    return;
  }

  if (['code-sent', 'verifying'].includes(state.status)) {
    const busy = state.status === 'verifying';
    root.innerHTML = `
      <p class="auth-menu__email" ${root.hasAttribute('data-auth-gate-root') ? 'id="authGateTitle"' : ''}>${escapeHtml(t('auth.codeSent', { email: state.submittedEmail }))}</p>
      <form class="auth-menu__form" data-auth-code-form>
        <label class="visually-hidden" for="${id}Code">${t('auth.codeLabel')}</label>
        <input id="${id}Code" name="code" placeholder="${t('auth.codePlaceholder')}" type="text" inputmode="numeric" autocomplete="one-time-code"
          aria-describedby="${id}Error" aria-invalid="${Boolean(state.error)}" required ${busy ? 'disabled' : ''}>
        <button class="auth-menu__button" type="submit" ${busy ? 'disabled' : ''}>${t(busy ? 'auth.verifying' : 'auth.verifySignIn')}</button>
      </form>
      <p id="${id}Error" class="auth-menu__error" role="${state.error ? 'alert' : 'status'}" ${state.error ? '' : 'hidden'}>${state.error ? t(authErrorKey(state.error).replace('expiredLink', 'expiredCode').replace('invalidLink', 'incorrectCode')) : ''}</p>
      <button class="auth-menu__text-button" type="button" data-auth-retry ${busy ? 'disabled' : ''}>${t('auth.otpUseAnotherEmail')}</button>
      <div data-auth-resend-region aria-live="polite" aria-relevant="additions">
        ${!busy && cooldown === 0 ? `<button class="auth-menu__text-button" type="button" data-auth-resend>${t('auth.resendCode')}</button>` : ''}
      </div>`;
    return;
  }

  if (['loading', 'sending', 'confirming', 'signing-out'].includes(state.status)) {
    const key = state.status === 'confirming'
      ? 'auth.confirming'
      : state.status === 'sending'
        ? mode === 'otp' ? 'auth.sendingCode' : 'auth.sending'
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
      <label for="${id}">${t('auth.emailLabel')}</label>
      <input id="${id}" name="email" type="email" autocomplete="email" required placeholder="${t('auth.emailPlaceholder')}">
      <button class="auth-menu__button" type="submit">${t(mode === 'otp' ? 'auth.sendCode' : 'auth.sendMagicLink')}</button>
    </form>
    ${state.status === 'error' ? `<p class="auth-menu__error" role="alert">${t(authErrorKey(state.error || ''))}</p>` : ''}
  `;
};

export const getAuthMode = (env) => env?.VITE_AUTH_MODE === 'otp' ? 'otp' : 'magic-link';

export const initAuthUi = ({ env = import.meta.env, client: injectedClient, onResume } = {}) => {
  const root = document.querySelector('[data-auth-root]');
  if (root?.dataset.authInitialized === 'true') return null;
  const { client } = injectedClient ? { client: injectedClient } : createSupabaseBrowserClient({ env });
  const auth = createAuthSession({ client, location: window.location, mode: getAuthMode(env), resendSeconds: env?.VITE_AUTH_OTP_RESEND_SECONDS });
  configureAccountStorage(auth);
  const content = document.querySelector('[data-editor-content]');
  // Every page uses the same startup interface, even without an auth menu or
  // editor. The shared revealEditor guard decides whether there is work to reveal.
  const editRoute = new URLSearchParams(window.location.search).has('edit');
  const returnTo = content ? getCreationReturn(window.location) : getCallbackReturn(window.location);
  let guest = null;
  let panel = null;
  let pendingRequest = null;
  let verifyingHere = false;
  let enteredEditor = false;
  let generation = 0;
  let redirected = false;
  let initialized = false;
  let observedOwner = null;
  const discard = () => {
    generation += 1;
    pendingRequest = null;
    guest?.destroy();
    guest = null;
    if (panel) panel.hidden = true;
  };
  if (content) {
    panel = document.createElement('section');
    panel.className = 'auth-gate';
    panel.dataset.authGate = '';
    panel.hidden = true;
    content.before(panel);
  }
  const options = (creation = false) => ({ mode: auth.mode, creation, cooldown: auth.cooldownRemaining() });
  const renderPanel = (state) => {
    if (!panel || enteredEditor) return;
    const creation = Boolean(guest);
    panel.innerHTML = `
${['code-sent', 'verifying', 'link-sent'].includes(state.status) ? '' : `<h1 id="authGateTitle">${t(creation ? 'auth.activateTitle' : 'auth.gateTitle')}</h1>
      <p>${t(creation ? 'auth.activateExplanation' : 'auth.gateExplanation')}</p>`}
      <div data-auth-root data-auth-gate-root></div>
      ${creation ? `<button type="button" class="auth-menu__text-button" data-auth-back>${t('auth.backToWatch')}</button>` : ''}`;
    panel.setAttribute('aria-labelledby', 'authGateTitle');
    renderAuthState(panel.querySelector('[data-auth-root]'), state, options(creation));
  };
  const tick = () => {
    const seconds = auth.cooldownRemaining();
    const available = seconds === 0 && auth.getState().status === 'code-sent';
    document.querySelectorAll('[data-auth-resend-region]').forEach(region => {
      if (!available) region.replaceChildren();
      else if (!region.querySelector('[data-auth-resend]')) {
        region.innerHTML = `<button class="auth-menu__text-button" type="button" data-auth-resend>${t('auth.resendCode')}</button>`;
      }
    });
    document.querySelectorAll('[data-auth-resend], [data-auth-form] button[type="submit"]').forEach(el => {
      el.disabled = auth.mode === 'otp' && (seconds > 0 || ['sending', 'verifying'].includes(auth.getState().status));
    });
  };
  const render = (state) => {
    const nextOwner = getAccountOwner();
    const accountChanged = Boolean(nextOwner && nextOwner !== observedOwner);
    observedOwner = nextOwner;
    const label = document.querySelector('[data-auth-label]');
    const trigger = document.querySelector('[data-profile-trigger]');
    if (label) {
      label.textContent = state.status === 'authenticated' ? '' : t('auth.signIn');
      trigger.classList.toggle('top-navigation__sign-in', state.status !== 'authenticated');
      trigger.setAttribute('aria-label', state.status === 'authenticated' ? t('topNavigation.openProfile') : t('auth.signIn'));
    }
    if (root) renderAuthState(root, state, options());
    if (guest && state.status === 'anonymous' && state.authEvent === 'SIGNED_OUT') {
      discard(); window.location.replace('new-watch.html'); return;
    }
    if (guest && (['signing-out', 'loading', 'confirming'].includes(state.status) || state.error === 'unresolved_auth')) discard();
    const expectedLegacySignIn = auth.mode === 'magic-link' && state.authEvent === 'SIGNED_IN'
      && pendingRequest !== null && state.submittedEmail
      && state.session?.user?.email?.toLowerCase() === state.submittedEmail.toLowerCase();
    if (guest?.isCurrent() && state.status === 'authenticated' && expectedLegacySignIn) {
      const request = pendingRequest;
      const owner = state.session.user.id;
      pendingRequest = null;
      guest.destroy(); guest = null;
      panel.hidden = true;
      queueMicrotask(() => { void onResume?.(request, owner); });
      return;
    }
    if (guest && state.status === 'authenticated' && !(verifyingHere && state.verifiedRequest && pendingRequest !== null)) {
      // Header sign-in, another account or an unrelated auth event
      // can never silently adopt a guest draft.
      discard();
      window.location.reload();
      return;
    }
    if (panel && state.error === 'unresolved_auth') panel.hidden = false;
    renderPanel(state);
    if (state.status === 'error' && !content) {
      const menu = document.querySelector('[data-profile-menu]');
      if (menu) menu.hidden = false;
      trigger?.setAttribute('aria-expanded', 'true');
    }
    if (content && editRoute && initialized && accountChanged && !enteredEditor) {
      window.location.reload();
      return;
    }
    if (!content && initialized && accountChanged && !redirected) {
      redirected = true;
      window.location.reload();
    } else if (!content && getAccountOwner() && returnTo && !redirected) {
      redirected = true;
      window.location.replace(returnTo);
    }
    tick();
  };
  if (root) root.dataset.authInitialized = 'true';
  auth.subscribe(render);
  const focusEmail = (inPanel) => (inPanel ? panel : root)?.querySelector('[name="email"]')?.focus();
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-auth-form], [data-auth-code-form]');
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    const inPanel = Boolean(form.closest('[data-auth-gate]'));
    if (form.hasAttribute('data-auth-code-form')) {
      if (auth.getState().status === 'verifying') return;
      const input = form.querySelector('[name="code"]');
      let value = input.value;
      input.value = ''; // No retained OTP on detached controls or in page-cache state.
      const currentGeneration = generation;
      verifyingHere = inPanel && Boolean(guest) && pendingRequest !== null;
      const result = await auth.verifyCode(value);
      value = '';
      if (verifyingHere && result.verifiedRequest && result.status === 'authenticated'
        && currentGeneration === generation && guest?.isCurrent()) {
        const request = pendingRequest;
        pendingRequest = null;
        guest.destroy(); guest = null;
        panel.hidden = true;
        await onResume?.(request, result.session.user.id);
      } else if (result.status === 'authenticated' && guest && !guest.isCurrent()) {
        discard(); window.location.replace('new-watch.html');
      }
      verifyingHere = false;
      if (result.status === 'code-sent') (inPanel ? panel : root)?.querySelector('[name="code"]')?.focus();
      return;
    }
    await auth.sendMagicLink(form.querySelector('[name="email"]').value, { returnTo, language: getLanguage() });
    const scope = inPanel ? panel : root;
    (scope?.querySelector('[name="code"]') || scope?.querySelector('h1, h2'))?.focus();
  });
  document.addEventListener('click', async event => {
    if (event.target.closest('[data-auth-sign-out]')) { discard(); await auth.signOut(); }
    if (event.target.closest('[data-auth-back]')) {
      generation += 1;
      pendingRequest = null;
      auth.cancelChallenge();
      panel.hidden = true;
      guest?.show();
    }
    if (event.target.closest('[data-auth-retry]')) {
      const inPanel = Boolean(event.target.closest('[data-auth-gate]'));
      auth.resetEmail(); focusEmail(inPanel);
    }
    if (event.target.closest('[data-auth-resend]')) {
      await auth.sendMagicLink(auth.getState().submittedEmail, { returnTo, language: getLanguage() });
    }
  });
  document.addEventListener('profile-control:opening', () => {
    // Header authentication has no permission to resume a Watch submission.
    if (guest) { generation += 1; pendingRequest = null; panel.hidden = true; guest.show(); auth.cancelChallenge(); }
  });
  document.addEventListener('i18n:languageChanged', () => render(auth.getState()));
  const timer = window.setInterval(tick, 1000);
  window.addEventListener('pagehide', () => { window.clearInterval(timer); discard(); auth.cancelChallenge(); });
  window.addEventListener('pageshow', event => { if (event.persisted && content && !enteredEditor) window.location.reload(); });
  const ready = auth.initialize().then(state => { initialized = true; return state; });
  return {
    auth, client, ready,
    destroy() { window.clearInterval(timer); auth.destroy(); guest?.destroy(); },
    canEnterEditor() {
      if (!content) return !redirected && !(auth.getState().status === 'error' && root);
      if (!getAccountOwner()) {
        // Erase any browser-restored values while keeping only pristine hidden markup.
        content.querySelectorAll('input, textarea').forEach(el => { el.value = ''; el.defaultValue = ''; });
        if (!editRoute && ['anonymous', 'unavailable'].includes(auth.getState().status)) {
          guest = createGuestEditor({ content,
            onSubmit(request) { pendingRequest = request; guest.hide(); panel.hidden = false; renderPanel(auth.getState()); focusEmail(true); },
            onInvalidate() { generation += 1; pendingRequest = null; auth.cancelChallenge(); },
          });
        } else { panel.hidden = false; renderPanel(auth.getState()); }
        return false;
      }
      enteredEditor = true;
      guest?.destroy(); guest = null;
      panel.remove();
      return true;
    },
    revealEditor() {
      if (!enteredEditor || !getAccountOwner()) return;
      content.hidden = false;
      content.removeAttribute('inert');
    },
  };
};

// One resolved auth boundary for browser-local account data. Never infer ownership
// from a stored Watch, an email address, or whichever user signs in first.
export const ACCOUNT_STORAGE_CHANGED_EVENT = 'watchassistant:accountstoragechanged';
const LEGACY_KEYS = [
  'watchAssistant.reports.v1', 'watchAssistant.watches',
  'watchAssistant.deletedWatchIds', 'watchAssistant.demoDataVersion',
  'watchAssistant.htmlEntityDecodeVersion', 'watchAssistant.reportStatusMigrationVersion',
];
let ownerId = null;
let scope = null;
let epoch = 0;
let unsubscribe;

export const isValidOwnerId = (value) => typeof value === 'string'
  && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
export const getAccountOwner = () => ownerId;
export const getAccountEpoch = () => epoch;
export const isAccountStorageResolved = () => scope !== null;
export const accountStorageKey = (base, owner = ownerId) => isValidOwnerId(owner)
  ? `${base}.account.${encodeURIComponent(owner)}` : null;
export const localWatchStorageKey = (base) => accountStorageKey(`${base}.v2`);

export const safeStorage = {
  getItem(key) { try { return key ? localStorage.getItem(key) : null; } catch { return null; } },
  setItem(key, value) { try { if (key) localStorage.setItem(key, value); } catch { /* Storage is optional. */ } },
  removeItem(key) { try { if (key) localStorage.removeItem(key); } catch { /* Ignored keys are never read. */ } },
};
export const disposeLegacyAccountData = () => LEGACY_KEYS.forEach((key) => safeStorage.removeItem(key));

export const configureAccountStorage = (auth) => {
  unsubscribe?.();
  const apply = (state) => {
    const nextOwner = state?.status === 'authenticated' && isValidOwnerId(state.session?.user?.id)
      ? state.session.user.id : null;
    const nextScope = nextOwner ? 'account'
      : ['anonymous', 'unavailable'].includes(state?.status) ? 'guest' : null;
    if (!['loading', 'confirming'].includes(state?.status)) disposeLegacyAccountData();
    if (nextOwner === ownerId && nextScope === scope) return;
    ownerId = nextOwner;
    scope = nextScope;
    epoch += 1;
    // Clear navigation pointers as well as the visible data. Preferences remain intact.
    for (const key of ['watchAssistant.newWatchId', 'watchAssistant.firstWatchConfirmation']) {
      try { sessionStorage.removeItem(key); } catch { /* Optional session storage. */ }
    }
    globalThis.window?.dispatchEvent?.(new Event(ACCOUNT_STORAGE_CHANGED_EVENT));
  };
  apply(auth?.getState?.());
  unsubscribe = auth?.subscribe?.(apply);
};

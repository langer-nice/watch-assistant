// Used only by account-isolation-preview.mjs. No real identities or credentials.
import { saveReport } from '../report-storage.js';
const key = 'synthetic-preview-account';
const session = () => {
  const account = localStorage.getItem(key);
  return ['A', 'B'].includes(account)
    ? { user: { id: `synthetic-user-${account.toLowerCase()}` }, access_token: 'synthetic-no-network-token' }
    : null;
};
const listeners = new Set();
const emit = (event) => listeners.forEach((fn) => fn(event, session()));
window.syntheticAuth = {
  emailCalls: [],
  signIn(account) { localStorage.setItem(key, account); emit('SIGNED_IN'); },
  signOut() { return client.auth.signOut(); },
  refresh() { emit('TOKEN_REFRESHED'); },
  save() {
    const account = localStorage.getItem(key);
    const title = account === 'A' ? 'PRIVATE REPORT FOR SYNTHETIC USER A' : 'REPORT FOR SYNTHETIC USER B';
    const date = new Date().toISOString();
    saveReport({ version: 2, ownerId: session().user.id, id: 'synthetic-report', startedAt: date, completedAt: date,
      watchIdsConsidered: ['synthetic-watch'], watchIdsChecked: ['synthetic-watch'], watchIdsSkipped: [],
      attempts: [{ watchId: 'synthetic-watch', status: 'succeeded', startedAt: date, completedAt: date }],
      entries: [{ watchId: 'synthetic-watch', classification: 'updated', title, updateTitle: `${title} UPDATE`,
        summary: `${title} SUMMARY`, attemptStatus: 'succeeded', checkedAt: date }] });
  },
};
const client = { auth: {
  async getSession() {
    // A visible initialization interval makes stale-content flashes testable.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return { data: { session: session() }, error: null };
  },
  onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; },
  async signOut() { localStorage.removeItem(key); emit('SIGNED_OUT'); return { error: null }; },
  async signInWithOtp(payload) {
    window.syntheticAuth.emailCalls.push(payload);
    await new Promise(resolve => setTimeout(resolve, 250));
    return { error: null }; // Simulated delivery only; no network or real email.
  },
} };
export const createSupabaseBrowserClient = () => ({ client });

import { accountStorageKey, safeStorage } from './account-storage.js';

const key = (kind, owner) => accountStorageKey(`watchAssistant.server.${kind}.v1`, owner);
export const readWatchCache = (kind, owner, validate) => {
  try {
    const cached = JSON.parse(safeStorage.getItem(key(kind, owner)) || 'null');
    if (cached?.owner !== owner || !Array.isArray(cached.rows)) return null;
    return { ...cached, rows: cached.rows.map(validate) };
  } catch { return null; }
};
export const writeWatchCache = (kind, owner, rows) => {
  if (owner) safeStorage.setItem(key(kind, owner), JSON.stringify({ owner, rows, confirmedAt: Date.now() }));
};

// A shared per-account cooldown survives page changes. No timers or recursive retries.
export const createWatchRequestGate = (kind) => {
  const flights = new Map();
  return (owner, work, { automatic = false, scope = 0, onSkipped = () => {} } = {}) => {
    const flightKey = `${owner}:${scope}`;
    if (flights.has(flightKey)) return flights.get(flightKey);
    const gateKey = accountStorageKey(`watchAssistant.request.${kind}.v1`, owner);
    const read = () => { try { return JSON.parse(safeStorage.getItem(gateKey) || '{}'); } catch { return {}; } };
    const before = read();
    const replacingSession = [...flights.keys()].some(k => k.startsWith(`${owner}:`));
    const execute = async () => {
      const latest = read();
      if ((automatic && !replacingSession && latest.nextAt > Date.now()) || latest.startedAt > (before.startedAt || 0)) {
        return onSkipped();
      }
      const startedAt = Date.now();
      safeStorage.setItem(gateKey, JSON.stringify({ ...latest, startedAt, nextAt: startedAt + 15000 }));
      try {
        const result = await work();
        safeStorage.setItem(gateKey, JSON.stringify({ startedAt, failures: 0, nextAt: Date.now() + 15000 }));
        return result;
      } catch (error) {
        const failures = Math.min((latest.failures || 0) + 1, 5);
        safeStorage.setItem(gateKey, JSON.stringify({ startedAt, failures, nextAt: Date.now() + Math.min(300000, 15000 * 2 ** failures) }));
        throw error;
      }
    };
    const promise = Promise.resolve().then(() => globalThis.navigator?.locks?.request
      ? navigator.locks.request(`watchAssistant:${kind}:${owner}`, execute) : execute())
      .finally(() => { if (flights.get(flightKey) === promise) flights.delete(flightKey); });
    flights.set(flightKey, promise);
    return promise;
  };
};

export const watchRequest = async (path, options = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal });
    const body = await response.json();
    return { ok: response.ok, status: response.status, headers: response.headers, json: async () => body };
  } catch (error) {
    if (controller.signal.aborted) throw Object.assign(new Error('Watch request timed out.'), { code: 'TIMEOUT' });
    throw error;
  } finally { clearTimeout(timer); }
};

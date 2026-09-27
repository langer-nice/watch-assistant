// Optional test preload: prohibit real outbound traffic (including OTP/email providers).
// Test doubles and loopback fixture servers remain available.
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
const loopback = host => ['localhost','127.0.0.1','::1','[::1]'].includes(host);
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const options = typeof normalized[0] === 'object' ? normalized[0] : { host: typeof normalized[1] === 'string' ? normalized[1] : 'localhost' };
  if (options?.host && !loopback(options.host)) throw new Error('Tests blocked external network');
  return originalConnect.apply(this,args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!loopback(url.hostname)) throw new Error('Tests blocked external fetch');
  return originalFetch(input, options);
};
syncBuiltinESMExports();

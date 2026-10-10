// HTTP is reserved for an explicitly opted-in loopback Auth test stack.
// Deployed clients/servers must continue to use HTTPS.
export const isSupabaseEndpoint = (value, allowLocal = false) => {
  try {
    const url = new URL(value);
    return !url.username && !url.password && (url.protocol === 'https:'
      || (allowLocal && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)));
  } catch { return false; }
};

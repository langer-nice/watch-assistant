import { createHash } from 'node:crypto';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const tracking = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'referrer']);
export const mediaArticleIdentityKeys = (item) => {
  const keys = [];
  try {
    const url = new URL(item.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid article URL');
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) {
      if (name.toLowerCase().startsWith('utm_') || tracking.has(name.toLowerCase())) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    keys.push(`url:${hash(url.href)}`);
  } catch { /* Undeliverable records still retain their source identity. */ }
  if (typeof item.id === 'string' && item.id && !/^https?:\/\//i.test(item.id)) keys.push(`id:${hash(item.id)}`);
  if (!keys.length) keys.push(`id:${hash(String(item.id || ''))}`);
  return keys;
};

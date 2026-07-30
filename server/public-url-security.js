import dns from 'node:dns/promises';
import net from 'node:net';

const blockedIpv4Addresses = new net.BlockList();
const blockedIpv6Addresses = new net.BlockList();

[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) => blockedIpv4Addresses.addSubnet(address, prefix, 'ipv4'));

[
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([address, prefix]) => blockedIpv6Addresses.addSubnet(address, prefix, 'ipv6'));

export class PublicUrlError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'PublicUrlError';
    this.code = code;
  }
}

export const isPublicIpAddress = (address) => {
  const family = net.isIPv4(address) ? 'ipv4' : net.isIPv6(address) ? 'ipv6' : null;
  if (family === 'ipv4') return !blockedIpv4Addresses.check(address, family);
  if (family === 'ipv6') return !blockedIpv6Addresses.check(address, family);
  return false;
};

const isLocalHostname = (hostname) => {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return normalized === 'localhost'
    || (net.isIP(normalized) === 0 && !normalized.includes('.'))
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.localdomain')
    || normalized.endsWith('.internal')
    || normalized.endsWith('.lan')
    || normalized.endsWith('.home')
    || normalized.endsWith('.home.arpa');
};

export const resolvePublicUrl = async (value, { lookup = dns.lookup } = {}) => {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new PublicUrlError('INVALID_URL', 'The URL is invalid.', { cause: error });
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new PublicUrlError('INVALID_PROTOCOL', 'Only HTTP and HTTPS URLs are supported.');
  }
  if (url.username || url.password) {
    throw new PublicUrlError('URL_CREDENTIALS', 'URLs containing credentials are not supported.');
  }
  if (isLocalHostname(url.hostname)) {
    throw new PublicUrlError('LOCAL_HOST', 'Local URLs are not supported.');
  }

  let addresses;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new PublicUrlError('DNS_FAILURE', 'The hostname could not be resolved.', { cause: error });
  }
  if (!Array.isArray(addresses) || !addresses.length) {
    throw new PublicUrlError('DNS_FAILURE', 'The hostname could not be resolved.');
  }
  const normalizedAddresses = addresses
    .map(({ address, family }) => ({
      address,
      family: Number(family) || net.isIP(address),
    }))
    .filter(({ address, family }) => typeof address === 'string' && [4, 6].includes(family));
  if (normalizedAddresses.length !== addresses.length) {
    throw new PublicUrlError('DNS_FAILURE', 'The hostname could not be resolved.');
  }
  if (normalizedAddresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new PublicUrlError('PRIVATE_ADDRESS', 'The URL does not resolve to a public address.');
  }

  return { url, addresses: normalizedAddresses };
};

export const validatePublicUrl = async (value, options) => (
  (await resolvePublicUrl(value, options)).url
);

export const createPinnedLookup = (addresses) => {
  const approvedAddresses = (Array.isArray(addresses) ? addresses : [])
    .filter(({ address, family }) => (
      typeof address === 'string'
      && [4, 6].includes(Number(family))
      && isPublicIpAddress(address)
    ));
  if (!approvedAddresses.length) {
    throw new PublicUrlError('DNS_FAILURE', 'The hostname could not be resolved.');
  }

  let nextAddress = 0;
  return (_hostname, options, callback) => {
    const lookupOptions = typeof options === 'number' ? { family: options } : options || {};
    const requestedFamily = Number(lookupOptions.family) || 0;
    const candidates = requestedFamily
      ? approvedAddresses.filter(({ family }) => Number(family) === requestedFamily)
      : approvedAddresses;
    if (!candidates.length) {
      const error = new Error('No approved address matches the requested address family.');
      error.code = 'ENOTFOUND';
      callback(error);
      return;
    }
    if (lookupOptions.all) {
      callback(null, candidates);
      return;
    }
    const selected = candidates[nextAddress % candidates.length];
    nextAddress += 1;
    callback(null, selected.address, Number(selected.family));
  };
};

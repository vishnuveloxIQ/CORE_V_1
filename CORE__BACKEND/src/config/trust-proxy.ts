import { isIP } from 'node:net';

/**
 * Parses TRUST_PROXY: comma-separated IP addresses or CIDR ranges of the load balancers that may set
 * X-Forwarded-For (Phase N decision 2). Empty or unset means trust proxy is off. Throws on anything else.
 * A prefix of /0 is refused, because it would trust every client.
 */
export function parseTrustProxy(value: string | undefined): string[] {
  if (value === undefined || value.trim() === '') {
    return [];
  }
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  for (const entry of entries) {
    const [address, prefix, ...rest] = entry.split('/');
    const version = isIP(address ?? '');
    const maxPrefix = version === 6 ? 128 : 32;
    const prefixOk =
      prefix === undefined ||
      (/^\d{1,3}$/.test(prefix) && Number(prefix) >= 1 && Number(prefix) <= maxPrefix);
    if (version === 0 || rest.length > 0 || !prefixOk) {
      throw new Error(
        'TRUST_PROXY must list IP addresses or CIDR ranges (prefix 1 or longer), comma-separated',
      );
    }
  }
  return entries;
}

/** The value the app's trustProxy option takes (Express 'trust proxy'): the listed proxies, or false when none are listed. */
export function trustProxyFrom(value: string | undefined): string[] | false {
  const entries = parseTrustProxy(value);
  return entries.length > 0 ? entries : false;
}

import type { BaseClient } from './clients';

const WALLET_ROUTES = [
  ['/deployed', '/v1/wallets/deployed'],
  ['/v1/account/transactions/params', '/v1/wallets/execute-params'],
  ['/submit', '/v1/wallets/transactions'],
] as const;

/** Gateway wallet routes apply only to bearer clients; direct clients keep their paths. @internal */
export function walletRequestPath(client: BaseClient, path: string): string {
  if (!client.isSecureClient() || 'key' in client.credentials) return path;
  for (const [upstream, gateway] of WALLET_ROUTES) {
    if (path === upstream) return gateway;
  }
  return path.replace(
    /^\/v1\/account\/transactions\//,
    '/v1/wallets/transactions/',
  );
}

/** Builder signatures cover the upstream path, even when sent through a gateway mapping. @internal */
export function walletSigningPath(path: string): string {
  for (const [upstream, gateway] of WALLET_ROUTES) {
    if (path === gateway) return upstream;
  }
  return path.replace(
    /^\/v1\/wallets\/transactions\//,
    '/v1/account/transactions/',
  );
}

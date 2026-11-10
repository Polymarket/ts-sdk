import type { ServiceRequest, ServiceRequestMethod } from './ServiceClient';

/**
 * The upstream credential family that an API key signs for:
 * builder keys sign trading requests, builder keys sign builder RFQ writes,
 * and gasless-capable keys sign wallet requests.
 */
type SigningFamily = 'trading' | 'builder-rfq' | 'wallet';

/** The API-key capabilities that select which credential families a key signs. */
export type ApiKeyCapabilities = {
  isBuilderKey: boolean;
  supportGasless: boolean;
};

type SigningRoute = {
  method: ServiceRequestMethod;
  pattern: RegExp;
  signingMethod: ServiceRequestMethod;
  signingPath: string;
  family: SigningFamily;
};

function route(
  method: ServiceRequestMethod,
  path: string,
  signingPath: string,
  family: SigningFamily,
  signingMethod: ServiceRequestMethod = method,
): SigningRoute {
  return {
    method,
    pattern: new RegExp(`^${path.replace(/\{[^}]+\}/g, '([^/]+)')}$`),
    signingMethod,
    signingPath,
    family,
  };
}

// Request bodies stay unchanged. Signatures cover the upstream method and path.
const SIGNING_ROUTES: readonly SigningRoute[] = [
  route(
    'GET',
    '/v1/me/trading-status',
    '/auth/ban-status/closed-only',
    'trading',
  ),
  route('GET', '/v1/me/orders', '/data/orders', 'trading'),
  route('GET', '/v1/me/wallet-orders', '/data/wallet-open-orders', 'trading'),
  route('GET', '/v1/me/orders/{order_id}', '/data/order/{order_id}', 'trading'),
  route('GET', '/v1/me/trades', '/data/trades', 'trading'),
  route('GET', '/v1/me/notifications', '/notifications', 'trading'),
  route('DELETE', '/v1/me/notifications', '/notifications', 'trading'),
  route('GET', '/v1/me/balance-allowances', '/balance-allowance', 'trading'),
  route(
    'POST',
    '/v1/me/balance-allowances/refresh',
    '/balance-allowance/update',
    'trading',
    'GET',
  ),
  route('GET', '/v1/me/session-signers', '/v1/user/session-signers', 'trading'),
  route('GET', '/v1/orders/scoring', '/order-scoring', 'trading'),
  route('POST', '/v1/orders/scoring', '/orders-scoring', 'trading'),
  route('GET', '/v1/rewards/user', '/rewards/user', 'trading'),
  route('GET', '/v1/rewards/user/total', '/rewards/user/total', 'trading'),
  route('GET', '/v1/rewards/user/markets', '/rewards/user/markets', 'trading'),
  route(
    'GET',
    '/v1/rewards/user/percentages',
    '/rewards/user/percentages',
    'trading',
  ),
  route('GET', '/v1/builders/trades', '/builder/trades', 'trading'),
  route('GET', '/v1/pricing/midpoint', '/midpoint', 'trading'),
  route('POST', '/v1/pricing/midpoints', '/midpoints', 'trading'),
  route('GET', '/v1/pricing/tick-size', '/tick-size', 'trading'),
  route('GET', '/v1/trading/neg-risk', '/neg-risk', 'trading'),
  route(
    'GET',
    '/v1/trading/markets/token/{token_id}',
    '/markets-by-token/{token_id}',
    'trading',
  ),
  route(
    'GET',
    '/v1/trading/markets/{condition_id}',
    '/clob-markets/{condition_id}',
    'trading',
  ),
  route(
    'GET',
    '/v1/fees/builder/{code}',
    '/fees/builder-fees/{code}',
    'trading',
  ),
  route('GET', '/v1/pricing/price', '/price', 'trading'),
  route('POST', '/v1/pricing/prices', '/prices', 'trading'),
  route('GET', '/v1/pricing/book', '/book', 'trading'),
  route('POST', '/v1/pricing/books', '/books', 'trading'),
  route('GET', '/v1/pricing/spread', '/spread', 'trading'),
  route('POST', '/v1/pricing/spreads', '/spreads', 'trading'),
  route('GET', '/v1/pricing/last-trade-price', '/last-trade-price', 'trading'),
  route(
    'POST',
    '/v1/pricing/last-trades-prices',
    '/last-trades-prices',
    'trading',
  ),
  route(
    'GET',
    '/v1/rewards/markets/current',
    '/rewards/markets/current',
    'trading',
  ),
  route(
    'GET',
    '/v1/rewards/markets/multi',
    '/rewards/markets/multi',
    'trading',
  ),
  route(
    'GET',
    '/v1/rewards/markets/{condition_id}',
    '/rewards/markets/{condition_id}',
    'trading',
  ),
  route('GET', '/v1/rebates/current', '/rebates/current', 'trading'),
  route('POST', '/v1/orders', '/order', 'trading'),
  route('POST', '/v1/orders/batch', '/orders', 'trading'),
  route('DELETE', '/v1/orders', '/order', 'trading'),
  route('DELETE', '/v1/orders/batch', '/orders', 'trading'),
  route('DELETE', '/v1/orders/all', '/cancel-all', 'trading'),
  route('DELETE', '/v1/orders/by-market', '/cancel-market-orders', 'trading'),
  route('DELETE', '/v1/orders/by-wallet', '/cancel-wallet-orders', 'trading'),
  route(
    'POST',
    '/v1/combos/builder/requests',
    '/v1/builder/rfq/requests',
    'builder-rfq',
  ),
  route(
    'POST',
    '/v1/combos/builder/requests/{rfq_id}/accept',
    '/v1/builder/rfq/requests/{rfq_id}/accept',
    'builder-rfq',
  ),
  route(
    'GET',
    '/v1/combos/builder/requests/{rfq_id}',
    '/v1/builder/rfq/requests/{rfq_id}',
    'builder-rfq',
  ),
  route(
    'POST',
    '/v1/wallets/session-signers/authorizations',
    '/v1/session-signers/authorizations',
    'wallet',
  ),
  route(
    'POST',
    '/v1/wallets/session-signers/revocations',
    '/v1/session-signers/revocations',
    'wallet',
  ),
  route(
    'POST',
    '/v1/wallets/collateral-return/plan',
    '/v1/collateral-return/plan',
    'wallet',
  ),
  route(
    'POST',
    '/v1/wallets/collateral-return/submit',
    '/v1/collateral-return/submit',
    'wallet',
  ),
  route(
    'GET',
    '/v1/wallets/execute-params',
    '/v1/account/transactions/params',
    'wallet',
  ),
  route('GET', '/v1/wallets/deployed', '/deployed', 'wallet'),
  route(
    'GET',
    '/v1/wallets/transactions/{id}',
    '/v1/account/transactions/{id}',
    'wallet',
  ),
  route('POST', '/v1/wallets/transactions', '/submit', 'wallet'),
];

function signs(
  capabilities: ApiKeyCapabilities,
  family: SigningFamily,
  method: ServiceRequestMethod,
): boolean {
  switch (family) {
    case 'trading':
      return capabilities.isBuilderKey;
    case 'builder-rfq':
      return capabilities.isBuilderKey && method !== 'GET';
    case 'wallet':
      return capabilities.supportGasless;
  }
}

/**
 * Returns the upstream request that an API key signs for a Predictions
 * request, or `undefined` when the key adds no headers to that operation.
 * The dispatched URL, method and body stay unchanged.
 * @internal
 */
export function predictionSigningRequest(
  request: ServiceRequest,
  capabilities: ApiKeyCapabilities,
): ServiceRequest | undefined {
  const pathname = request.path.split('?')[0] ?? request.path;
  for (const signing of SIGNING_ROUTES) {
    if (signing.method !== request.method) continue;
    const match = signing.pattern.exec(pathname);
    if (match === null) continue;
    if (!signs(capabilities, signing.family, request.method)) return undefined;
    let index = 1;
    const signingPath = signing.signingPath.replace(
      /\{[^}]+\}/g,
      () => match[index++] ?? '',
    );
    if (signingPath === '/v1/collateral-return/submit') {
      // The service forwards the envelope to the wallet relay, which checks the signature.
      const payload = JSON.parse(request.body ?? '{}') as {
        envelope?: unknown;
      };
      return {
        ...request,
        method: signing.signingMethod,
        path: '/submit',
        body: JSON.stringify(payload.envelope),
      };
    }
    return { ...request, method: signing.signingMethod, path: signingPath };
  }
  return undefined;
}

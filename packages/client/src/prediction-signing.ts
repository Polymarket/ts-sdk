import type { ServiceRequest, ServiceRequestMethod } from './ServiceClient';

type SigningRoute = readonly [
  ServiceRequestMethod,
  string,
  ServiceRequestMethod,
  string,
  'clob' | 'relayer' | 'collateral',
  boolean,
];
// Request bodies stay unchanged; authentication covers the service's canonical method and path.
const SIGNING_ROUTES: readonly SigningRoute[] = [
  [
    'POST',
    '/v1/combos/builder/requests',
    'POST',
    '/v1/builder/rfq/requests',
    'clob',
    true,
  ],
  [
    'POST',
    '/v1/combos/builder/requests/{rfq_id}/accept',
    'POST',
    '/v1/builder/rfq/requests/{rfq_id}/accept',
    'clob',
    true,
  ],
  [
    'GET',
    '/v1/combos/builder/requests/{rfq_id}',
    'GET',
    '/v1/builder/rfq/requests/{rfq_id}',
    'clob',
    true,
  ],
  [
    'GET',
    '/v1/me/session-signers',
    'GET',
    '/v1/user/session-signers',
    'clob',
    true,
  ],
  [
    'POST',
    '/v1/wallets/session-signers/authorizations',
    'POST',
    '/v1/session-signers/authorizations',
    'relayer',
    true,
  ],
  [
    'POST',
    '/v1/wallets/session-signers/revocations',
    'POST',
    '/v1/session-signers/revocations',
    'relayer',
    true,
  ],

  [
    'GET',
    '/v1/me/trading-status',
    'GET',
    '/auth/ban-status/closed-only',
    'clob',
    true,
  ],
  ['GET', '/v1/me/orders', 'GET', '/data/orders', 'clob', true],
  [
    'GET',
    '/v1/me/orders/{order_id}',
    'GET',
    '/data/order/{order_id}',
    'clob',
    true,
  ],
  ['GET', '/v1/me/trades', 'GET', '/data/trades', 'clob', true],
  ['GET', '/v1/me/notifications', 'GET', '/notifications', 'clob', true],
  ['DELETE', '/v1/me/notifications', 'DELETE', '/notifications', 'clob', true],
  [
    'GET',
    '/v1/me/balance-allowances',
    'GET',
    '/balance-allowance',
    'clob',
    true,
  ],
  ['GET', '/v1/orders/scoring', 'GET', '/order-scoring', 'clob', true],
  ['POST', '/v1/orders/scoring', 'POST', '/orders-scoring', 'clob', true],
  ['GET', '/v1/rewards/user', 'GET', '/rewards/user', 'clob', true],
  ['GET', '/v1/rewards/user/total', 'GET', '/rewards/user/total', 'clob', true],
  [
    'GET',
    '/v1/rewards/user/markets',
    'GET',
    '/rewards/user/markets',
    'clob',
    true,
  ],
  [
    'GET',
    '/v1/rewards/user/percentages',
    'GET',
    '/rewards/user/percentages',
    'clob',
    true,
  ],
  ['GET', '/v1/builders/trades', 'GET', '/builder/trades', 'clob', false],
  ['GET', '/v1/pricing/midpoint', 'GET', '/midpoint', 'clob', false],
  ['POST', '/v1/pricing/midpoints', 'POST', '/midpoints', 'clob', false],
  ['GET', '/v1/pricing/tick-size', 'GET', '/tick-size', 'clob', false],
  ['GET', '/v1/trading/neg-risk', 'GET', '/neg-risk', 'clob', false],
  [
    'GET',
    '/v1/trading/markets/token/{token_id}',
    'GET',
    '/markets-by-token/{token_id}',
    'clob',
    false,
  ],
  [
    'GET',
    '/v1/trading/markets/{condition_id}',
    'GET',
    '/clob-markets/{condition_id}',
    'clob',
    false,
  ],
  [
    'GET',
    '/v1/fees/builder/{code}',
    'GET',
    '/fees/builder-fees/{code}',
    'clob',
    false,
  ],
  ['GET', '/v1/pricing/price', 'GET', '/price', 'clob', false],
  ['POST', '/v1/pricing/prices', 'POST', '/prices', 'clob', false],
  ['GET', '/v1/pricing/book', 'GET', '/book', 'clob', false],
  ['POST', '/v1/pricing/books', 'POST', '/books', 'clob', false],
  ['GET', '/v1/pricing/spread', 'GET', '/spread', 'clob', false],
  ['POST', '/v1/pricing/spreads', 'POST', '/spreads', 'clob', false],
  [
    'GET',
    '/v1/pricing/last-trade-price',
    'GET',
    '/last-trade-price',
    'clob',
    false,
  ],
  [
    'POST',
    '/v1/pricing/last-trades-prices',
    'POST',
    '/last-trades-prices',
    'clob',
    false,
  ],
  [
    'GET',
    '/v1/rewards/markets/current',
    'GET',
    '/rewards/markets/current',
    'clob',
    false,
  ],
  [
    'GET',
    '/v1/rewards/markets/{condition_id}',
    'GET',
    '/rewards/markets/{condition_id}',
    'clob',
    false,
  ],
  [
    'GET',
    '/v1/rewards/markets/multi',
    'GET',
    '/rewards/markets/multi',
    'clob',
    false,
  ],
  ['GET', '/v1/rebates/current', 'GET', '/rebates/current', 'clob', false],
  [
    'POST',
    '/v1/wallets/collateral-return/plan',
    'POST',
    '/v1/collateral-return/plan',
    'collateral',
    false,
  ],
  [
    'POST',
    '/v1/wallets/collateral-return/submit',
    'POST',
    '/v1/collateral-return/submit',
    'collateral',
    false,
  ],
  [
    'GET',
    '/v1/wallets/execute-params',
    'GET',
    '/v1/account/transactions/params',
    'relayer',
    false,
  ],
  ['GET', '/v1/wallets/deployed', 'GET', '/deployed', 'relayer', false],
  [
    'GET',
    '/v1/wallets/transactions/{id}',
    'GET',
    '/v1/account/transactions/{id}',
    'relayer',
    false,
  ],
  ['POST', '/v1/wallets/transactions', 'POST', '/submit', 'relayer', false],
  ['POST', '/v1/trading/heartbeats', 'POST', '/heartbeats', 'clob', true],
  ['POST', '/v1/orders', 'POST', '/order', 'clob', true],
  ['POST', '/v1/orders/batch', 'POST', '/orders', 'clob', true],
  ['DELETE', '/v1/orders/all', 'DELETE', '/cancel-all', 'clob', true],
  [
    'DELETE',
    '/v1/orders/by-market',
    'DELETE',
    '/cancel-market-orders',
    'clob',
    true,
  ],
  ['DELETE', '/v1/orders', 'DELETE', '/order', 'clob', true],
  ['DELETE', '/v1/orders/batch', 'DELETE', '/orders', 'clob', true],
  [
    'POST',
    '/v1/me/balance-allowances/refresh',
    'GET',
    '/balance-allowance/update',
    'clob',
    true,
  ],
];

/** Resolve authentication against the canonical upstream request without changing the dispatched URL. @internal */
export function predictionSigningRequest(request: ServiceRequest):
  | {
      request: ServiceRequest;
      kind: 'clob' | 'relayer' | 'collateral';
      l2: boolean;
    }
  | undefined {
  for (const [
    method,
    path,
    signingMethod,
    signingPath,
    kind,
    l2,
  ] of SIGNING_ROUTES) {
    if (method !== request.method) continue;
    const match = new RegExp(`^${path.replace(/\{[^}]+\}/g, '([^/]+)')}$`).exec(
      request.path,
    );
    if (match === null) continue;
    let index = 1;
    const canonicalPath = signingPath.replace(
      /\{[^}]+\}/g,
      () => match[index++] ?? '',
    );
    const canonical = {
      ...request,
      method: signingMethod,
      path: canonicalPath,
    };
    if (kind === 'collateral' && path.endsWith('/submit')) {
      // Submission authorization covers the nested transaction sent to the relayer.
      const payload = JSON.parse(request.body ?? '{}') as {
        envelope?: unknown;
      };
      canonical.path = '/submit';
      canonical.body = JSON.stringify(payload.envelope);
    }
    return { request: canonical, kind, l2 };
  }
  return undefined;
}

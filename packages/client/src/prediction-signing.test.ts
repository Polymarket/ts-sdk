import { describe, expect, it } from 'vitest';
import { predictionSigningRequest } from './prediction-signing';
import type { ServiceRequest, ServiceRequestMethod } from './ServiceClient';

const builderKey = { isBuilderKey: true, supportGasless: true };
const relayerKey = { isBuilderKey: false, supportGasless: true };

function request(
  method: ServiceRequestMethod,
  path: string,
  body?: string,
): ServiceRequest {
  return { method, path, body };
}

describe('predictionSigningRequest', () => {
  it('signs the upstream path with the captured identifiers', () => {
    expect(
      predictionSigningRequest(
        request('GET', '/v1/me/orders/0xabc'),
        builderKey,
      ),
    ).toMatchObject({ method: 'GET', path: '/data/order/0xabc' });
    expect(
      predictionSigningRequest(
        request('GET', '/v1/rewards/markets/multi'),
        builderKey,
      ),
    ).toMatchObject({ path: '/rewards/markets/multi' });
  });

  it('signs the upstream method of the balance refresh without its query', () => {
    expect(
      predictionSigningRequest(
        request(
          'POST',
          '/v1/me/balance-allowances/refresh?asset_type=CONDITIONAL&token_id=1',
        ),
        builderKey,
      ),
    ).toMatchObject({ method: 'GET', path: '/balance-allowance/update' });
  });

  it.each([
    ['GET', '/v1/me/wallet-orders', '/data/wallet-open-orders', undefined],
    [
      'DELETE',
      '/v1/orders/by-wallet',
      '/cancel-wallet-orders',
      '{"order_ids":["0xabc"]}',
    ],
    ['DELETE', '/v1/orders/by-wallet', '/cancel-wallet-orders', '{"all":true}'],
  ] as const)('signs wallet-wide %s %s only with builder credentials (%s, %s)', (method, path, upstreamPath, body) => {
    const walletOrders = request(method, path, body);
    expect(predictionSigningRequest(walletOrders, builderKey)).toEqual({
      method,
      path: upstreamPath,
      body,
    });
    expect(predictionSigningRequest(walletOrders, relayerKey)).toBeUndefined();
  });

  it('signs the relayed envelope of a collateral return submission', () => {
    expect(
      predictionSigningRequest(
        request(
          'POST',
          '/v1/wallets/collateral-return/submit',
          '{"envelope":{"nonce":"1"},"plan_hash":"0x01"}',
        ),
        relayerKey,
      ),
    ).toMatchObject({ method: 'POST', path: '/submit', body: '{"nonce":"1"}' });
  });

  it('signs only the credential family the key supports', () => {
    const order = request('POST', '/v1/orders', '{}');
    const submit = request('POST', '/v1/wallets/transactions', '{}');

    expect(predictionSigningRequest(order, relayerKey)).toBeUndefined();
    expect(predictionSigningRequest(submit, relayerKey)).toMatchObject({
      path: '/submit',
    });
    expect(
      predictionSigningRequest(submit, {
        isBuilderKey: true,
        supportGasless: false,
      }),
    ).toBeUndefined();
  });

  it('signs builder RFQ writes but not status reads', () => {
    expect(
      predictionSigningRequest(
        request('POST', '/v1/combos/builder/requests/rfq-1/accept', '{}'),
        builderKey,
      ),
    ).toMatchObject({ path: '/v1/builder/rfq/requests/rfq-1/accept' });
    expect(
      predictionSigningRequest(
        request('GET', '/v1/combos/builder/requests/rfq-1'),
        builderKey,
      ),
    ).toBeUndefined();
  });

  it.each([
    ['GET', '/v1/events'],
    ['GET', '/v1/sports'],
    ['GET', '/v1/comments'],
    ['GET', '/v1/tokens'],
    ['GET', '/v1/positions'],
    ['POST', '/v1/auth/refresh'],
  ] as const)('adds no API-key headers to %s %s', (method, path) => {
    expect(
      predictionSigningRequest(request(method, path), builderKey),
    ).toBeUndefined();
  });
});

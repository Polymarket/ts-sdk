import { OrderSide, OrderType, toTokenId } from '@polymarket/bindings';
import { SignatureType } from '@polymarket/bindings/clob';
import { RelayerTransactionType } from '@polymarket/bindings/relayer';
import {
  expectEvmAddress,
  expectEvmSignature,
  expectHexString,
} from '@polymarket/types';
import { expect, it, vi } from 'vitest';
import { fetchExecuteParams, fetchTransaction } from './actions/gasless';
import type { SignedOrder } from './actions/orders/types';
import { createPublicClient, createSecureClient } from './clients';
import { forkEnvironmentConfig } from './environments';
import { buildHmacSignature } from './hmac';
import type { Signer } from './types';
import { deriveBeaconDepositWalletAddress } from './wallet';

const address = expectEvmAddress('0x0000000000000000000000000000000000000001');
const root = 'https://predictions.invalid';
const environment = forkEnvironmentConfig({
  name: 'mock-predictions',
  predictions: { rest: root },
  clob: { rest: 'https://clob.invalid' },
  relayer: { rest: 'https://relayer.invalid' },
  data: { rest: 'https://data.invalid' },
});
const l2Credentials = {
  key: 'synthetic-order-owner',
  secret: btoa('synthetic-secret'),
  passphrase: 'synthetic-phrase',
};
const signature = expectEvmSignature(`0x${'1'.repeat(130)}`);
const wallet = deriveBeaconDepositWalletAddress(
  address,
  environment.walletDerivation,
);
function tokens(trading = true, ownerWallet = address) {
  return {
    accessToken: `test.${btoa(JSON.stringify({ sub: address, wallet: ownerWallet, signature_type: ownerWallet === address ? 0 : 3, clob_api_key: trading ? l2Credentials.key : undefined, exp: Math.floor(Date.now() / 1000) + 900 }))}.test`,
    refreshToken: 'synthetic-refresh',
    tokenType: 'Bearer',
    expiresIn: 900,
    refreshExpiresIn: 3600,
  };
}
const signer: Signer = {
  getAddress: async () => address,
  signTypedData: async () => signature,
  signMessage: vi.fn(),
  sendTransaction: vi.fn(),
};
const secureOptions = { environment, signer, wallet: address };

it.each([
  'bearer',
  'l2',
])('maps wallet reads and canonical signing (%s)', async (mechanism) => {
  const pair = tokens(true, wallet);
  const seen: string[] = [];
  const authorize = vi.fn(
    async (_request: import('./types').ApiKeyAuthorizationRequest) => ({
      POLY_BUILDER_API_KEY: 'synthetic-builder',
    }),
  );
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    seen.push(request.url);
    if (path === '/v1/auth/refresh') return Response.json(pair);
    if (path === '/auth/api-keys')
      return Response.json({ apiKeys: [l2Credentials.key] });
    if (path.endsWith('/deployed')) {
      expect(new URL(request.url).searchParams.get('address')).toBe(wallet);
      expect(request.headers.get('authorization')).toBe(
        mechanism === 'bearer' ? `Bearer ${pair.accessToken}` : null,
      );
      return Response.json({ deployed: true });
    }
    if (path === '/v1/wallets/execute-params')
      return Response.json({ address, nonce: '0' });
    if (path.endsWith('/transactions/mock-transaction'))
      return Response.json({
        state: 'STATE_NEW',
        transaction_id: 'mock-transaction',
        transaction_hash: '',
      });
    if (path === '/auth/api-key') return Response.json('OK');
    if (path === '/v1/auth/logout') return new Response(null, { status: 204 });
    throw new Error(`Unexpected mock route: ${path}`);
  });
  const secure = await createSecureClient({
    ...secureOptions,
    fetch,
    wallet,
    credentials: mechanism === 'bearer' ? pair : l2Credentials,
    apiKey: { isBuilderKey: true, supportGasless: true, authorize },
  });
  try {
    await fetchExecuteParams(secure, {
      address,
      type: RelayerTransactionType.WALLET,
    });
    await fetchTransaction(secure, { transactionId: 'mock-transaction' });
    const relayerRequests = seen
      .filter((url) => !url.includes('/auth/'))
      .map((url) => new URL(url).origin + new URL(url).pathname);
    expect(relayerRequests).toEqual([
      `${root}/v1/wallets/deployed`,
      `${root}/v1/wallets/execute-params`,
      `${root}/v1/wallets/transactions/mock-transaction`,
    ]);
    expect(authorize.mock.calls.map((call) => call[0].path)).toEqual(
      expect.arrayContaining([
        '/deployed',
        '/v1/account/transactions/params',
        '/v1/account/transactions/mock-transaction',
      ]),
    );
  } finally {
    await secure.endAuthentication();
  }
});

it('maps wallet deployment submission and polling', async () => {
  // Transport-only regression: no real deployment, signing, or network access.
  const pair = tokens(true, wallet);
  const seen: string[] = [];
  const authorize = vi.fn(
    async (_request: import('./types').ApiKeyAuthorizationRequest) => ({}),
  );
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    seen.push(`${request.method} ${path}`);
    if (path === '/v1/auth/refresh') return Response.json(pair);
    if (path === '/v1/wallets/deployed')
      return Response.json({ deployed: false });
    if (path === '/v1/wallets/transactions') {
      expect(await request.json()).toMatchObject({
        type: 'WALLET-CREATE',
        from: address,
      });
      return Response.json({
        state: 'STATE_NEW',
        transactionID: 'mock-deployment',
        transactionHash: null,
      });
    }
    if (path === '/v1/wallets/transactions/mock-deployment')
      return Response.json({
        state: 'STATE_CONFIRMED',
        transaction_id: 'mock-deployment',
        transaction_hash: `0x${'11'.repeat(32)}`,
      });
    if (path === '/v1/auth/logout') return new Response(null, { status: 204 });
    throw new Error(`Unexpected mock route: ${path}`);
  });
  const client = await createSecureClient({
    ...secureOptions,
    fetch,
    wallet,
    credentials: pair,
    apiKey: { isBuilderKey: true, supportGasless: true, authorize },
  });
  await client.endAuthentication();
  expect(seen).toEqual([
    'POST /v1/auth/refresh',
    'GET /v1/wallets/deployed',
    'POST /v1/wallets/transactions',
    'GET /v1/wallets/transactions/mock-deployment',
    'POST /v1/auth/logout',
  ]);
  expect(authorize.mock.calls.map((call) => call[0].path)).toEqual([
    '/deployed',
    '/submit',
    '/v1/account/transactions/mock-deployment',
  ]);
});

it.each(['l2', 'bearer'])('routes midpoint reads (%s)', async (mode) => {
  const pair = tokens();
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (request.url.endsWith('/auth/api-keys'))
      return Response.json({ apiKeys: [l2Credentials.key] });
    if (request.url.endsWith('/refresh')) return Response.json(pair);
    expect(request.url).toBe(`${root}/v1/pricing/midpoint?token_id=1`);
    expect(request.headers.get('authorization')).toBe(
      mode === 'bearer' ? `Bearer ${pair.accessToken}` : null,
    );
    expect(request.headers.has('POLY_API_KEY')).toBe(false);
    return Response.json({ mid: '0.5' });
  });
  const client = await createSecureClient({
    ...secureOptions,
    fetch,
    credentials: mode === 'l2' ? l2Credentials : pair,
  });
  try {
    await client.fetchMidpoint({ assetId: '1' });
  } finally {
    if (client.credentials.type === 'bearer') client.session.close();
    await client.closeSubscriptions();
  }
});

it.each([
  'l2',
  'bearer',
  'missing owner',
])('isolates order owners (%s)', async (mode) => {
  const pair = tokens(mode !== 'missing owner');
  const requests: Request[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (request.url.endsWith('/auth/api-keys'))
      return Response.json({ apiKeys: [l2Credentials.key] });
    if (request.url.endsWith('/refresh')) return Response.json(pair);
    requests.push(request);
    expect(request.url).toBe(`${root}/v1/orders`);
    const body = await request.clone().text();
    expect(JSON.parse(body).owner).toBe(l2Credentials.key);
    expect(body).not.toContain(pair.accessToken);
    expect(body).not.toContain(pair.refreshToken);
    if (mode === 'l2')
      expect(request.headers.get('POLY_SIGNATURE')).toBe(
        await buildHmacSignature(
          l2Credentials.secret,
          Number(request.headers.get('POLY_TIMESTAMP')),
          'POST',
          '/order',
          body,
        ),
      );
    else
      expect(request.headers.get('authorization')).toBe(
        `Bearer ${pair.accessToken}`,
      );
    return Response.json({
      success: true,
      errorMsg: '',
      orderID: 'synthetic-order',
      status: 'live',
      makingAmount: '0',
      takingAmount: '0',
    });
  });
  const client = await createSecureClient({
    ...secureOptions,
    fetch,
    credentials: mode === 'l2' ? l2Credentials : pair,
  });
  const order: SignedOrder = {
    builder: expectHexString(`0x${'00'.repeat(32)}`),
    expiration: 0,
    maker: address,
    makerAmount: '1',
    metadata: expectHexString(`0x${'00'.repeat(32)}`),
    orderType: OrderType.GTC,
    salt: '1',
    side: OrderSide.BUY,
    signatureType: SignatureType.EOA,
    signer: address,
    takerAmount: '2',
    timestamp: String(Date.now()),
    tokenId: toTokenId('1'),
    signature,
  };
  try {
    const posted = client.postOrder(order);
    if (mode === 'missing owner') {
      await expect(posted).rejects.toMatchObject({ status: 401 });
      expect(requests).toHaveLength(0);
    } else {
      await posted;
      expect(requests).toHaveLength(1);
    }
  } finally {
    if (client.credentials.type === 'bearer') client.session.close();
    await client.closeSubscriptions();
  }
});

it('uses Predictions for covered discovery, portfolio and combo reads and keeps unsupported token reads direct', async () => {
  const seen: string[] = [];
  const client = createPublicClient({
    environment,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      expect(request.headers.has('authorization')).toBe(false);
      expect(request.headers.has('POLY_API_KEY')).toBe(false);
      seen.push(url.origin + url.pathname);
      if (url.pathname === '/v1/sports') return Response.json([]);
      if (url.pathname === '/v1/positions')
        return Response.json({
          data: [],
          pagination: {
            limit: 100,
            offset: 0,
            has_more: false,
            next_cursor: null,
          },
        });
      if (url.pathname === '/v1/combos/markets')
        return Response.json({ markets: [] });
      return Response.json({ data: [] });
    },
  });
  await client.listSports();
  await client.listPositions({ user: address }).firstPage();
  await client.listComboMarkets().firstPage();
  await client.fetchTokenReferences({ assetIds: ['1'] });
  expect(seen).toEqual([
    `${root}/v1/sports`,
    `${root}/v1/positions`,
    `${root}/v1/combos/markets`,
    'https://data.invalid/v2/tokens',
  ]);
});

it.each([
  {
    path: '/v1/me/balance-allowances/refresh',
    method: 'GET',
    signingPath: '/balance-allowance/update',
    options: { params: new URLSearchParams({ asset_type: 'COLLATERAL' }) },
    query: '?asset_type=COLLATERAL',
    body: undefined,
  },
  {
    path: '/v1/wallets/collateral-return/submit',
    method: 'POST',
    signingPath: '/submit',
    options: {
      json: { envelope: { nonce: '1' }, plan_hash: 'synthetic-plan' },
    },
    query: '',
    body: '{"nonce":"1"}',
  },
])('signs the canonical request for POST $path', async ({
  path,
  method,
  signingPath,
  options,
  query,
  body,
}) => {
  const authorize = vi.fn(async () => ({
    'x-builder-proof': 'synthetic-proof',
  }));
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (request.url.endsWith('/auth/api-keys'))
      return Response.json({ apiKeys: [l2Credentials.key] });
    expect(request.url).toBe(root + path + query);
    expect(request.method).toBe('POST');
    expect(request.headers.get('x-builder-proof')).toBe('synthetic-proof');
    if (method === 'GET')
      expect(request.headers.get('POLY_SIGNATURE')).toBe(
        await buildHmacSignature(
          l2Credentials.secret,
          Number(request.headers.get('POLY_TIMESTAMP')),
          method,
          signingPath,
          body,
        ),
      );
    return Response.json('accepted');
  });
  const client = await createSecureClient({
    ...secureOptions,
    fetch,
    credentials: l2Credentials,
    apiKey: { isBuilderKey: true, supportGasless: true, authorize },
  });
  authorize.mockClear();
  await client.predictions.post(path, options);
  expect(authorize).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ method, path: signingPath, body }),
    expect.anything(),
  );
  await client.closeSubscriptions();
});

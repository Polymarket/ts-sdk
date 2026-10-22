import { createHmac } from 'node:crypto';
import { inspect } from 'node:util';
import { OrderSide, OrderType, toTokenId } from '@polymarket/bindings';
import { SignatureType } from '@polymarket/bindings/clob';
import {
  expectEvmAddress,
  expectEvmSignature,
  expectHexString,
} from '@polymarket/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createApiKey,
  createBuilderApiKey,
  createOrDeriveApiKey,
  deleteApiKey,
  deriveApiKey,
  fetchApiKeys,
  fetchBuilderApiKeys,
  revokeBuilderApiKey,
} from './actions/auth';
import { deployDepositWallet } from './actions/gasless';
import type { SignedOrder } from './actions/orders/types';
import {
  relayerApiKey,
  remoteBuilderSigning,
  remotePlatformApiKey,
} from './authorization';
import { createPublicClient, createSecureClient } from './clients';
import { ClientCredentialsSchema } from './credentials';
import { forkEnvironmentConfig } from './environments';
// biome-ignore lint/style/noRestrictedImports: This test exercises the server-only public adapter boundary.
import { builderApiKey, platformApiKey } from './node';
import { ServiceClient } from './ServiceClient';
import type { Signer } from './types';

const signerAddress = expectEvmAddress(
  '0x0000000000000000000000000000000000000001',
);
const gateway = 'https://synthetic.invalid';
const clientId = '00000000-0000-4000-8000-000000000001';
const key = 'pm_sk_synthetic-server-only';
const l2Credentials = {
  key: 'synthetic-builder-key',
  secret: btoa('synthetic-builder-secret'),
  passphrase: 'synthetic-builder-passphrase',
};
const signature = expectEvmSignature(`0x${'1'.repeat(130)}`);
const challenge = {
  challengeId: '00000000-0000-4000-8000-000000000002',
  expiresAt: '2099-01-01T00:00:00Z',
  typedData: {
    domain: {},
    types: {},
    primaryType: 'Synthetic',
    message: { challenge: 'synthetic-proof' },
  },
};
const environment = forkEnvironmentConfig({
  name: 'controlled-platform-boundary',
  predictions: { rest: gateway },
});
const sessionExpiry = Math.floor(Date.now() / 1000) + 900;
function tokens(sequence = 0, attributedClient = clientId) {
  return {
    accessToken: `test.${btoa(JSON.stringify({ sub: signerAddress, wallet: signerAddress, signature_type: 0, clob_api_key: 'synthetic-trading-key', client_id: attributedClient, exp: sessionExpiry, jti: sequence }))}.test`,
    refreshToken: `synthetic-refresh-${sequence}`,
    tokenType: 'Bearer',
    expiresIn: 900,
    refreshExpiresIn: 3600,
  };
}
function signer(): Signer {
  return {
    getAddress: vi.fn(async () => signerAddress),
    signTypedData: vi.fn(async () => signature),
    signMessage: vi.fn(),
    sendTransaction: vi.fn(),
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('platform API key client workflow', () => {
  it.each([
    '/api/auth/challenge?tenant=one',
    'https://app.synthetic.invalid/exact-endpoint?tenant=one',
  ])('proxies only challenge fields to %s and keeps login, refresh and logout direct', async (url) => {
    const proxyRequests: { input: unknown; init?: RequestInit }[] = [];
    const gatewayRequests: Request[] = [];
    const walletSigner = signer();
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (input === url) {
        proxyRequests.push({ input, init });
        expect(new Headers(init?.headers).get('x-app-auth')).toBe(
          'synthetic-app-session',
        );
        expect(new Headers(init?.headers).has('x-api-key')).toBe(false);
        expect(init?.credentials).toBe('include');
        expect(init?.cache).toBe('no-store');
        expect(JSON.parse(String(init?.body))).toEqual({
          signer: signerAddress,
          wallet: signerAddress,
          nonce: 7,
          verification_token: 'synthetic-turnstile',
        });
        return Response.json(challenge, {
          headers: { 'cache-control': 'no-store' },
        });
      }
      const request = new Request(input, init);
      gatewayRequests.push(request.clone());
      expect(request.headers.has('x-api-key')).toBe(false);
      if (request.url.endsWith('/refresh')) return Response.json(tokens(1));
      if (request.url.endsWith('/logout'))
        return new Response(null, { status: 204 });
      expect(request.url).toBe(`${gateway}/v1/auth/login`);
      expect(await request.json()).toEqual({
        ownership: { challenge_id: challenge.challengeId, signature },
      });
      expect(request.headers.has('x-api-key')).toBe(false);
      return Response.json(tokens());
    });
    const options = {
      signer: walletSigner,
      wallet: signerAddress,
      nonce: 7,
      verificationToken: 'synthetic-turnstile',
      client_id: 'polymarket-web',
      signature: 'must-not-forward',
      accessToken: 'must-not-forward',
      refreshToken: 'must-not-forward',
    };
    const secure = await createSecureClient({
      environment,
      fetch,
      apiKey: remotePlatformApiKey({
        url,
        credentials: 'include',
        headers: async () => ({ 'x-app-auth': 'synthetic-app-session' }),
      }),
      ...options,
    });
    await secure.session.refresh();
    expect(secure.session.claims.client_id).toBe(clientId);
    await secure.endAuthentication();
    expect(walletSigner.signTypedData).toHaveBeenCalledExactlyOnceWith(
      challenge.typedData,
    );
    expect(proxyRequests).toHaveLength(1);
    expect(gatewayRequests.map((request) => request.url)).toEqual([
      `${gateway}/v1/auth/login`,
      `${gateway}/v1/auth/refresh`,
      `${gateway}/v1/auth/logout`,
    ]);
    expect(JSON.stringify(proxyRequests)).not.toContain(signature);
    expect(JSON.stringify(proxyRequests)).not.toContain(tokens().refreshToken);
  });

  it('keeps server-key headers on gateway requests and uses one direct refresh lifecycle without a key exchange', async () => {
    const requests: Request[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      const path = new URL(request.url).pathname;
      if (path === '/v1/auth/challenge') {
        expect(request.headers.get('x-api-key')).toBe(key);
        return Response.json(challenge);
      }
      if (path === '/v1/auth/login') {
        expect(request.headers.get('x-api-key')).toBe(key);
        return Response.json(tokens());
      }
      if (path === '/v1/auth/refresh') {
        expect(request.headers.has('x-api-key')).toBe(false);
        expect(await request.json()).toEqual({
          refresh_token: tokens().refreshToken,
        });
        return Response.json(tokens(1));
      }
      if (path === '/v1/auth/logout') {
        expect(request.headers.has('x-api-key')).toBe(false);
        expect(await request.text()).toBe('');
        return new Response(null, { status: 204 });
      }
      expect(request.headers.get('x-api-key')).toBe(key);
      expect(request.headers.get('authorization')).toBe(
        `Bearer ${tokens(1).accessToken}`,
      );
      return Response.json({ ok: true });
    });
    const changed = vi.fn();
    const secure = await createSecureClient({
      environment,
      fetch,
      signer: signer(),
      wallet: signerAddress,
      apiKey: platformApiKey(key),
      onCredentialsChanged: changed,
    });
    await Promise.all([secure.session.refresh(), secure.session.refresh()]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(secure.session.claims.client_id).toBe(clientId);
    await secure.predictions.get('/private', { retries: 0 });
    await secure.secureClob.get('/account', { retries: 0 });
    await secure.relayer.get('/quota', { retries: 0 });
    await secure.endAuthentication();
    expect(requests.filter((r) => r.url.endsWith('/refresh'))).toHaveLength(1);
    expect(inspect(platformApiKey(key))).not.toContain(key);
  });

  it('surfaces a conflicting key rejection without signing again or inventing attribution', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith('/challenge')) return Response.json(challenge);
      return Response.json(
        { code: 'api_key_mismatch', message: key },
        { status: 401 },
      );
    });
    const walletSigner = signer();
    const changed = vi.fn();
    await expect(
      createSecureClient({
        environment,
        fetch,
        signer: walletSigner,
        wallet: signerAddress,
        apiKey: platformApiKey(key),
        onCredentialsChanged: changed,
      }),
    ).rejects.toMatchObject({
      code: 'api_key_mismatch',
      status: 401,
      message: 'Authentication request rejected.',
    });
    expect(walletSigner.signTypedData).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
  });

  it('rejects a refresh that tries to change server-bound client attribution', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith('/challenge')) return Response.json(challenge);
      return Response.json(
        request.url.endsWith('/refresh')
          ? tokens(1, 'polymarket-web')
          : tokens(),
      );
    });
    const secure = await createSecureClient({
      environment,
      fetch,
      signer: signer(),
      wallet: signerAddress,
      apiKey: platformApiKey(key),
    });
    const pair = secure.credentials;
    await expect(secure.session.refresh()).rejects.toMatchObject({
      name: 'RequestRejectedError',
    });
    expect(secure.credentials).toEqual(pair);
    secure.session.close();
    await secure.closeSubscriptions();
  });
});

describe('platform API-key compatibility', () => {
  it.each([
    'l2',
    'bearer',
  ] as const)('requires submission authorization appropriate to %s wallet requests', async (mechanism) => {
    const apiKey = platformApiKey(key);
    expect(apiKey.supportGasless).toBe(false);
    const walletSigner = signer();
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      if (request.url === `${gateway}/v1/auth/refresh`)
        return Response.json(tokens());
      if (request.url === `${environment.clob.rest}/auth/api-keys`) {
        expect(request.headers.has('x-api-key')).toBe(false);
        return Response.json({ apiKeys: [l2Credentials.key] });
      }
      expect(request.url).toBe(`${gateway}/v1/wallets/transactions`);
      expect(request.headers.get('authorization')).toBe(
        `Bearer ${tokens().accessToken}`,
      );
      expect(request.headers.get('x-api-key')).toBe(key);
      expect(request.headers.has('poly_builder_signature')).toBe(false);
      return Response.json({
        state: 'STATE_NEW',
        transactionID: 'synthetic-deployment',
        transactionHash: null,
      });
    });
    const secure = await createSecureClient({
      environment,
      fetch,
      signer: walletSigner,
      wallet: signerAddress,
      apiKey,
      credentials: mechanism === 'l2' ? l2Credentials : tokens(),
    });
    fetch.mockClear();
    // Direct-only workflows retain their separate submission-key requirement.
    expect(secure.supportsGasless).toBe(false);
    expect(secure.supportsGaslessWallet).toBe(mechanism === 'bearer');
    if (mechanism === 'l2') {
      await expect(deployDepositWallet(secure)).rejects.toMatchObject({
        name: 'UserInputError',
        message: expect.stringContaining('requires submission credentials'),
      });
      expect(fetch).not.toHaveBeenCalled();
    } else {
      await expect(deployDepositWallet(secure)).resolves.toMatchObject({
        transactionHash: null,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
    expect(walletSigner.signTypedData).not.toHaveBeenCalled();
    secure.closeAuthenticationSession();
    await secure.closeSubscriptions();
  });

  it('retains relayer submission authorization alongside the platform key', async () => {
    const quotaAdapter = platformApiKey(key, {
      legacyApiKey: relayerApiKey({
        key: 'synthetic-relayer',
        address: signerAddress,
      }),
    });
    expect(
      new Headers(
        await quotaAdapter.authorize({ method: 'POST', path: '/submit' }),
      ).get('relayer_api_key'),
    ).toBe('synthetic-relayer');
  });

  it('retains remote builder signing as a separate endpoint and does not infer gasless support from remote attribution', async () => {
    const standalone = remotePlatformApiKey({ url: '/challenge' });
    expect(standalone.supportGasless).toBe(false);
    const adapter = remotePlatformApiKey({
      url: '/challenge',
      legacyApiKey: remoteBuilderSigning({ url: '/builder/sign' }),
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      expect(input).toBe('/builder/sign');
      return Response.json({
        POLY_BUILDER_API_KEY: l2Credentials.key,
        POLY_BUILDER_TIMESTAMP: '1',
        POLY_BUILDER_PASSPHRASE: l2Credentials.passphrase,
        POLY_BUILDER_SIGNATURE: 'synthetic-proof',
      });
    });
    const headers = await adapter.authorize(
      { method: 'POST', path: '/order', body: '{"signed":"order"}' },
      { fetch },
    );
    expect(new Headers(headers).get('poly_builder_api_key')).toBe(
      l2Credentials.key,
    );
    expect(adapter.isBuilderKey).toBe(true);
    expect(adapter.supportGasless).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('challenge proxy failures and cancellation', () => {
  it.each([
    401,
    503,
    'transport',
  ] as const)('redacts a %s proxy failure before wallet signing', async (status) => {
    const url = '/challenge';
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(Object.keys(body)).toEqual(['signer', 'wallet']);
      const message = `${key} ${signature} ${tokens().accessToken} ${tokens().refreshToken}`;
      if (status === 'transport') throw new Error(message);
      return Response.json(
        {
          code:
            status === 401
              ? 'invalid_api_key'
              : 'identity_provider_unavailable',
          message,
        },
        { status },
      );
    });
    const walletSigner = signer();
    const result = createPublicClient({
      environment,
      fetch,
      apiKey: remotePlatformApiKey({ url }),
    }).login({ signer: walletSigner, wallet: signerAddress });
    const error = await result.catch((failure: unknown) => failure);
    expect(error).toMatchObject(
      status === 'transport'
        ? { name: 'TransportError' }
        : { name: 'RequestRejectedError', status },
    );
    const rendered = inspect(error, { depth: 10 });
    for (const secret of [
      key,
      signature,
      tokens().accessToken,
      tokens().refreshToken,
    ])
      expect(rendered).not.toContain(secret);
    expect(walletSigner.signTypedData).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects accidental browser-key configuration before dispatch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const error = await createPublicClient({
      environment,
      fetch,
      apiKey: remotePlatformApiKey({
        url: '/challenge',
        headers: { 'X-API-Key': key },
      }),
    })
      .login({ signer: signer() })
      .catch((failure: unknown) => failure);
    expect(error).toMatchObject({ name: 'UserInputError' });
    expect(inspect(error, { depth: 10 })).not.toContain(key);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels header resolution without dispatching a late challenge', async () => {
    const controller = new AbortController();
    const headers = Promise.withResolvers<HeadersInit>();
    const adapter = remotePlatformApiKey({
      url: '/challenge',
      headers: () => headers.promise,
    });
    if (adapter.createChallenge === undefined)
      throw new Error('Missing challenge hook');
    const fetch = vi.fn<typeof globalThis.fetch>();
    const pending = adapter.createChallenge(
      { signer: signerAddress },
      { fetch, signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      name: 'RequestAbortedError',
    });
    headers.resolve({ 'x-app-auth': 'late-app-session' });
    await headers.promise;
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bounds a stalled proxy request and removes its timeout after normal completion', async () => {
    vi.useFakeTimers();
    const adapter = remotePlatformApiKey({ url: '/challenge' });
    if (adapter.createChallenge === undefined)
      throw new Error('Missing challenge hook');
    const pending = adapter.createChallenge(
      { signer: signerAddress },
      { fetch: async () => new Promise<Response>(() => undefined) },
    );
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'TransportError',
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    await adapter.createChallenge(
      { signer: signerAddress },
      { fetch: async () => Response.json(challenge) },
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('requires server-side L2 migration for platform attribution and never sends proofs to a challenge-only proxy', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const client = createPublicClient({
    environment,
    fetch,
    apiKey: remotePlatformApiKey({ url: '/challenge' }),
  });
  await expect(
    client.migrateCredentials({
      signer: signerAddress,
      wallet: signerAddress,
      credentials: l2Credentials,
    }),
  ).rejects.toMatchObject({
    name: 'UserInputError',
    message: expect.stringContaining('Migrate L2 credentials on your server'),
  });
  expect(fetch).not.toHaveBeenCalled();
});

it('rejects conflicting platform adapters nested as builder/submission authorization', () => {
  expect(() =>
    platformApiKey(key, {
      legacyApiKey: platformApiKey('pm_sk_other-synthetic'),
    }),
  ).toThrow(/builder or submission/i);
  expect(() =>
    remotePlatformApiKey({
      url: '/challenge',
      legacyApiKey: remotePlatformApiKey({ url: '/other' }),
    }),
  ).toThrow(/builder or submission/i);
});

it('redacts reflected platform and bearer secrets from authenticated HTTP errors and custom-fetch failures', async () => {
  for (const transportFailure of [false, true]) {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith('/challenge')) return Response.json(challenge);
      if (request.url.endsWith('/login')) return Response.json(tokens());
      const message = `Rejected ${key} ${tokens().accessToken} ${tokens().refreshToken}`;
      if (transportFailure) throw new Error(message);
      return Response.json(
        { code: 'request_rejected', message },
        { status: 403 },
      );
    });
    const secure = await createSecureClient({
      environment,
      fetch,
      signer: signer(),
      wallet: signerAddress,
      apiKey: platformApiKey(key),
    });
    const error = await secure.predictions
      .get('/private', { retries: 0 })
      .catch((failure: unknown) => failure);
    const rendered = inspect(error, { depth: 10 });
    for (const secret of [key, tokens().accessToken, tokens().refreshToken])
      expect(rendered).not.toContain(secret);
    expect(error).toMatchObject({
      name: transportFailure ? 'TransportError' : 'RequestRejectedError',
    });
    secure.session.close();
    await secure.closeSubscriptions();
  }
});

it('preserves Headers-based builder/submission authorization alongside the platform key and keeps Perps/direct routing separate', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (request.url.endsWith('/challenge')) return Response.json(challenge);
    if (request.url.endsWith('/login')) return Response.json(tokens());
    if (request.url.startsWith(environment.perps.rest)) {
      expect(request.headers.has('x-api-key')).toBe(false);
      expect(request.headers.has('authorization')).toBe(false);
    } else {
      expect(request.headers.get('poly_builder_api_key')).toBe(
        l2Credentials.key,
      );
      expect(request.headers.get('poly_builder_signature')).toBe(
        'synthetic-proof',
      );
      expect(request.headers.get('authorization')).toBe(
        `Bearer ${tokens().accessToken}`,
      );
      expect(request.headers.get('x-api-key')).toBe(
        new URL(request.url).origin === new URL(gateway).origin ? key : null,
      );
      expect(await request.json()).toEqual({ signature });
    }
    return Response.json({ ok: true });
  });
  const directAuthorization = {
    isBuilderKey: true,
    supportGasless: true,
    authorize: async () =>
      new Headers({
        POLY_BUILDER_API_KEY: l2Credentials.key,
        POLY_BUILDER_SIGNATURE: 'synthetic-proof',
      }),
  };
  const secure = await createSecureClient({
    environment,
    fetch,
    signer: signer(),
    wallet: signerAddress,
    apiKey: platformApiKey(key, { legacyApiKey: directAuthorization }),
  });
  await secure.secureClob.post('/synthetic-order', { json: { signature } });
  await secure.relayer.post('/synthetic-submit', { json: { signature } });
  await secure.builderGateway.post('/synthetic-builder', {
    json: { signature },
  });
  await secure.perps.get('/public', { retries: 0 });
  secure.session.close();
  await secure.closeSubscriptions();
});

it('migrates L2 credentials directly on the server with the platform key and keeps secrets local', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    expect(request.url).toBe(`${gateway}/v1/auth/migrate`);
    expect(request.headers.get('x-api-key')).toBe(key);
    const body = await request.json();
    expect(body).toMatchObject({
      signer: signerAddress,
      wallet: signerAddress,
      clob_api_key: l2Credentials.key,
    });
    expect(body).not.toHaveProperty('client_id');
    expect(body).not.toHaveProperty('secret');
    expect(JSON.stringify(body)).not.toContain(l2Credentials.secret);
    return Response.json(tokens());
  });
  const request = {
    signer: signerAddress,
    wallet: signerAddress,
    credentials: l2Credentials,
    client_id: 'polymarket-web',
  };
  await expect(
    createPublicClient({
      environment,
      fetch,
      apiKey: platformApiKey(key),
    }).migrateCredentials(request),
  ).resolves.toHaveProperty('refreshToken');
});

it('retains signed order payloads, builder attribution and gasless deployment authorization under platform configuration', async () => {
  // Controlled transport only: no real signing, deployment, order submission or polling.
  const builder = expectHexString(`0x${'ab'.repeat(32)}`);
  const order: SignedOrder = {
    builder,
    expiration: 0,
    maker: signerAddress,
    makerAmount: '1000000',
    metadata: expectHexString(`0x${'00'.repeat(32)}`),
    orderType: OrderType.GTC,
    salt: '1',
    side: OrderSide.BUY,
    signatureType: SignatureType.EOA,
    signer: signerAddress,
    takerAmount: '2000000',
    timestamp: String(Date.now()),
    tokenId: toTokenId('1'),
    signature,
  };
  const walletSigner = signer();
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (request.url.endsWith('/challenge')) return Response.json(challenge);
    if (request.url.endsWith('/login')) return Response.json(tokens());
    expect(request.headers.get('x-api-key')).toBe(key);
    expect(request.headers.get('authorization')).toBe(
      `Bearer ${tokens().accessToken}`,
    );
    expect(request.headers.get('poly_builder_api_key')).toBe(l2Credentials.key);
    expect(request.headers.get('poly_builder_signature')).toBeTruthy();
    const body = await request.json();
    if (request.url === `${gateway}/order`) {
      expect(body).toMatchObject({
        owner: 'synthetic-trading-key',
        order: {
          signature,
          builder,
          maker: signerAddress,
          signatureType: SignatureType.EOA,
        },
      });
      return Response.json({
        success: true,
        errorMsg: '',
        orderID: 'synthetic-order',
        status: 'live',
        makingAmount: '0',
        takingAmount: '0',
      });
    }
    expect(request.url).toBe(`${gateway}/v1/wallets/transactions`);
    expect(request.headers.get('poly_builder_signature')).toBe(
      createHmac('sha256', Buffer.from(l2Credentials.secret, 'base64'))
        .update(
          `${request.headers.get('poly_builder_timestamp')}POST/submit${JSON.stringify(body)}`,
        )
        .digest('base64')
        .replaceAll('+', '-')
        .replaceAll('/', '_'),
    );
    expect(body).toMatchObject({
      from: signerAddress,
      to: environment.walletDerivation.depositWalletFactory,
      type: 'WALLET-CREATE',
    });
    return Response.json({
      state: 'STATE_NEW',
      transactionID: 'synthetic-deployment',
      transactionHash: null,
    });
  });
  const secure = await createSecureClient({
    environment,
    fetch,
    signer: walletSigner,
    wallet: signerAddress,
    apiKey: platformApiKey(key, { legacyApiKey: builderApiKey(l2Credentials) }),
  });
  await expect(secure.postOrder(order)).resolves.toMatchObject({
    ok: true,
    orderId: 'synthetic-order',
  });
  const handle = await deployDepositWallet(secure);
  expect(handle.transactionHash).toBeNull();
  expect(walletSigner.signTypedData).toHaveBeenCalledTimes(1);
  secure.session.close();
  await secure.closeSubscriptions();
});

describe('direct credential administration endpoints', () => {
  const direct = 'https://direct-credentials.invalid';
  const keyEnvironment = forkEnvironmentConfig({
    name: 'mock-key-endpoints',
    predictions: { rest: gateway },
    clob: { rest: direct },
  });
  const owner = {
    key: 'synthetic-owner-key',
    secret: btoa('synthetic-owner-secret'),
    passphrase: 'synthetic-owner-passphrase',
  };
  const l1 = { address: signerAddress, nonce: 7, signature, timestamp: 1_000 };

  it.each([
    'public',
    'bearer',
  ])('uses the direct service for explicit L1 requests on a %s client', async (kind) => {
    const seen: Request[] = [];
    let creates = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      if (request.url === `${gateway}/v1/auth/refresh`)
        return Response.json(tokens());
      seen.push(request);
      expect(new URL(request.url).origin).toBe(direct);
      expect(request.headers.has('authorization')).toBe(false);
      expect(request.headers.has('x-api-key')).toBe(false);
      expect(request.headers.has('POLY_API_KEY')).toBe(false);
      expect(request.headers.has('POLY_BUILDER_API_KEY')).toBe(false);
      expect(request.headers.get('POLY_ADDRESS')).toBe(signerAddress);
      expect(request.headers.get('POLY_NONCE')).toBe('7');
      expect(request.headers.get('POLY_TIMESTAMP')).toBe('1000');
      expect(request.headers.get('POLY_SIGNATURE')).toBe(signature);
      if (request.method === 'POST' && ++creates === 2)
        return Response.json({ code: 'already_exists' }, { status: 400 });
      return Response.json({
        apiKey: owner.key,
        secret: owner.secret,
        passphrase: owner.passphrase,
      });
    });
    const options = {
      environment: keyEnvironment,
      fetch,
      apiKey: platformApiKey(key, {
        legacyApiKey: builderApiKey(l2Credentials),
      }),
    };
    const client =
      kind === 'bearer'
        ? await createSecureClient({
            ...options,
            signer: signer(),
            wallet: signerAddress,
            credentials: tokens(),
          })
        : createPublicClient(options);
    try {
      await expect(createApiKey(client, l1)).resolves.toEqual(owner);
      await expect(deriveApiKey(client, l1)).resolves.toEqual(owner);
      await expect(createOrDeriveApiKey(client, l1)).resolves.toEqual(owner);
      expect(
        seen.map((request) => [request.method, new URL(request.url).pathname]),
      ).toEqual([
        ['POST', '/auth/api-key'],
        ['GET', '/auth/derive-api-key'],
        ['POST', '/auth/api-key'],
        ['GET', '/auth/derive-api-key'],
      ]);
    } finally {
      if (client.isSecureClient()) {
        client.closeAuthenticationSession();
        await client.closeSubscriptions();
      }
    }
  });

  it('retains owner HMAC for L2 credential operations without platform headers', async () => {
    const seen: Request[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      seen.push(request);
      expect(new URL(request.url).origin).toBe(direct);
      expect(request.headers.has('authorization')).toBe(false);
      expect(request.headers.has('x-api-key')).toBe(false);
      expect(request.headers.has('POLY_BUILDER_API_KEY')).toBe(false);
      expect(request.headers.get('POLY_API_KEY')).toBe(owner.key);
      expect(request.headers.get('POLY_PASSPHRASE')).toBe(owner.passphrase);
      const path = new URL(request.url).pathname;
      expect(request.headers.get('POLY_SIGNATURE')).toBe(
        createHmac('sha256', Buffer.from(owner.secret, 'base64'))
          .update(
            `${request.headers.get('POLY_TIMESTAMP')}${request.method}${path}`,
          )
          .digest('base64')
          .replaceAll('+', '-')
          .replaceAll('/', '_'),
      );
      if (path === '/auth/api-keys')
        return Response.json({ apiKeys: [owner.key] });
      if (request.method === 'DELETE') return Response.json('OK');
      if (request.method === 'POST') return Response.json(l2Credentials);
      return Response.json([l2Credentials.key]);
    });
    const client = await createSecureClient({
      environment: keyEnvironment,
      fetch,
      signer: signer(),
      wallet: signerAddress,
      credentials: owner,
      apiKey: platformApiKey(key),
    });
    await expect(fetchApiKeys(client)).resolves.toEqual([owner.key]);
    await expect(createBuilderApiKey(client)).resolves.toEqual(l2Credentials);
    await expect(fetchBuilderApiKeys(client)).resolves.toEqual([
      { key: l2Credentials.key },
    ]);
    await deleteApiKey(client);
    expect(
      seen.map((request) => [request.method, new URL(request.url).pathname]),
    ).toEqual([
      ['GET', '/auth/api-keys'],
      ['GET', '/auth/api-keys'],
      ['POST', '/auth/builder-api-key'],
      ['GET', '/auth/builder-api-key'],
      ['DELETE', '/auth/api-key'],
    ]);
    await client.closeSubscriptions();
  });

  it('rejects unsupported bearer-only owner administration before dispatch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(tokens()),
    );
    const client = await createSecureClient({
      environment: keyEnvironment,
      fetch,
      signer: signer(),
      wallet: signerAddress,
      credentials: tokens(),
      apiKey: platformApiKey(key),
    });
    const before = fetch.mock.calls.length;
    try {
      for (const operation of [
        fetchApiKeys,
        deleteApiKey,
        createBuilderApiKey,
        fetchBuilderApiKeys,
      ])
        await expect(operation(client)).rejects.toMatchObject({
          name: 'UserInputError',
          message: expect.stringContaining('L2 key/secret/passphrase'),
        });
      expect(fetch).toHaveBeenCalledTimes(before);
    } finally {
      client.closeAuthenticationSession();
      await client.closeSubscriptions();
    }
  });

  it('revokes with builder self-authentication on the direct endpoint and requires a configured signer', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      expect(request.url).toBe(`${direct}/auth/builder-api-key`);
      expect(request.method).toBe('DELETE');
      expect(request.headers.has('authorization')).toBe(false);
      expect(request.headers.has('x-api-key')).toBe(false);
      expect(request.headers.has('POLY_API_KEY')).toBe(false);
      expect(request.headers.get('POLY_BUILDER_API_KEY')).toBe(
        l2Credentials.key,
      );
      expect(request.headers.get('POLY_BUILDER_SIGNATURE')).toBe(
        createHmac('sha256', Buffer.from(l2Credentials.secret, 'base64'))
          .update(
            `${request.headers.get('POLY_BUILDER_TIMESTAMP')}DELETE/auth/builder-api-key`,
          )
          .digest('base64')
          .replaceAll('+', '-')
          .replaceAll('/', '_'),
      );
      return Response.json('OK');
    });
    await revokeBuilderApiKey(
      createPublicClient({
        environment: keyEnvironment,
        fetch,
        apiKey: platformApiKey(key, {
          legacyApiKey: builderApiKey(l2Credentials),
        }),
      }),
    );
    await expect(
      revokeBuilderApiKey(
        createPublicClient({
          environment: keyEnvironment,
          fetch,
          apiKey: platformApiKey(key),
        }),
      ),
    ).rejects.toMatchObject({ name: 'UserInputError' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it.each([
  ['l2', 'headers'],
  ['bearer', 'headers'],
  ['l2', 'response'],
  ['bearer', 'response'],
])('redacts all %s credential fields from a %s policy failure', async (mechanism, stage) => {
  const credentials = ClientCredentialsSchema.parse(
    mechanism === 'l2' ? l2Credentials : tokens(),
  );
  const values = Object.values(credentials);
  const message = values.join(' ');
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ code: 'invalid_credentials', message }, { status: 401 }),
  );
  const service = new ServiceClient({
    root: gateway,
    fetch,
    authentication: {
      credentials: async () => credentials,
      headers: () => {
        if (stage === 'headers') throw new Error(message);
        return {};
      },
      refreshToken: async () => false,
    },
  });
  const error = await service
    .get('/private')
    .catch((failure: unknown) => failure);
  expect(error).toMatchObject({
    name: stage === 'headers' ? 'TransportError' : 'RequestRejectedError',
  });
  for (const value of values)
    expect(inspect(error, { depth: 10 })).not.toContain(value);
  expect(fetch).toHaveBeenCalledTimes(stage === 'headers' ? 0 : 1);
});

import { createHmac } from 'node:crypto';
import { inspect } from 'node:util';
import type { BearerCredentials } from '@polymarket/bindings';
import { expectEvmAddress, expectEvmSignature } from '@polymarket/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedServiceClient } from './AuthenticatedServiceClient';
import { login, migrateCredentials } from './actions';
import {
  BasePublicClient,
  BaseSecureClient,
  createPublicClient,
  createSecureClient,
} from './clients';
import type { ClientCredentials } from './credentials';
import { forkEnvironmentConfig } from './environments';
import { RequestRejectedError, TransportError } from './errors';
import { AuthSession } from './session';
import type { Signer } from './types';
import { deriveBeaconDepositWalletAddress } from './wallet';

const address = expectEvmAddress('0x0000000000000000000000000000000000000001');
const root = 'https://synthetic.invalid';
const environment = forkEnvironmentConfig({
  name: 'controlled-auth-boundary',
  predictions: { rest: `${root}/` },
});
const l2Credentials = {
  key: 'synthetic-l2-key',
  secret: btoa('synthetic-hmac-secret'),
  passphrase: 'synthetic-passphrase',
};
const signature = expectEvmSignature(`0x${'1'.repeat(130)}`);
const typedData = {
  domain: { name: 'Synthetic' },
  types: { Proof: [{ name: 'nonce', type: 'uint256' }] },
  primaryType: 'Proof',
  message: { nonce: 0 },
};
function tokens(sequence = 0, seconds = 900) {
  return {
    accessToken: `test.${btoa(JSON.stringify({ sub: address, wallet: address, signature_type: 0, client_id: 'synthetic-client', clob_api_key: l2Credentials.key, exp: Math.floor(Date.now() / 1000) + seconds, jti: sequence }))}.test`,
    refreshToken: `synthetic-refresh-${sequence}`,
    tokenType: 'Bearer',
    expiresIn: seconds,
    refreshExpiresIn: 3600,
  };
}
function saved(pair: BearerCredentials): ClientCredentials {
  return {
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
  };
}
function signer(): Signer {
  return {
    getAddress: vi.fn(async () => address),
    signTypedData: vi.fn(async () => signature),
    signMessage: vi.fn(),
    sendTransaction: vi.fn(),
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('gateway public authentication boundary', () => {
  it('signs the served challenge, sends wallet/verification on challenge only and logs in directly', async () => {
    const walletSigner = signer();
    const loginTokens = tokens();
    const requests: Request[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      if (request.url.endsWith('/challenge'))
        return Response.json(
          {
            challengeId: '00000000-0000-4000-8000-000000000001',
            typedData,
            expiresAt: new Date(Date.now() + 90_000).toISOString(),
          },
          { status: 201 },
        );
      return Response.json(loginTokens);
    });
    const pair = await login(createPublicClient({ environment, fetch }), {
      signer: walletSigner,
      wallet: address,
      verificationToken: 'synthetic-verification',
    });
    expect(pair).toEqual({
      accessToken: loginTokens.accessToken,
      refreshToken: loginTokens.refreshToken,
    });
    expect(walletSigner.signTypedData).toHaveBeenCalledExactlyOnceWith(
      typedData,
    );
    expect(await requests[0]?.json()).toEqual({
      signer: address,
      wallet: address,
      verification_token: 'synthetic-verification',
    });
    expect(await requests[1]?.json()).toEqual({
      ownership: {
        challenge_id: '00000000-0000-4000-8000-000000000001',
        signature,
      },
    });
    expect(requests.map((r) => r.url)).toEqual([
      `${root}/v1/auth/challenge`,
      `${root}/v1/auth/login`,
    ]);
  });

  it('migrates with canonical seconds/HMAC proof without transmitting the secret or asking for a signature', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-19T12:00:00Z') });
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      expect(request.url).toBe(`${root}/v1/auth/migrate`);
      const body = await request.json();
      expect(body).toEqual({
        signer: address,
        wallet: address,
        verification_token: 'synthetic-verification',
        timestamp: '1792411200',
        clob_api_key: l2Credentials.key,
        clob_passphrase: l2Credentials.passphrase,
        clob_signature: createHmac(
          'sha256',
          Buffer.from(l2Credentials.secret, 'base64'),
        )
          .update('1792411200GET/auth/api-keys')
          .digest('base64')
          .replaceAll('+', '-')
          .replaceAll('/', '_'),
      });
      expect(JSON.stringify(body)).not.toContain(l2Credentials.secret);
      return Response.json(tokens());
    });
    const client = createPublicClient({ environment, fetch });
    await expect(
      migrateCredentials(client, {
        signer: address,
        wallet: address,
        credentials: l2Credentials,
        verificationToken: 'synthetic-verification',
      }),
    ).resolves.toHaveProperty('refreshToken');
  });

  it('automatically migrates supplied L2 credentials without signing or notifying persistence', async () => {
    const walletSigner = signer();
    const changed = vi.fn();
    const pair = tokens();
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      expect(request.url).toBe(`${root}/v1/auth/migrate`);
      expect(await request.json()).toMatchObject({
        signer: address,
        wallet: address,
      });
      return Response.json(pair);
    });
    const client = await createSecureClient({
      environment,
      fetch,
      signer: walletSigner,
      wallet: address,
      credentials: l2Credentials,
      onCredentialsChanged: changed,
    });
    expect(client.credentials).toEqual(saved(pair));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    expect(walletSigner.signTypedData).not.toHaveBeenCalled();
    client.closeAuthenticationSession();
    await client.closeSubscriptions();
  });

  it('rejects failed automatic migration without signing or notifying persistence', async () => {
    const walletSigner = signer();
    const changed = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ code: 'invalid_credentials' }, { status: 401 }),
    );
    await expect(
      createSecureClient({
        environment,
        fetch,
        signer: walletSigner,
        wallet: address,
        credentials: l2Credentials,
        onCredentialsChanged: changed,
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    expect(walletSigner.signTypedData).not.toHaveBeenCalled();
  });

  it('restores signer-only sessions without wallet discovery and permits authenticated user reads', async () => {
    const pair = tokens();
    const payload = JSON.parse(atob(pair.accessToken.split('.')[1] ?? ''));
    delete payload.wallet;
    delete payload.signature_type;
    pair.accessToken = `test.${btoa(JSON.stringify(payload))}.test`;
    const paths: string[] = [];
    const walletSigner = signer();
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      paths.push(path);
      if (path === '/v1/auth/refresh') return Response.json(pair);
      if (path === '/internal/users/me') {
        expect(request.headers.get('authorization')).toBe(
          `Bearer ${pair.accessToken}`,
        );
        return Response.json({ signer: address });
      }
      throw new Error(`Unexpected signer-only route: ${path}`);
    });
    const client = await createSecureClient({
      environment,
      fetch,
      signer: walletSigner,
      credentials: saved(pair),
    });
    try {
      await expect(
        client.predictions.get('/internal/users/me'),
      ).resolves.toEqual({ signer: address });
      expect(() => client.account).toThrow('wallet');
      await expect(client.webSockets.rfqQuoter.connect()).rejects.toThrow(
        'wallet',
      );
      expect(paths).toEqual(['/v1/auth/refresh', '/internal/users/me']);
      expect(walletSigner.signTypedData).not.toHaveBeenCalled();
    } finally {
      client.closeAuthenticationSession();
      await client.closeSubscriptions();
    }
  });

  it('refreshes expired saved credentials before returning and closes retained transports on logout', async () => {
    const restored = tokens(0, -1);
    const updated = tokens(1);
    const changed = vi.fn(async () => undefined);
    const requests: Request[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      requests.push(request.clone());
      if (request.url.endsWith('/refresh')) {
        expect(await request.json()).toEqual({
          refresh_token: restored.refreshToken,
        });
        return Response.json(updated);
      }
      if (request.url.endsWith('/logout')) {
        expect(request.headers.get('authorization')).toBe(
          `Bearer ${updated.accessToken}`,
        );
        expect(await request.text()).toBe('');
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected restoration route: ${request.url}`);
    });
    const secure = await createSecureClient({
      environment,
      fetch,
      signer: signer(),
      wallet: address,
      credentials: {
        accessToken: restored.accessToken,
        refreshToken: restored.refreshToken,
      },
      onCredentialsChanged: changed,
    });
    expect(secure.credentials).toEqual({
      accessToken: updated.accessToken,
      refreshToken: updated.refreshToken,
    });
    expect(changed).toHaveBeenCalledExactlyOnceWith(secure.credentials);
    const retainedTransport = secure.predictions;
    const publicClient = await secure.endAuthentication();
    expect(publicClient.isPublicClient()).toBe(true);
    await expect(retainedTransport.get('/private')).rejects.toThrow('closed');
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([
      '/v1/auth/refresh',
      '/v1/auth/logout',
    ]);
  });

  it('never returns an authenticated client for an irrecoverable restoration', async () => {
    const changed = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ code: 'invalid_refresh_token' }, { status: 401 }),
    );
    await expect(
      createSecureClient({
        environment,
        fetch,
        signer: signer(),
        wallet: address,
        credentials: saved(tokens(0, -1)),
        onCredentialsChanged: changed,
      }),
    ).rejects.toBeInstanceOf(RequestRejectedError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('expired-token HTTP recovery', () => {
  it('uses a newer pair for a stale in-flight 401 without refreshing twice', async () => {
    const first = Promise.withResolvers<Response>();
    const started = Promise.withResolvers<void>();
    const refresh = vi.fn(async () => tokens(1));
    const session = new AuthSession({ credentials: tokens(), refresh });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      if (fetch.mock.calls.length === 1) {
        started.resolve();
        return first.promise;
      }
      return Response.json({ ok: true });
    });
    let sentToken = session.credentials.accessToken;
    const pending = new AuthenticatedServiceClient({
      root,
      fetch,
      resolveHeaders: async (request) => {
        sentToken = (await session.ready(request.signal)).accessToken;
        return { Authorization: `Bearer ${sentToken}` };
      },
      refreshToken: async (signal) => {
        await session.recover(sentToken, signal);
        return true;
      },
    }).post('/protected', { json: { one: 1 } });
    await started.promise;
    await session.refresh();
    first.resolve(
      Response.json({ code: 'expired_access_token' }, { status: 401 }),
    );
    await expect(pending).resolves.toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    session.close();
  });
});

describe('logout revocation', () => {
  it.each([
    true,
    false,
  ])('refreshes a bearer for logout after suspension=%s, coalesces callers and stays closed', async (suspended) => {
    vi.useFakeTimers();
    const original = tokens();
    const pendingRefresh = Promise.withResolvers<Response>();
    const refreshStarted = Promise.withResolvers<void>();
    const changed = vi.fn();
    let logoutRequests = 0;
    let refreshRequests = 0;
    let expectedAccessToken = original.accessToken;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith('/challenge'))
        return Response.json({
          challengeId: '00000000-0000-4000-8000-000000000001',
          typedData,
          expiresAt: new Date(Date.now() + 90_000).toISOString(),
        });
      if (request.url.endsWith('/login')) return Response.json(original);
      if (request.url.endsWith('/refresh')) {
        refreshRequests++;
        expect(await request.json()).toEqual({
          refresh_token: original.refreshToken,
        });
        refreshStarted.resolve();
        return pendingRefresh.promise;
      }
      expect(request.url).toBe(`${root}/v1/auth/logout`);
      expect(await request.text()).toBe('');
      logoutRequests++;
      if (!suspended && logoutRequests === 1)
        return Response.json({ code: 'expired_access_token' }, { status: 401 });
      expect(request.headers.get('authorization')).toBe(
        `Bearer ${expectedAccessToken}`,
      );
      return new Response(null, { status: 204 });
    });
    const secure = await createSecureClient({
      environment,
      fetch,
      signer: signer(),
      wallet: address,
      onCredentialsChanged: changed,
    });
    const session = secure.session;
    const transport = secure.predictions;
    const perpsShutdown = vi.spyOn(secure.webSockets.perpsSession, 'shutdown');
    const rfqShutdown = vi.spyOn(secure.webSockets.rfqQuoter, 'shutdown');
    if (suspended) vi.setSystemTime(Date.now() + 901_000); // Tab suspension: do not run its refresh timer.
    const first = secure.endAuthentication();
    const second = secure.endAuthentication();
    expect(first).toBe(second);
    expect(() => secure.credentials).toThrow('ended authentication');
    await expect(transport.get('/private')).rejects.toThrow('closed');
    await refreshStarted.promise;
    const renewed = tokens(1);
    expectedAccessToken = renewed.accessToken;
    pendingRefresh.resolve(Response.json(renewed));
    const [one, two] = await Promise.all([first, second]);
    expect(one).toBe(two);
    expect(one.isPublicClient()).toBe(true);
    expect(refreshRequests).toBe(1);
    expect(logoutRequests).toBe(suspended ? 1 : 2);
    expect(perpsShutdown).toHaveBeenCalledTimes(1);
    expect(rfqShutdown).toHaveBeenCalledTimes(1);
    expect(session.credentials).toEqual({
      accessToken: original.accessToken,
      refreshToken: original.refreshToken,
    });
    expect(changed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'refresh',
    'logout',
  ])('cleans up unconditionally when %s fails, without replaying failures', async (failure) => {
    vi.useFakeTimers();
    const original = tokens();
    let refreshRequests = 0;
    let logoutRequests = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith('/challenge'))
        return Response.json({
          challengeId: '00000000-0000-4000-8000-000000000001',
          typedData,
          expiresAt: new Date(Date.now() + 90_000).toISOString(),
        });
      if (request.url.endsWith('/login')) return Response.json(original);
      if (request.url.endsWith('/refresh')) {
        refreshRequests++;
        return failure === 'refresh'
          ? Response.json({ code: 'invalid_refresh_token' }, { status: 401 })
          : Response.json(tokens(1));
      }
      expect(request.url).toBe(`${root}/v1/auth/logout`);
      logoutRequests++;
      return Response.json(
        { code: 'identity_provider_unavailable' },
        { status: 503 },
      );
    });
    const secure = await createSecureClient({
      environment,
      fetch,
      signer: signer(),
      wallet: address,
    });
    const session = secure.session;
    const transport = secure.predictions;
    const closing = vi.spyOn(secure.webSockets.clobUser, 'close');
    vi.setSystemTime(Date.now() + 901_000);
    await expect(secure.endAuthentication()).rejects.toMatchObject({
      name: 'RequestRejectedError',
      status: failure === 'refresh' ? 401 : 503,
    });
    expect(() => secure.credentials).toThrow('ended authentication');
    await expect(transport.get('/private')).rejects.toThrow('closed');
    expect(() => session.assertActive()).toThrow('closed');
    expect(closing).toHaveBeenCalledTimes(1);
    expect(refreshRequests).toBe(1);
    expect(logoutRequests).toBe(failure === 'refresh' ? 0 : 1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('maps signer address failures before dispatching authentication', async () => {
  const walletSigner = signer();
  walletSigner.getAddress = vi.fn(async () => {
    throw new Error('wallet provider failure');
  });
  const fetch = vi.fn<typeof globalThis.fetch>();
  await expect(
    createSecureClient({
      signer: walletSigner,
      environment,
      fetch,
      credentials: saved(tokens()),
    }),
  ).rejects.toMatchObject({
    name: 'SigningError',
    message: 'Could not obtain signer address.',
  });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  { ...tokens(), secret: 'must-not-select-bearer' },
  { key: 'key', secret: 42, passphrase: 'phrase' },
  {
    accessToken: 'opaque',
    refreshToken: 'refresh',
    secret: 'mixed',
  },
])('rejects mixed or malformed saved credentials before signing or dispatch: %j', async (credentials) => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const walletSigner = signer();
  await expect(
    createSecureClient({
      environment,
      fetch,
      signer: walletSigner,
      wallet: address,
      credentials: credentials as ClientCredentials,
    }),
  ).rejects.toMatchObject({ name: 'UserInputError' });
  expect(fetch).not.toHaveBeenCalled();
  expect(walletSigner.signTypedData).not.toHaveBeenCalled();
});

it('rejects mixed migration credentials before generating a proof or dispatching', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const client = createPublicClient({ environment, fetch });
  await expect(
    client.migrateCredentials({
      signer: address,
      credentials: { ...l2Credentials, ...tokens() },
    }),
  ).rejects.toMatchObject({ name: 'UserInputError' });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  { code: 'expired_access_token', rejectedReplay: false, attempts: 2 },
  { code: 'invalid_access_token', rejectedReplay: false, attempts: 1 },
  { code: 'expired_access_token', rejectedReplay: true, attempts: 2 },
])('bounds SecureClient recovery for $code (rejected replay: $rejectedReplay)', async ({
  code,
  rejectedReplay,
  attempts,
}) => {
  const pair = tokens();
  const rotated = tokens(1);
  let privateRequests = 0;
  let refreshRequests = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === '/v1/auth/refresh') {
      refreshRequests++;
      return Response.json(refreshRequests === 1 ? pair : rotated);
    }
    if (path === '/v1/auth/logout') return new Response(null, { status: 204 });
    if (path === '/private') {
      privateRequests++;
      expect(request.headers.get('authorization')).toBe(
        `Bearer ${privateRequests === 1 ? pair.accessToken : rotated.accessToken}`,
      );
      return privateRequests === 1 || rejectedReplay
        ? Response.json({ code }, { status: 401 })
        : Response.json('accepted');
    }
    throw new Error(`Unexpected mock route: ${path}`);
  });
  const client = await createSecureClient({
    environment,
    fetch,
    signer: signer(),
    wallet: address,
    credentials: saved(pair),
  });
  try {
    const request = client.predictions.get('/private');
    if (code === 'invalid_access_token' || rejectedReplay)
      await expect(request).rejects.toMatchObject({ status: 401 });
    else await expect(request).resolves.toBe('accepted');
    expect(client.credentials).toEqual({
      accessToken: attempts === 2 ? rotated.accessToken : pair.accessToken,
      refreshToken: attempts === 2 ? rotated.refreshToken : pair.refreshToken,
    });
    expect(refreshRequests).toBe(attempts);
    expect(privateRequests).toBe(attempts);
  } finally {
    client.closeAuthenticationSession();
    await client.closeSubscriptions();
  }
});

it.each([
  'POLY_BUILDER_API_KEY',
  'RELAYER_API_KEY',
])('combines bearer and %s headers on gateway requests', async (header) => {
  const pair = tokens();
  const client = await createSecureClient({
    environment,
    signer: signer(),
    wallet: address,
    credentials: saved(pair),
    apiKey: {
      isBuilderKey: header === 'POLY_BUILDER_API_KEY',
      supportGasless: true,
      authorize: async () =>
        new Headers({ [header]: 'synthetic-application-key' }),
    },
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith('/refresh')) return Response.json(pair);
      expect(request.headers.get('authorization')).toBe(
        `Bearer ${pair.accessToken}`,
      );
      expect(request.headers.get(header)).toBe('synthetic-application-key');
      return Response.json(true);
    },
  });
  try {
    await expect(client.predictions.post('/private')).resolves.toBe(true);
  } finally {
    client.closeAuthenticationSession();
    await client.closeSubscriptions();
  }
});

it.each([
  'transport',
  'rejected',
  'object',
  'string',
] as const)('drops secret causes while preserving the public %s failure', async (kind) => {
  const credentials = l2Credentials;
  const failure =
    kind === 'transport'
      ? new TransportError('Request failed', {
          cause: new Error(credentials.secret),
        })
      : kind === 'object'
        ? { secret: credentials.secret }
        : kind === 'string'
          ? credentials.secret
          : new RequestRejectedError('Request rejected', {
              status: 403,
              code: 'permission_denied',
              retryAfter: 2,
              cause: new Error(credentials.secret),
            });
  const client = await createSecureClient({
    environment,
    signer: signer(),
    wallet: address,
    credentials,
    fetch: async (input, init) => {
      if (new Request(input, init).url.endsWith('/v1/auth/migrate'))
        return Response.json(tokens());
      throw failure;
    },
  });
  try {
    const error = await client.predictions
      .get('/private')
      .catch((error: unknown) => error);
    expect(inspect(error, { depth: 10 })).not.toContain(credentials.secret);
    expect(error).toBeInstanceOf(
      kind === 'rejected' ? RequestRejectedError : TransportError,
    );
    if (kind === 'rejected')
      expect(error).toMatchObject({
        status: 403,
        code: 'permission_denied',
        retryAfter: 2,
      });
  } finally {
    client.closeAuthenticationSession();
    await client.closeSubscriptions();
  }
});

describe('failed secure-client creation owns newly issued sessions', () => {
  it.each([
    'fresh',
    'migrated',
  ])('revokes a %s session rejected before client construction and preserves the identity error if logout fails', async (mode) => {
    const pair = tokens();
    const payload = JSON.parse(atob(pair.accessToken.split('.')[1] ?? ''));
    payload.sub = '0x0000000000000000000000000000000000000002';
    pair.accessToken = `test.${btoa(JSON.stringify(payload))}.test`;
    const paths: string[] = [];
    const changed = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      paths.push(path);
      if (path.endsWith('/challenge'))
        return Response.json({
          challengeId: '00000000-0000-4000-8000-000000000001',
          typedData,
          expiresAt: new Date(Date.now() + 90_000).toISOString(),
        });
      if (path.endsWith('/logout')) {
        expect(request.headers.get('authorization')).toBe(
          `Bearer ${pair.accessToken}`,
        );
        return Response.json({ code: 'logout_unavailable' }, { status: 503 });
      }
      return Response.json(pair);
    });
    await expect(
      createSecureClient({
        environment,
        fetch,
        signer: signer(),
        wallet: address,
        ...(mode === 'migrated' ? { credentials: l2Credentials } : {}),
        onCredentialsChanged: changed,
      }),
    ).rejects.toMatchObject({
      name: 'RequestRejectedError',
      message:
        'Session identity does not match the requested signer and wallet.',
    });
    expect(paths.at(-1)).toBe('/v1/auth/logout');
    expect(paths.filter((path) => path.endsWith('/logout'))).toHaveLength(1);
    expect(changed).not.toHaveBeenCalled();
  });

  it('revokes a session when secure-client construction throws and preserves the original error', async () => {
    const failure = new Error('construction failed');
    vi.spyOn(
      BasePublicClient.prototype,
      'createAuthenticatedClient',
    ).mockImplementation(() => {
      throw failure;
    });
    const paths: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      paths.push(new URL(request.url).pathname);
      return request.url.endsWith('/logout')
        ? new Response(null, { status: 204 })
        : Response.json(tokens());
    });
    await expect(
      createSecureClient({
        environment,
        fetch,
        signer: signer(),
        wallet: address,
        credentials: l2Credentials,
      }),
    ).rejects.toBe(failure);
    expect(paths).toEqual(['/v1/auth/migrate', '/v1/auth/logout']);
  });

  it.each([
    'fresh',
    'migrated',
    'restored',
  ])('cleans up a %s session when initial readiness fails', async (mode) => {
    const paths: string[] = [];
    const closed = vi.spyOn(AuthSession.prototype, 'close');
    const changed = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      paths.push(path);
      if (path.endsWith('/challenge'))
        return Response.json({
          challengeId: '00000000-0000-4000-8000-000000000001',
          typedData,
          expiresAt: new Date(Date.now() + 90_000).toISOString(),
        });
      if (path.endsWith('/refresh'))
        return Response.json(
          { code: 'refresh_rejected', message: 'Refresh rejected' },
          { status: 401 },
        );
      if (path.endsWith('/logout')) return new Response(null, { status: 204 });
      return Response.json(tokens(0, 20));
    });
    await expect(
      createSecureClient({
        environment,
        fetch,
        signer: signer(),
        wallet: address,
        ...(mode === 'migrated'
          ? { credentials: l2Credentials }
          : mode === 'restored'
            ? { credentials: saved(tokens()) }
            : {}),
        onCredentialsChanged: changed,
      }),
    ).rejects.toMatchObject({ status: 401, code: 'refresh_rejected' });
    expect(paths.filter((path) => path.endsWith('/logout'))).toHaveLength(
      mode === 'restored' ? 0 : 1,
    );
    expect(closed).toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it.each([
    'fresh',
    'migrated',
    'restored',
  ])('does not persist a failed %s setup except caller-owned bearer rotations', async (mode) => {
    const wallet = deriveBeaconDepositWalletAddress(
      address,
      environment.walletDerivation,
    );
    const initial = walletPair(wallet, 0, 20);
    const rotated = walletPair(wallet, 1);
    const paths: string[] = [];
    const changed = vi.fn();
    const closed = vi.spyOn(AuthSession.prototype, 'close');
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      paths.push(path);
      if (path.endsWith('/challenge'))
        return Response.json({
          challengeId: '00000000-0000-4000-8000-000000000001',
          typedData,
          expiresAt: new Date(Date.now() + 90_000).toISOString(),
        });
      if (path.endsWith('/refresh')) return Response.json(rotated);
      if (path.endsWith('/deployed'))
        return Response.json(
          { code: 'wallet_setup_failed', message: 'Wallet setup failed' },
          { status: 401 },
        );
      if (path.endsWith('/logout')) {
        expect(request.headers.get('authorization')).toBe(
          `Bearer ${rotated.accessToken}`,
        );
        return Response.json({ code: 'logout_failed' }, { status: 503 });
      }
      return Response.json(initial);
    });
    await expect(
      createSecureClient({
        environment,
        fetch,
        signer: signer(),
        wallet,
        ...(mode === 'migrated'
          ? { credentials: l2Credentials }
          : mode === 'restored'
            ? { credentials: saved(initial) }
            : {}),
        onCredentialsChanged: changed,
      }),
    ).rejects.toMatchObject({ status: 401, code: 'wallet_setup_failed' });
    expect(paths.filter((path) => path.endsWith('/logout'))).toHaveLength(
      mode === 'restored' ? 0 : 1,
    );
    expect(closed).toHaveBeenCalled();
    if (mode === 'restored')
      expect(changed).toHaveBeenCalledExactlyOnceWith(saved(rotated));
    else expect(changed).not.toHaveBeenCalled();
  });

  it.each([
    'fresh',
    'migrated',
  ])('defers %s rotation persistence until setup succeeds then resumes normal notifications', async (mode) => {
    const wallet = deriveBeaconDepositWalletAddress(
      address,
      environment.walletDerivation,
    );
    const initial = walletPair(wallet, 0, 20);
    const rotated = walletPair(wallet, 1);
    const later = walletPair(wallet, 2);
    const following = walletPair(wallet, 3);
    const deploymentStarted = Promise.withResolvers<void>();
    const deployment = Promise.withResolvers<Response>();
    const changed = vi.fn(() => {
      if (mode === 'fresh') throw new Error('persistence failed synchronously');
      return Promise.reject(new Error('persistence failed asynchronously'));
    });
    let refreshes = 0;
    let deploymentAttempts = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (path.endsWith('/challenge'))
        return Response.json({
          challengeId: '00000000-0000-4000-8000-000000000001',
          typedData,
          expiresAt: new Date(Date.now() + 90_000).toISOString(),
        });
      if (path.endsWith('/refresh'))
        return Response.json(
          ++refreshes === 1 ? rotated : refreshes === 2 ? later : following,
        );
      if (path.endsWith('/deployed')) {
        if (++deploymentAttempts === 1)
          return Response.json(
            { code: 'expired_access_token', message: 'Access expired' },
            { status: 401 },
          );
        deploymentStarted.resolve();
        return deployment.promise;
      }
      return Response.json(initial);
    });
    const pending = createSecureClient({
      environment,
      fetch,
      signer: signer(),
      wallet,
      ...(mode === 'migrated' ? { credentials: l2Credentials } : {}),
      onCredentialsChanged: changed,
    });
    await deploymentStarted.promise;
    const callsBeforeSetup = changed.mock.calls.length;
    deployment.resolve(Response.json({ deployed: true }));
    const client = await pending;
    try {
      expect(callsBeforeSetup).toBe(0);
      expect(changed).toHaveBeenCalledExactlyOnceWith(saved(later));
      await client.session.refresh();
      expect(changed).toHaveBeenLastCalledWith(saved(following));
      expect(changed).toHaveBeenCalledTimes(2);
    } finally {
      client.closeAuthenticationSession();
      await client.closeSubscriptions();
    }
  });

  it.each([
    'submit',
    'wait',
  ])('revokes the migrated session after an actual deployment %s failure', async (stage) => {
    const wallet = deriveBeaconDepositWalletAddress(
      address,
      environment.walletDerivation,
    );
    const paths: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      paths.push(path);
      if (path.endsWith('/deployed')) return Response.json({ deployed: false });
      if (path === '/v1/wallets/transactions')
        return stage === 'submit'
          ? Response.json(
              { code: 'deployment_rejected', message: 'Deployment rejected' },
              { status: 401 },
            )
          : Response.json({
              state: 'STATE_NEW',
              transactionID: 'failed-setup',
              transactionHash: null,
            });
      if (path.endsWith('/transactions/failed-setup'))
        return Response.json(
          { code: 'deployment_rejected', message: 'Deployment rejected' },
          { status: 401 },
        );
      if (path.endsWith('/logout')) return new Response(null, { status: 204 });
      return Response.json(walletPair(wallet, 0));
    });
    await expect(
      createSecureClient({
        environment,
        fetch,
        signer: signer(),
        wallet,
        credentials: l2Credentials,
        apiKey: {
          isBuilderKey: false,
          supportGasless: true,
          authorize: async () => ({}),
        },
      }),
    ).rejects.toMatchObject({ status: 401, code: 'deployment_rejected' });
    expect(paths).toContain('/v1/wallets/transactions');
    if (stage === 'wait')
      expect(paths).toContain('/v1/wallets/transactions/failed-setup');
    expect(paths.filter((path) => path.endsWith('/logout'))).toHaveLength(1);
  });

  it.each([
    'migrated',
    'restored',
  ])('keeps the original %s failure when local subscription cleanup rejects', async (mode) => {
    vi.spyOn(
      BaseSecureClient.prototype,
      'closeSubscriptions',
    ).mockRejectedValue(new Error('cleanup failed'));
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith('/refresh'))
        return Response.json(
          { code: 'refresh_rejected', message: 'Refresh rejected' },
          { status: 401 },
        );
      if (request.url.endsWith('/logout'))
        return new Response(null, { status: 204 });
      return Response.json(tokens(0, 20));
    });
    await expect(
      createSecureClient({
        environment,
        fetch,
        signer: signer(),
        wallet: address,
        credentials: mode === 'migrated' ? l2Credentials : saved(tokens()),
      }),
    ).rejects.toMatchObject({ status: 401, code: 'refresh_rejected' });
  });

  it.each([
    'fresh',
    'migrated',
  ])('does not revoke or notify when %s authentication is rejected', async (mode) => {
    const paths: string[] = [];
    const changed = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const path = new URL(new Request(input, init).url).pathname;
      paths.push(path);
      if (path.endsWith('/challenge'))
        return Response.json({
          challengeId: '00000000-0000-4000-8000-000000000001',
          typedData,
          expiresAt: new Date(Date.now() + 90_000).toISOString(),
        });
      return Response.json({ code: 'auth_rejected' }, { status: 401 });
    });
    await expect(
      createSecureClient({
        environment,
        fetch,
        signer: signer(),
        wallet: address,
        ...(mode === 'migrated' ? { credentials: l2Credentials } : {}),
        onCredentialsChanged: changed,
      }),
    ).rejects.toMatchObject({ status: 401, code: 'auth_rejected' });
    expect(paths.some((path) => path.endsWith('/logout'))).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });
});

function walletPair(wallet: string, sequence: number, seconds = 900) {
  const pair = tokens(sequence, seconds);
  const claims = JSON.parse(atob(pair.accessToken.split('.')[1] ?? ''));
  claims.wallet = wallet;
  claims.signature_type = 3;
  pair.accessToken = `test.${btoa(JSON.stringify(claims))}.test`;
  return pair;
}

it('observes failed local cleanup immediately while remote logout is pending', async () => {
  const logoutStarted = Promise.withResolvers<void>();
  const logout = Promise.withResolvers<Response>();
  const client = await createSecureClient({
    environment,
    signer: signer(),
    wallet: address,
    credentials: l2Credentials,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.url.endsWith('/logout')) {
        logoutStarted.resolve();
        return logout.promise;
      }
      return Response.json(tokens());
    },
  });
  vi.spyOn(client, 'closeSubscriptions').mockRejectedValue(
    new Error('local close failed'),
  );
  const unhandled: unknown[] = [];
  function observeUnhandled(reason: unknown) {
    unhandled.push(reason);
  }
  process.on('unhandledRejection', observeUnhandled);
  const ending = client.endAuthentication();
  try {
    await logoutStarted.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(unhandled).toEqual([]);
  } finally {
    logout.resolve(new Response(null, { status: 204 }));
    await ending;
    process.off('unhandledRejection', observeUnhandled);
  }
});

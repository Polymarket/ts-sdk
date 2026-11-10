// biome-ignore-all lint/style/noRestrictedImports: msw's Node test server lives at this entrypoint.

import { RelayerTransactionType } from '@polymarket/bindings/relayer';
import {
  buildHmacSignature,
  createPublicClient,
  createSecureClient,
  remoteBuilderSigning,
  remotePlatformApiKey,
  SigningError,
  UserInputError,
} from '@polymarket/client';
import {
  deployDepositWallet,
  fetchExecuteParams,
} from '@polymarket/client/actions';
import {
  createPlatformChallenge,
  type PlatformChallengeRequest,
  platformApiKey,
} from '@polymarket/client/node';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, type MockInstance, vi } from 'vitest';
import { describe, expect, it } from './fixtures';

const signerUrl = 'http://localhost:4010/api/builder/sign';
const challengeUrl = 'http://localhost:4010/api/auth/challenge';

const server = setupServer();

describe('authorization', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  describe('remoteBuilderSigning', () => {
    it('authorizes live builder-authenticated requests with remotely signed headers', async ({
      builderCredentials,
      depositWalletAddress,
      environment,
    }) => {
      server.use(
        http.post(signerUrl, async ({ request }) => {
          expect(request.headers.get('content-type')).toBe('application/json');
          expect(request.headers.get('x-remote-auth')).toBe('test-auth');

          const payload = (await request.json()) as {
            body?: string;
            method: 'DELETE' | 'GET' | 'POST';
            path: string;
          };

          expect(payload).toEqual({
            body: undefined,
            method: 'GET',
            path: '/v1/account/transactions/params',
          });

          const timestamp = Math.floor(Date.now() / 1000);

          return HttpResponse.json({
            POLY_BUILDER_API_KEY: builderCredentials.key,
            POLY_BUILDER_PASSPHRASE: builderCredentials.passphrase,
            POLY_BUILDER_SIGNATURE: await buildHmacSignature(
              builderCredentials.secret,
              timestamp,
              payload.method,
              payload.path,
              payload.body,
            ),
            POLY_BUILDER_TIMESTAMP: `${timestamp}`,
          });
        }),
      );
      const client = createPublicClient({
        apiKey: remoteBuilderSigning({
          headers: async () => ({
            'x-remote-auth': 'test-auth',
          }),
          url: signerUrl,
        }),
        environment,
      });

      await expect(
        fetchExecuteParams(client, {
          address: depositWalletAddress,
          type: RelayerTransactionType.SAFE,
        }),
      ).resolves.toBeDefined();
    });

    it('throws SigningError when the remote signer rejects the request', async () => {
      server.use(
        http.post(
          signerUrl,
          () => new HttpResponse('forbidden', { status: 403 }),
        ),
      );
      const authorization = remoteBuilderSigning({ url: signerUrl });

      await expect(
        authorization.authorize({ method: 'GET', path: '/builder/trades' }),
      ).rejects.toBeInstanceOf(SigningError);
    });

    it('throws SigningError when the remote signer returns an invalid payload', async () => {
      server.use(
        http.post(signerUrl, () =>
          HttpResponse.json({ POLY_BUILDER_API_KEY: 'builder-key' }),
        ),
      );
      const authorization = remoteBuilderSigning({ url: signerUrl });

      await expect(
        authorization.authorize({ method: 'GET', path: '/builder/trades' }),
      ).rejects.toBeInstanceOf(SigningError);
    });
  });

  describe('platformApiKey', () => {
    it('attributes login and account requests to the key and renews and logs out without it', async ({
      builderAuthentication,
      builderCredentials,
      depositWalletAddress,
      depositWalletSigner,
      environment,
      platformKey,
    }) => {
      const apiKey = platformApiKey(platformKey, {
        submissionApiKey: builderAuthentication,
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const loggedIn = await createSecureClient({
        apiKey,
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });
      // Restoring saved credentials renews them before the client returns.
      const restored = await createSecureClient({
        apiKey,
        credentials: loggedIn.credentials,
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });

      try {
        await restored.listOpenOrders().firstPage();
        expect(clientIdOf(restored.credentials.accessToken)).toEqual(
          expect.any(String),
        );
      } finally {
        await Promise.allSettled([
          restored.endAuthentication(),
          loggedIn.endAuthentication(),
        ]);
      }

      const requests = sentRequests(fetchSpy);
      for (const path of ['/v1/auth/challenge', '/v1/auth/login']) {
        expect(headerValues(requests, path, 'x-api-key')).toEqual([
          platformKey,
        ]);
      }
      for (const path of ['/v1/auth/refresh', '/v1/auth/logout']) {
        expect(headerValues(requests, path, 'x-api-key')).not.toHaveLength(0);
        expect(
          headerValues(requests, path, 'x-api-key').every(
            (value) => value === null,
          ),
        ).toBe(true);
      }
      // Builder signing still rides along on the attributed account read.
      const [orders] = requests.filter((request) =>
        request.url.pathname.endsWith('/v1/me/orders'),
      );
      expect(orders?.headers.get('x-api-key')).toBe(platformKey);
      expect(orders?.headers.get('authorization')).toMatch(/^Bearer /);
      expect(orders?.headers.get('poly_builder_api_key')).toBe(
        builderCredentials.key,
      );
    });

    it('rejects gasless actions without a submission key before any request', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
      platformKey,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: platformApiKey(platformKey),
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });

      try {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        await expect(deployDepositWallet(secureClient)).rejects.toThrow(
          UserInputError,
        );
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        vi.restoreAllMocks();
        await secureClient.endAuthentication();
      }
    });

    it('signs in through a backend challenge proxy and logs in directly', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
      platformKey,
    }) => {
      const backend = createPublicClient({
        apiKey: platformApiKey(platformKey),
        environment,
      });
      const proxied: PlatformChallengeRequest[] = [];
      server.use(
        http.post(challengeUrl, async ({ request }) => {
          expect(request.headers.get('x-app-auth')).toBe('test-session');
          expect(request.headers.has('x-api-key')).toBe(false);
          const body = (await request.json()) as PlatformChallengeRequest;
          proxied.push(body);

          return HttpResponse.json(
            await createPlatformChallenge(backend, body),
          );
        }),
      );
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const secureClient = await createSecureClient({
        apiKey: remotePlatformApiKey({
          headers: { 'x-app-auth': 'test-session' },
          url: challengeUrl,
        }),
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });

      try {
        await secureClient.listOpenOrders().firstPage();
        expect(clientIdOf(secureClient.credentials.accessToken)).toEqual(
          expect.any(String),
        );
      } finally {
        await secureClient.endAuthentication();
      }

      expect(proxied).toHaveLength(1);
      expect(Object.keys(proxied[0] ?? {}).sort()).toEqual([
        'signer',
        'wallet',
      ]);
      const requests = sentRequests(fetchSpy);
      // Only the backend holds the key; the browser logs in without it.
      expect(headerValues(requests, '/v1/auth/challenge', 'x-api-key')).toEqual(
        [platformKey],
      );
      expect(headerValues(requests, '/v1/auth/login', 'x-api-key')).toEqual([
        null,
      ]);
    });
  });
});

type SentRequest = { headers: Headers; url: URL };

function sentRequests(spy: MockInstance<typeof fetch>): SentRequest[] {
  return spy.mock.calls.map(([input, init]) =>
    input instanceof Request
      ? { headers: input.headers, url: new URL(input.url) }
      : { headers: new Headers(init?.headers), url: new URL(String(input)) },
  );
}

function headerValues(
  requests: SentRequest[],
  path: string,
  header: string,
): (string | null)[] {
  return requests
    .filter((request) => request.url.pathname.endsWith(path))
    .map((request) => request.headers.get(header));
}

function clientIdOf(accessToken: string): unknown {
  const [, payload = ''] = accessToken.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString()).client_id;
}

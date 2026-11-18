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
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { describe, expect, it } from './fixtures';
import {
  clientIdOf,
  headerValues,
  obtainL2Credentials,
  sentRequests,
  walletClaim,
} from './session';

const signerUrl = 'http://localhost:4010/api/builder/sign';
const challengeUrl = 'http://localhost:4010/api/auth/challenge';
// Optional: when set, attributed sessions must carry exactly this application ID.
const expectedApplicationId =
  process.env.POLYMARKET_PLATFORM_APPLICATION_ID?.trim() || undefined;

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

    it('attributes sessions to the application and keeps the application ID across restore, renewal and upgrade', async ({
      environment,
      platformKey,
      publicClient,
      randomEoaSigner,
    }) => {
      const signerAddress = await randomEoaSigner.getAddress();
      const apiKey = platformApiKey(platformKey);
      const backend = createPublicClient({ apiKey, environment });
      const attributed = await backend.login({ signer: randomEoaSigner });
      const unattributed = await publicClient.login({
        signer: randomEoaSigner,
        nonce: 1,
      });
      const applicationId = clientIdOf(attributed.accessToken);

      expect(applicationId).toEqual(expect.any(String));
      if (expectedApplicationId !== undefined)
        expect(applicationId).toBe(expectedApplicationId);
      expect(clientIdOf(unattributed.accessToken)).not.toEqual(applicationId);

      const restored = await createSecureClient({
        apiKey,
        credentials: attributed,
        environment,
        signer: randomEoaSigner,
        walletSetup: false,
      });
      let client = restored;

      try {
        expect(clientIdOf(restored.credentials.accessToken)).toBe(
          applicationId,
        );
        const renewed = await restored.refreshCredentials();
        expect(clientIdOf(renewed.accessToken)).toBe(applicationId);

        client = await restored.upgradeCredentials({ wallet: signerAddress });
        expect(walletClaim(client.credentials.accessToken)).toBe(
          signerAddress.toLowerCase(),
        );
        expect(clientIdOf(client.credentials.accessToken)).toBe(applicationId);
      } finally {
        await Promise.allSettled([
          client.endAuthentication(),
          createSecureClient({
            credentials: unattributed,
            environment,
            signer: randomEoaSigner,
            walletSetup: false,
          }).then((secureClient) => secureClient.endAuthentication()),
        ]);
      }
    });

    it('attributes account reads to the key and authorizes relayer reads with a relayer key', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
      platformKey,
      relayerAuthentication,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: platformApiKey(platformKey, {
          submissionApiKey: relayerAuthentication,
        }),
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      try {
        await secureClient.listOpenOrders().firstPage();
        // Reading execution parameters is relayer-authorized and has no side effect.
        await fetchExecuteParams(secureClient, {
          address: depositWalletAddress,
          type: RelayerTransactionType.WALLET,
        });
      } finally {
        vi.restoreAllMocks();
        await secureClient.endAuthentication();
      }

      const requests = sentRequests(fetchSpy);
      const [orders] = requests.filter((request) =>
        request.url.pathname.endsWith('/v1/me/orders'),
      );
      expect(orders?.headers.get('x-api-key')).toBe(platformKey);
      expect(orders?.headers.get('authorization')).toMatch(/^Bearer /);
      const [executeParams] = requests.filter((request) =>
        request.url.pathname.endsWith('/execute-params'),
      );
      expect(executeParams?.headers.get('relayer_api_key')).toBe(
        process.env.POLYMARKET_RELAYER_API_KEY,
      );
      expect(executeParams?.headers.get('relayer_api_key_address')).toBe(
        process.env.POLYMARKET_RELAYER_API_KEY_ADDRESS,
      );
    });

    it('restores a signer-only session without wallet setup, then binds the deployed Deposit Wallet under the key', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
      platformKey,
    }) => {
      const apiKey = platformApiKey(platformKey);
      const backend = createPublicClient({ apiKey, environment });
      const credentials = await backend.login({ signer: depositWalletSigner });
      const signTypedData = vi.spyOn(depositWalletSigner, 'signTypedData');
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const onboardingClient = await createSecureClient({
        apiKey,
        credentials,
        environment,
        signer: depositWalletSigner,
        walletSetup: false,
      });
      let client = onboardingClient;

      try {
        const applicationId = clientIdOf(
          onboardingClient.credentials.accessToken,
        );
        expect(applicationId).toEqual(expect.any(String));
        expect(
          walletClaim(onboardingClient.credentials.accessToken),
        ).toBeUndefined();

        client = await onboardingClient.upgradeCredentials({
          wallet: depositWalletAddress,
        });

        expect(walletClaim(client.credentials.accessToken)).toBe(
          depositWalletAddress.toLowerCase(),
        );
        expect(clientIdOf(client.credentials.accessToken)).toBe(applicationId);
        await client.listOpenOrders().firstPage();
        expect(signTypedData).not.toHaveBeenCalled();
      } finally {
        vi.restoreAllMocks();
        await client.endAuthentication();
      }

      expect(
        headerValues(sentRequests(fetchSpy), '/v1/auth/upgrade', 'x-api-key'),
      ).toEqual([platformKey]);
    });

    it('signs in through a backend challenge proxy without wallet setup, then binds the deployed Deposit Wallet directly', async ({
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
          const body = (await request.json()) as PlatformChallengeRequest;
          proxied.push(body);

          return HttpResponse.json(
            await createPlatformChallenge(backend, body),
          );
        }),
      );
      const apiKey = remotePlatformApiKey({ url: challengeUrl });
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const credentials = await createPublicClient({
        apiKey,
        environment,
      }).login({ signer: depositWalletSigner });
      const onboardingClient = await createSecureClient({
        apiKey,
        credentials,
        environment,
        signer: depositWalletSigner,
        walletSetup: false,
      });
      let client = onboardingClient;

      try {
        const applicationId = clientIdOf(
          onboardingClient.credentials.accessToken,
        );
        expect(applicationId).toEqual(expect.any(String));
        expect(
          walletClaim(onboardingClient.credentials.accessToken),
        ).toBeUndefined();

        client = await onboardingClient.upgradeCredentials({
          wallet: depositWalletAddress,
        });

        expect(walletClaim(client.credentials.accessToken)).toBe(
          depositWalletAddress.toLowerCase(),
        );
        expect(clientIdOf(client.credentials.accessToken)).toBe(applicationId);
        await client.listOpenOrders().firstPage();
      } finally {
        vi.restoreAllMocks();
        await client.endAuthentication();
      }

      expect(proxied).toHaveLength(1);
      expect(Object.keys(proxied[0] ?? {})).toEqual(['signer']);
      const requests = sentRequests(fetchSpy);
      // Only the backend's challenge carries the key. The browser sends
      // everything else directly to the API without it.
      expect(headerValues(requests, '/v1/auth/challenge', 'x-api-key')).toEqual(
        [platformKey],
      );
      const direct = requests.filter((request) =>
        ['/v1/auth/login', '/v1/auth/upgrade', '/v1/me/orders'].some((path) =>
          request.url.pathname.endsWith(path),
        ),
      );
      expect(direct).toHaveLength(3);
      for (const request of direct) {
        expect(request.url.origin).toBe(
          new URL(environment.predictions.rest).origin,
        );
        expect(request.headers.get('x-api-key')).toBeNull();
      }
    });

    it('migrates L2 credentials without a wallet under the key, then binds the deployed Deposit Wallet without signing', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
      platformKey,
    }) => {
      const saved = await obtainL2Credentials(
        environment,
        depositWalletSigner,
        3,
      );
      const signTypedData = vi.spyOn(depositWalletSigner, 'signTypedData');
      const backend = createPublicClient({
        apiKey: platformApiKey(platformKey),
        environment,
      });
      const migrated = await backend.migrateCredentials({
        credentials: saved,
        signerAddress: await depositWalletSigner.getAddress(),
      });
      const applicationId = clientIdOf(migrated.accessToken);
      const onboardingClient = await createSecureClient({
        credentials: migrated,
        environment,
        signer: depositWalletSigner,
        walletSetup: false,
      });
      let client = onboardingClient;

      try {
        expect(applicationId).toEqual(expect.any(String));
        expect(
          walletClaim(onboardingClient.credentials.accessToken),
        ).toBeUndefined();
        expect(clientIdOf(onboardingClient.credentials.accessToken)).toBe(
          applicationId,
        );

        client = await onboardingClient.upgradeCredentials({
          wallet: depositWalletAddress,
        });

        expect(walletClaim(client.credentials.accessToken)).toBe(
          depositWalletAddress.toLowerCase(),
        );
        expect(clientIdOf(client.credentials.accessToken)).toBe(applicationId);
        await client.listOpenOrders().firstPage();
        expect(signTypedData).not.toHaveBeenCalled();
      } finally {
        vi.restoreAllMocks();
        await client.endAuthentication();
      }
    });
  });
});

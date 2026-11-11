import {
  createSecureClient,
  type EnvironmentConfig,
  remotePlatformApiKey,
  type Signer,
  UserInputError,
  WalletType,
} from '@polymarket/client';
import { isWalletDeployed } from '@polymarket/client/actions';
import { platformApiKey } from '@polymarket/client/node';
import { InvariantError, ZERO_ADDRESS } from '@polymarket/types';
import { afterEach, vi } from 'vitest';
import { describe, expect, it, runMeteredTests } from './fixtures';

describe('clients', () => {
  describe('createSecureClient', () => {
    it('authenticates a secure client from an authentication workflow', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
    }) => {
      const secureClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });

      await secureClient.listOpenOrders().firstPage();
    });

    it('authenticates with a non-zero nonce', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
    }) => {
      const secureClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        nonce: 1,
      });

      await secureClient.listOpenOrders().firstPage();
    });

    it('authenticates twice with the same nonce', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
    }) => {
      const firstClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        nonce: 2,
      });

      await firstClient.listOpenOrders().firstPage();

      const secondClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        nonce: 2,
      });

      await secondClient.listOpenOrders().firstPage();
    });

    it('classifies a deterministic proxy wallet as POLY_PROXY', async ({
      proxyWalletAddress,
      proxyWalletSigner,
      environment,
    }) => {
      const signerAddress = await proxyWalletSigner.getAddress();
      const secureClient = await createSecureClient({
        environment,
        signer: proxyWalletSigner,
        wallet: proxyWalletAddress,
      });

      expect(secureClient.account.walletType).toBe(WalletType.POLY_PROXY);
      expect(secureClient.account.wallet).toBe(proxyWalletAddress);
      expect(secureClient.account.signer).toBe(signerAddress);

      await secureClient.listOpenOrders().firstPage();
    });

    it('defaults omitted wallet to the current Deposit Wallet', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
    }) => {
      const signerAddress = await depositWalletSigner.getAddress();
      const secureClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
      });

      expect(secureClient.account.signer).toBe(signerAddress);
      expect(secureClient.account.wallet).toBe(depositWalletAddress);
      expect(secureClient.account.walletType).toBe(WalletType.DEPOSIT_WALLET);
      await secureClient.listOpenOrders().firstPage();
    });

    it.runIf(runMeteredTests)(
      'deploys the default Deposit Wallet when omitted wallet is not deployed',
      async ({ builderAuthentication, environment, randomEoaSigner }) => {
        const signerAddress = await randomEoaSigner.getAddress();
        const secureClient = await createSecureClient({
          apiKey: builderAuthentication,
          environment,
          signer: randomEoaSigner,
        });

        expect(secureClient.account.signer).toBe(signerAddress);
        expect(secureClient.account.wallet).not.toBe(signerAddress);
        expect(secureClient.account.walletType).toBe(WalletType.DEPOSIT_WALLET);
        await expect(isWalletDeployed(secureClient)).resolves.toBe(true);
      },
      20_000,
    );

    it('rejects an undeployed non-default wallet with UserInputError', async ({
      depositWalletSigner,
      environment,
    }) => {
      await expect(
        createSecureClient({
          environment,
          wallet: ZERO_ADDRESS,
          signer: depositWalletSigner,
        }),
      ).rejects.toThrow(UserInputError);
    });

    it('restores saved credentials and reports the renewed pair', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
    }) => {
      const initialClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });
      const saved = initialClient.credentials;
      const changed = vi.fn();

      const secureClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        credentials: saved,
        onCredentialsChanged: changed,
      });

      try {
        expect(changed).toHaveBeenCalledExactlyOnceWith(
          secureClient.credentials,
        );
        // Renewal keeps the refresh token, so logout never has a rotated token to recover.
        expect(secureClient.credentials.refreshToken).toBe(saved.refreshToken);

        // Concurrent explicit renewals share one renewal and one notification.
        const [first, second] = await Promise.all([
          secureClient.refreshCredentials(),
          secureClient.refreshCredentials(),
        ]);
        expect(second).toEqual(first);
        expect(first).toEqual(secureClient.credentials);
        expect(changed).toHaveBeenCalledTimes(2);
        expect(changed).toHaveBeenLastCalledWith(first);
        await secureClient.listOpenOrders().firstPage();

        // Logging out the original client revokes the shared refresh session.
        // Renewal then ends this session, and a later call still rejects.
        await initialClient.endAuthentication();
        await expect(secureClient.refreshCredentials()).rejects.toThrow();
        const ended = secureClient.refreshCredentials();
        await expect(ended).rejects.toThrow();
      } finally {
        await Promise.allSettled([
          secureClient.endAuthentication(),
          initialClient.endAuthentication(),
        ]);
      }
    });

    it('migrates saved L2 credentials without a new wallet signature', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
    }) => {
      const saved = await obtainL2Credentials(
        environment,
        depositWalletSigner,
        3,
      );
      const signTypedData = vi.spyOn(depositWalletSigner, 'signTypedData');

      const secureClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        credentials: saved,
      });

      try {
        expect(signTypedData).not.toHaveBeenCalled();
        expect(Object.keys(secureClient.credentials).sort()).toEqual([
          'accessToken',
          'refreshToken',
        ]);
        await secureClient.listOpenOrders().firstPage();
      } finally {
        vi.restoreAllMocks();
        await secureClient.endAuthentication();
      }
    });

    it('migrates saved L2 credentials under a platform key, attributed only by the server key', async ({
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
      const challengeUrl = 'http://localhost:4010/api/auth/challenge';
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      let calls: Parameters<typeof fetch>[] = [];

      try {
        for (const apiKey of [
          platformApiKey(platformKey),
          remotePlatformApiKey({ url: challengeUrl }),
        ]) {
          const secureClient = await createSecureClient({
            apiKey,
            credentials: saved,
            environment,
            signer: depositWalletSigner,
            wallet: depositWalletAddress,
          });
          await secureClient.endAuthentication();
        }
      } finally {
        calls = [...fetchSpy.mock.calls];
        vi.restoreAllMocks();
      }

      const requests = calls.map(([input, init]) =>
        input instanceof Request
          ? { headers: input.headers, url: input.url }
          : { headers: new Headers(init?.headers), url: String(input) },
      );
      // Migration needs no challenge, so the proxy is never called.
      expect(requests.some((request) => request.url === challengeUrl)).toBe(
        false,
      );
      expect(
        requests
          .filter((request) => request.url.endsWith('/v1/auth/migrate'))
          .map((request) => request.headers.get('x-api-key')),
      ).toEqual([platformKey, null]);
    });

    // Invalid/expired restoration is covered deterministically in gateway-auth.test.ts.
  });

  describe('SecureClient.endAuthentication', () => {
    it('returns a public client and invalidates the secure client', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
    }) => {
      const controlClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        nonce: 997,
      });
      const secureClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        nonce: 998,
      });
      const signer = secureClient.account.signer;
      const saved = secureClient.credentials;
      await controlClient.listOpenOrders().firstPage();
      const publicOnlyClient = await secureClient.endAuthentication();
      await controlClient.listOpenOrders().firstPage();
      expect(() => secureClient.credentials).toThrow(InvariantError);
      // The server ended the session, so its refresh token no longer restores a client.
      await expect(
        createSecureClient({
          environment,
          signer: depositWalletSigner,
          wallet: depositWalletAddress,
          credentials: saved,
        }),
      ).rejects.toMatchObject({ name: 'RequestRejectedError', status: 401 });
      await expect(
        publicOnlyClient.fetchPublicProfile({ address: signer }),
      ).resolves.toBeDefined();
    });

    it('closes active subscription iterators before ending authentication', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
    }) => {
      const secureClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        nonce: 999,
      });
      const handle = await secureClient.subscribe([{ topic: 'user' }]);

      await secureClient.endAuthentication();

      await expect(
        handle[Symbol.asyncIterator]().next(),
      ).resolves.toMatchObject({ done: true });
    });
  });

  describe('Predictions routing', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('serves discovery, portfolio and combo reads from the Predictions endpoint', async ({
      publicClient,
      environment,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await publicClient.listSports();
      await publicClient.listEvents({ pageSize: 1 }).firstPage();
      await publicClient
        .listPositions({ user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b' })
        .firstPage();
      await publicClient.listComboMarkets({ pageSize: 1 }).firstPage();

      const urls = fetchSpy.mock.calls.map(
        ([input]) =>
          new URL(input instanceof Request ? input.url : String(input)),
      );
      expect(urls.map((url) => url.origin + url.pathname)).toEqual([
        `${environment.predictions.rest}/v1/sports`,
        `${environment.predictions.rest}/v1/events`,
        `${environment.predictions.rest}/v1/positions`,
        `${environment.predictions.rest}/v1/combos/markets`,
      ]);
    });
  });
});

/**
 * Obtains L2 credentials for the signer directly from the trading service.
 * The SDK no longer manages these credentials, so the migration test sets them up itself.
 */
async function obtainL2Credentials(
  environment: EnvironmentConfig,
  signer: Signer,
  nonce: number,
): Promise<{ key: string; secret: string; passphrase: string }> {
  const address = await signer.getAddress();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await signer.signTypedData({
    domain: {
      name: 'ClobAuthDomain',
      version: '1',
      chainId: environment.chainId,
    },
    primaryType: 'ClobAuth',
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
      ],
      ClobAuth: [
        { name: 'address', type: 'address' },
        { name: 'timestamp', type: 'string' },
        { name: 'nonce', type: 'uint256' },
        { name: 'message', type: 'string' },
      ],
    },
    message: {
      address,
      timestamp,
      nonce,
      message: 'This message attests that I control the given wallet',
    },
  });
  const headers = {
    POLY_ADDRESS: address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_NONCE: String(nonce),
  };
  let response = await fetch(`${environment.clob.rest}/auth/api-key`, {
    method: 'POST',
    headers,
  });
  if (!response.ok)
    response = await fetch(`${environment.clob.rest}/auth/derive-api-key`, {
      headers,
    });
  expect(response.ok).toBe(true);
  const body = (await response.json()) as {
    apiKey: string;
    secret: string;
    passphrase: string;
  };
  return { key: body.apiKey, secret: body.secret, passphrase: body.passphrase };
}

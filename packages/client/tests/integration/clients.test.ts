import { setTimeout as delay } from 'node:timers/promises';
import {
  createPublicClient,
  createSecureClient,
  remotePlatformApiKey,
  UserInputError,
  WalletType,
} from '@polymarket/client';
import {
  createOwnershipChallenge,
  deployDepositWallet,
  isWalletDeployed,
} from '@polymarket/client/actions';
import { platformApiKey } from '@polymarket/client/node';
import { expectPresent, InvariantError, ZERO_ADDRESS } from '@polymarket/types';
import { afterEach, vi } from 'vitest';
import { describe, expect, it, runMeteredTests } from './fixtures';
import { findHighVolumeLowPriceMarket } from './markets';
import {
  clientIdOf,
  obtainL2Credentials,
  sentRequests,
  walletClaim,
} from './session';

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
      publicClient,
    }) => {
      const signTypedData = vi.spyOn(depositWalletSigner, 'signTypedData');

      try {
        for (const walletSetup of [true, false]) {
          await expect(
            createSecureClient({
              environment,
              wallet: ZERO_ADDRESS,
              signer: depositWalletSigner,
              walletSetup,
            }),
          ).rejects.toThrow(UserInputError);
        }
        // The API's rejection stays available as the cause.
        await expect(
          publicClient.login({
            signer: depositWalletSigner,
            wallet: ZERO_ADDRESS,
          }),
        ).rejects.toMatchObject({
          name: 'UserInputError',
          cause: { status: 401, code: 'wallet_not_authorized' },
        });
        // The wallet is rejected before anything is signed.
        expect(signTypedData).not.toHaveBeenCalled();
      } finally {
        vi.restoreAllMocks();
      }
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

    it('restores a saved signer-only session that another client already bound', async ({
      environment,
      publicClient,
      randomEoaSigner,
    }) => {
      const signerAddress = await randomEoaSigner.getAddress();
      // Two tabs hold the same saved signer-only session.
      const saved = await publicClient.login({ signer: randomEoaSigner });
      const firstTab = await createSecureClient({
        credentials: saved,
        environment,
        signer: randomEoaSigner,
        wallet: signerAddress,
      });

      try {
        // The first tab bound the wallet, so the second restores a bound session.
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const secondTab = await createSecureClient({
          credentials: saved,
          environment,
          signer: randomEoaSigner,
          wallet: signerAddress,
        });
        const upgrades = fetchSpy.mock.calls.filter(([input]) =>
          new URL(
            input instanceof Request ? input.url : String(input),
          ).pathname.endsWith('/v1/auth/upgrade'),
        );
        vi.restoreAllMocks();

        expect(upgrades).toHaveLength(0);
        expect(secondTab.account.wallet.toLowerCase()).toBe(
          signerAddress.toLowerCase(),
        );
        expect(secondTab.account.walletType).toBe(WalletType.EOA);
        await secondTab.listOpenOrders().firstPage();
      } finally {
        vi.restoreAllMocks();
        // Ending one tab revokes the shared refresh session for both.
        await firstTab.endAuthentication().catch(() => undefined);
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

    it('creates a client from a signer-only login without wallet setup, then binds the wallet later', async ({
      environment,
      publicClient,
      randomEoaSigner,
    }) => {
      const signerAddress = await randomEoaSigner.getAddress();
      const credentials = await publicClient.login({ signer: randomEoaSigner });
      const signTypedData = vi.spyOn(randomEoaSigner, 'signTypedData');
      const changed = vi.fn();

      const onboardingClient = await createSecureClient({
        environment,
        signer: randomEoaSigner,
        credentials,
        walletSetup: false,
        onCredentialsChanged: changed,
      });

      try {
        expect(signTypedData).not.toHaveBeenCalled();
        expect(onboardingClient.account.signer).toBe(signerAddress);
        expect(onboardingClient.account.walletType).toBe(
          WalletType.DEPOSIT_WALLET,
        );
        // The session stays signer-only and the default wallet is not deployed.
        expect(
          walletClaim(onboardingClient.credentials.accessToken),
        ).toBeUndefined();
        await expect(isWalletDeployed(onboardingClient)).resolves.toBe(false);
        expect(changed).toHaveBeenLastCalledWith(onboardingClient.credentials);

        // Once onboarding completes, wallet setup binds the saved session.
        const boundClient = await createSecureClient({
          environment,
          signer: randomEoaSigner,
          wallet: signerAddress,
          credentials: onboardingClient.credentials,
        });
        expect(signTypedData).not.toHaveBeenCalled();
        expect(walletClaim(boundClient.credentials.accessToken)).toBe(
          signerAddress.toLowerCase(),
        );
        await boundClient.listOpenOrders().firstPage();
      } finally {
        vi.restoreAllMocks();
        await onboardingClient.endAuthentication().catch(() => undefined);
      }
    });

    it('signs in without a wallet when wallet setup is disabled, then upgrades the same client', async ({
      environment,
      randomEoaSigner,
    }) => {
      const signerAddress = await randomEoaSigner.getAddress();
      const changed = vi.fn();
      const secureClient = await createSecureClient({
        environment,
        signer: randomEoaSigner,
        walletSetup: false,
        onCredentialsChanged: changed,
      });

      try {
        const signerOnly = secureClient.credentials;
        expect(walletClaim(signerOnly.accessToken)).toBeUndefined();
        expect(secureClient.account.walletType).toBe(WalletType.DEPOSIT_WALLET);
        await expect(isWalletDeployed(secureClient)).resolves.toBe(false);

        const signTypedData = vi.spyOn(randomEoaSigner, 'signTypedData');
        const credentials = await secureClient.upgradeCredentials({
          wallet: signerAddress,
        });

        // The same client now holds the bound session and acts for the wallet.
        expect(signTypedData).not.toHaveBeenCalled();
        expect(Object.keys(credentials).sort()).toEqual([
          'accessToken',
          'refreshToken',
        ]);
        expect(credentials).toEqual(secureClient.credentials);
        expect(credentials.refreshToken).toBe(signerOnly.refreshToken);
        expect(walletClaim(credentials.accessToken)).toBe(
          signerAddress.toLowerCase(),
        );
        expect(secureClient.account.wallet.toLowerCase()).toBe(
          signerAddress.toLowerCase(),
        );
        expect(secureClient.account.walletType).toBe(WalletType.EOA);
        expect(changed).toHaveBeenLastCalledWith(credentials);
        await secureClient.listOpenOrders().firstPage();
        // Renewal keeps the bound wallet.
        const renewed = await secureClient.refreshCredentials();
        expect(walletClaim(renewed.accessToken)).toBe(
          signerAddress.toLowerCase(),
        );
      } finally {
        vi.restoreAllMocks();
        await secureClient.endAuthentication();
      }
    });

    it('returns the current credentials without a request when the session is already bound to the wallet', async ({
      environment,
      randomEoaSigner,
    }) => {
      const signerAddress = await randomEoaSigner.getAddress();
      const secureClient = await createSecureClient({
        environment,
        signer: randomEoaSigner,
        wallet: signerAddress,
      });

      try {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const credentials = await secureClient.upgradeCredentials({
          wallet: signerAddress,
        });
        expect(fetchSpy).not.toHaveBeenCalled();
        vi.restoreAllMocks();

        expect(credentials).toEqual(secureClient.credentials);
        await secureClient.listOpenOrders().firstPage();
      } finally {
        vi.restoreAllMocks();
        await secureClient.endAuthentication();
      }
    });

    it('keeps subscriptions open while upgrading the credentials', async ({
      environment,
      publicClient,
      randomEoaSigner,
    }) => {
      const signerAddress = await randomEoaSigner.getAddress();
      const market = await findHighVolumeLowPriceMarket(publicClient);
      const secureClient = await createSecureClient({
        environment,
        signer: randomEoaSigner,
        walletSetup: false,
      });

      try {
        const handle = await secureClient.subscribe([
          {
            tokenIds: [expectPresent(market.outcomes.yes.tokenId)],
            topic: 'market',
          },
        ]);
        const consumed = (async () => {
          for await (const _event of handle) {
            // Market events keep arriving until the handle is closed.
          }
          return 'ended';
        })();

        await secureClient.upgradeCredentials({ wallet: signerAddress });

        // An upgrade that closed subscriptions would end the iterator here.
        await expect(
          Promise.race([consumed, delay(5_000).then(() => 'open')]),
        ).resolves.toBe('open');
        await handle.close();
        await expect(consumed).resolves.toBe('ended');
      } finally {
        await secureClient.endAuthentication();
      }
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

  describe('SecureClient.upgradeCredentials', () => {
    it('rejects a different wallet for a bound session without a request and keeps the client usable', async ({
      environment,
      randomEoaSigner,
    }) => {
      const signerAddress = await randomEoaSigner.getAddress();
      const secureClient = await createSecureClient({
        environment,
        signer: randomEoaSigner,
        walletSetup: false,
      });
      const depositWallet = secureClient.account.wallet;

      try {
        const bound = await secureClient.upgradeCredentials({
          wallet: signerAddress,
        });
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        await expect(
          secureClient.upgradeCredentials({ wallet: depositWallet }),
        ).rejects.toThrow(UserInputError);
        expect(fetchSpy).not.toHaveBeenCalled();
        vi.restoreAllMocks();

        expect(secureClient.credentials).toEqual(bound);
        expect(walletClaim(secureClient.credentials.accessToken)).toBe(
          signerAddress.toLowerCase(),
        );
        await secureClient.listOpenOrders().firstPage();
      } finally {
        vi.restoreAllMocks();
        await secureClient.endAuthentication();
      }
    });

    it('follows a wallet that another client bound to the shared session', async ({
      environment,
      publicClient,
      randomEoaSigner,
    }) => {
      const signerAddress = await randomEoaSigner.getAddress();
      // Two tabs restore the same signer-only session.
      const saved = await publicClient.login({ signer: randomEoaSigner });
      const firstTab = await createSecureClient({
        credentials: saved,
        environment,
        signer: randomEoaSigner,
        walletSetup: false,
      });
      const secondTab = await createSecureClient({
        credentials: saved,
        environment,
        signer: randomEoaSigner,
        walletSetup: false,
      });

      try {
        expect(secondTab.account.walletType).toBe(WalletType.DEPOSIT_WALLET);

        // The first tab finishes onboarding and binds the wallet.
        await firstTab.upgradeCredentials({ wallet: signerAddress });

        // The second tab renews later and adopts the wallet the server bound.
        const renewed = await secondTab.refreshCredentials();
        expect(walletClaim(renewed.accessToken)).toBe(
          signerAddress.toLowerCase(),
        );
        expect(secondTab.account.wallet.toLowerCase()).toBe(
          signerAddress.toLowerCase(),
        );
        expect(secondTab.account.walletType).toBe(WalletType.EOA);
        await secondTab.listOpenOrders().firstPage();

        // Restoring the saved signer-only pair with wallet setup does not bind again.
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const restoredTab = await createSecureClient({
          credentials: saved,
          environment,
          signer: randomEoaSigner,
        });
        vi.restoreAllMocks();
        expect(
          sentRequests(fetchSpy).filter((request) =>
            request.url.pathname.endsWith('/v1/auth/upgrade'),
          ),
        ).toHaveLength(0);
        expect(restoredTab.account.wallet.toLowerCase()).toBe(
          signerAddress.toLowerCase(),
        );
        await restoredTab.listOpenOrders().firstPage();
      } finally {
        vi.restoreAllMocks();
        // Ending one tab revokes the shared refresh session for all of them.
        await firstTab.endAuthentication().catch(() => undefined);
      }
    });

    it('keeps a user subscription open across an upgrade', async ({
      environment,
      randomEoaSigner,
    }) => {
      const signerAddress = await randomEoaSigner.getAddress();
      const secureClient = await createSecureClient({
        environment,
        signer: randomEoaSigner,
        walletSetup: false,
      });

      try {
        const handle = await secureClient.subscribe([{ topic: 'user' }]);
        const consumed = (async () => {
          for await (const _event of handle) {
            // No account activity is expected.
          }
          return 'ended';
        })();

        await secureClient.upgradeCredentials({ wallet: signerAddress });

        // The stream re-authenticates with the bound token and stays open.
        await expect(
          Promise.race([consumed, delay(5_000).then(() => 'open')]),
        ).resolves.toBe('open');
        await handle.close();
        await expect(consumed).resolves.toBe('ended');
      } finally {
        await secureClient.endAuthentication();
      }
    });

    it.runIf(runMeteredTests)(
      'onboards a new account under a platform key: signs in without a wallet, deploys the Deposit Wallet, then binds it',
      // Side effect: deploys a new Deposit Wallet on Polygon for a random signer
      // through the gasless relayer, metered against the builder API key.
      async ({
        builderAuthentication,
        environment,
        platformKey,
        randomEoaSigner,
      }) => {
        const apiKey = platformApiKey(platformKey, {
          submissionApiKey: builderAuthentication,
        });
        const credentials = await createPublicClient({
          apiKey,
          environment,
        }).login({ signer: randomEoaSigner });
        const applicationId = clientIdOf(credentials.accessToken);
        const secureClient = await createSecureClient({
          apiKey,
          credentials,
          environment,
          signer: randomEoaSigner,
          walletSetup: false,
        });
        const depositWallet = secureClient.account.wallet;

        try {
          expect(applicationId).toEqual(expect.any(String));
          await expect(isWalletDeployed(secureClient)).resolves.toBe(false);

          const deployment = await deployDepositWallet(secureClient);
          await deployment.wait();
          await expect(isWalletDeployed(secureClient)).resolves.toBe(true);

          const bound = await secureClient.upgradeCredentials({
            wallet: depositWallet,
          });

          expect(secureClient.account.walletType).toBe(
            WalletType.DEPOSIT_WALLET,
          );
          expect(walletClaim(bound.accessToken)).toBe(
            depositWallet.toLowerCase(),
          );
          expect(clientIdOf(bound.accessToken)).toBe(applicationId);
          await secureClient.listOpenOrders().firstPage();
        } finally {
          await secureClient.endAuthentication();
        }
      },
      120_000,
    );
  });

  describe('createOwnershipChallenge', () => {
    it('creates a challenge for the signer and network, and reports an unusable wallet by its code', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
      publicClient,
    }) => {
      const signer = await depositWalletSigner.getAddress();

      const challenge = await createOwnershipChallenge(publicClient, {
        signerAddress: signer,
        wallet: depositWalletAddress,
      });

      expect(challenge.typedData.domain.chainId).toBe(environment.chainId);
      expect(challenge.typedData.message.address.toLowerCase()).toBe(
        signer.toLowerCase(),
      );
      // Challenge proxies forward the code, and login maps it for the signer.
      await expect(
        createOwnershipChallenge(publicClient, {
          signerAddress: signer,
          wallet: ZERO_ADDRESS,
        }),
      ).rejects.toMatchObject({
        name: 'RequestRejectedError',
        code: 'wallet_not_authorized',
      });
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

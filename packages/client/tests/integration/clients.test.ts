import {
  createSecureClient,
  UserInputError,
  WalletType,
} from '@polymarket/client';
import { isWalletDeployed } from '@polymarket/client/actions';
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

    it('reuses stored credentials during authentication when they remain valid', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
    }) => {
      const initialClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });

      const secureClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        credentials: initialClient.credentials,
      });

      await secureClient.listOpenOrders().firstPage();
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
      await controlClient.listOpenOrders().firstPage();
      const publicOnlyClient = await secureClient.endAuthentication();
      await controlClient.listOpenOrders().firstPage();
      expect(() => secureClient.credentials).toThrow(InvariantError);
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

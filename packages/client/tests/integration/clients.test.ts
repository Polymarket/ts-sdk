import { createSecureClient, WalletType } from '@polymarket/client';
import { fetchApiKeys, isWalletDeployed } from '@polymarket/client/actions';
import { InvariantError, ZERO_ADDRESS } from '@polymarket/types';
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

      await expect(fetchApiKeys(secureClient)).resolves.toBeDefined();
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

      await expect(fetchApiKeys(secureClient)).resolves.toBeDefined();
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

      await expect(fetchApiKeys(firstClient)).resolves.toBeDefined();

      const secondClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        nonce: 2,
      });

      await expect(fetchApiKeys(secondClient)).resolves.toBeDefined();
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

      await expect(fetchApiKeys(secureClient)).resolves.toBeDefined();
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
      await expect(fetchApiKeys(secureClient)).resolves.toBeDefined();
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

    it('rejects with InvariantError when wallet does not match signer or any supported derived wallet', async ({
      depositWalletSigner,
      environment,
    }) => {
      await expect(
        createSecureClient({
          environment,
          wallet: ZERO_ADDRESS,
          signer: depositWalletSigner,
        }),
      ).rejects.toBeInstanceOf(InvariantError);
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

      await expect(fetchApiKeys(secureClient)).resolves.toBeDefined();
    });

    it('falls back to fresh authentication when stored credentials have been revoked', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
    }) => {
      const controlClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        nonce: 1997,
      });
      const secureClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        nonce: 1998,
      });
      const { credentials } = secureClient;
      const revokedKey = credentials.key;

      await expect(fetchApiKeys(controlClient)).resolves.toContain(revokedKey);

      await secureClient.endAuthentication();

      const resumedClient = await createSecureClient({
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
        credentials,
      });
      const remainingApiKeys = await fetchApiKeys(controlClient);

      expect(resumedClient.credentials.key).not.toBe(revokedKey);
      expect(remainingApiKeys).toContain(controlClient.credentials.key);
      expect(remainingApiKeys).toContain(resumedClient.credentials.key);
      expect(remainingApiKeys).not.toContain(revokedKey);
    });
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
      const revokedKey = secureClient.credentials.key;
      const signer = secureClient.account.signer;

      await expect(fetchApiKeys(controlClient)).resolves.toContain(revokedKey);

      const publicOnlyClient = await secureClient.endAuthentication();
      const remainingApiKeys = await fetchApiKeys(controlClient);

      expect(remainingApiKeys).toContain(controlClient.credentials.key);
      expect(remainingApiKeys).not.toContain(revokedKey);
      await expect(fetchApiKeys(secureClient)).rejects.toBeInstanceOf(
        InvariantError,
      );
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
});

import { WalletType } from '@polymarket/bindings/gamma';
import { createSecureClient } from '@polymarket/client';
import { describe, expect, it } from './fixtures';

describe('Transfers', () => {
  describe('SecureClient.transferErc20', () => {
    it('submits a self-transfer for the collateral token', async ({
      depositWalletAddress,
      depositWalletSigner,
      environment,
      relayerAuthentication,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: relayerAuthentication,
        environment,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });

      expect(secureClient.account.walletType).toBe(WalletType.DEPOSIT_WALLET);

      const handle = await secureClient.transferErc20({
        amount: 1n,
        recipientAddress: secureClient.account.signer,
        tokenAddress: secureClient.environment.contracts.collateralToken,
      });

      await expect(handle.wait()).resolves.toBeTruthy();
    });
  });
});

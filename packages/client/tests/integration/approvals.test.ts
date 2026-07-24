import {
  createSecureClient,
  SigningError,
  WalletType,
} from '@polymarket/client';
import { ZERO_ADDRESS } from '@polymarket/types';
import { describe, expect, it, runMeteredTests } from './fixtures';

describe('Approvals', () => {
  describe('SecureClient.approveErc20', () => {
    it('submits a collateral approval for the standard exchange', async ({
      depositWalletAddress,
      depositWalletSigner,
      relayerAuthentication,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: relayerAuthentication,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });

      expect(secureClient.account.walletType).toBe(WalletType.DEPOSIT_WALLET);

      const handle = await secureClient.approveErc20({
        spenderAddress: secureClient.environment.contracts.standardExchange,
        tokenAddress: secureClient.environment.contracts.collateralToken,
        amount: 'max',
      });

      await expect(handle.wait()).resolves.toBeTruthy();
    });

    it('supports EOA approvals as traditional transactions', async ({
      randomEoaSigner,
    }) => {
      const signerAddress = await randomEoaSigner.getAddress();
      const secureClient = await createSecureClient({
        signer: randomEoaSigner,
        wallet: signerAddress,
      });

      expect(secureClient.account.walletType).toBe(WalletType.EOA);

      // to avoid having to fund the wallet we stop the test by proving the
      // transaction request is correctly formed, without actually sending it
      await expect(
        secureClient.approveErc20({
          amount: 'max',
          spenderAddress: ZERO_ADDRESS,
          tokenAddress: secureClient.environment.contracts.collateralToken,
        }),
      ).rejects.toBeInstanceOf(SigningError);
    });
  });

  describe('SecureClient.approveErc1155ForAll', () => {
    it('submits a Conditional Tokens approval for the standard exchange', async ({
      depositWalletAddress,
      depositWalletSigner,
      relayerAuthentication,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: relayerAuthentication,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });

      expect(secureClient.account.walletType).toBe(WalletType.DEPOSIT_WALLET);

      const handle = await secureClient.approveErc1155ForAll({
        operatorAddress: secureClient.environment.contracts.standardExchange,
        tokenAddress: secureClient.environment.contracts.conditionalTokens,
      });

      await expect(handle.wait()).resolves.toBeTruthy();
    });
  });

  describe('SecureClient.setupTradingApprovals', () => {
    it('submits a combined trading-setup approval workflow', async ({
      depositWalletAddress,
      depositWalletSigner,
      relayerAuthentication,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: relayerAuthentication,
        signer: depositWalletSigner,
        wallet: depositWalletAddress,
      });

      expect(secureClient.account.walletType).toBe(WalletType.DEPOSIT_WALLET);

      await expect(
        secureClient.setupTradingApprovals(),
      ).resolves.toBeUndefined();
    });

    it.runIf(runMeteredTests)(
      'submits a combined trading-setup approval workflow for a new Deposit Wallet',
      async ({ builderAuthentication, randomEoaSigner }) => {
        const secureClient = await createSecureClient({
          apiKey: builderAuthentication,
          signer: randomEoaSigner,
        });

        expect(secureClient.account.walletType).toBe(WalletType.DEPOSIT_WALLET);

        await expect(
          secureClient.setupTradingApprovals(),
        ).resolves.toBeUndefined();
      },
    );
  });
});

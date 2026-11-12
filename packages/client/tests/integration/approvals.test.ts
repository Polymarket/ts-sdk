import {
  createSecureClient,
  SigningError,
  WalletType,
} from '@polymarket/client';
import { ZERO_ADDRESS } from '@polymarket/types';
import { vi } from 'vitest';
import { describe, expect, it, runMeteredTests } from './fixtures';

describe('Approvals', () => {
  describe('PublicClient.fetchTradingApprovalsState', () => {
    it('reads missing approvals without a signer or write operation', async ({
      publicClient,
    }) => {
      const originalFetch = globalThis.fetch;
      const requests: Request[] = [];
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, init) => {
          const request =
            input instanceof Request ? input.clone() : new Request(input, init);
          requests.push(request);

          return originalFetch(input, init);
        });

      try {
        const state = await publicClient.fetchTradingApprovalsState({
          user: '0x00000000000000000000000000000000000000aa',
        });
        const { contracts } = publicClient.environment;

        expect(state.isFullyApproved).toBe(false);
        // Check trading pairs without pinning the number of required approvals.
        expect(state.missing.erc20).toEqual(
          expect.arrayContaining([
            {
              amount: 2n ** 256n - 1n,
              spenderAddress: contracts.standardExchange,
              tokenAddress: contracts.collateralToken,
            },
            {
              amount: 2n ** 256n - 1n,
              spenderAddress: contracts.exchangeV3,
              tokenAddress: contracts.collateralToken,
            },
          ]),
        );
        expect(state.missing.erc1155).toEqual(
          expect.arrayContaining([
            {
              operatorAddress: contracts.standardExchange,
              tokenAddress: contracts.conditionalTokens,
            },
            {
              operatorAddress: contracts.exchangeV3,
              tokenAddress: contracts.positionManager,
            },
          ]),
        );
        expect(
          state.missing.erc20.every(({ amount }) => amount === 2n ** 256n - 1n),
        ).toBe(true);
        expect(requests).toHaveLength(1);
        const request = requests[0];
        expect(request?.method).toBe('GET');
        expect(new URL(request?.url ?? '').pathname).toBe('/v2/approvals');
        expect(new URL(request?.url ?? '').searchParams.get('user')).toBe(
          '0x00000000000000000000000000000000000000aa',
        );
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('SecureClient.fetchTradingApprovalsState', () => {
    it('reads the authenticated account wallet', async ({
      secureClientWithDepositWallet,
    }) => {
      const ethCallBatchSpy = vi.spyOn(
        secureClientWithDepositWallet.rpc,
        'ethCallBatch',
      );
      const originalFetch = globalThis.fetch;
      const urls: URL[] = [];
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation((input, init) => {
          const request =
            input instanceof Request ? input : new Request(input, init);
          urls.push(new URL(request.url));
          return originalFetch(input, init);
        });

      try {
        await secureClientWithDepositWallet.fetchTradingApprovalsState();

        expect(ethCallBatchSpy).not.toHaveBeenCalled();
        expect(urls).toHaveLength(1);
        expect(urls[0]?.pathname).toBe('/v2/approvals');
        expect(urls[0]?.searchParams.get('user')?.toLowerCase()).toBe(
          secureClientWithDepositWallet.account.wallet.toLowerCase(),
        );
      } finally {
        ethCallBatchSpy.mockRestore();
        fetchSpy.mockRestore();
      }
    });
  });

  describe('SecureClient.approveErc20', () => {
    it('submits a collateral approval for the standard exchange', async ({
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

      const handle = await secureClient.approveErc20({
        spenderAddress: secureClient.environment.contracts.standardExchange,
        tokenAddress: secureClient.environment.contracts.collateralToken,
        amount: 'max',
      });

      await expect(handle.wait()).resolves.toBeTruthy();
    });

    it('supports EOA approvals as traditional transactions', async ({
      environment,
      randomEoaSigner,
    }) => {
      const signerAddress = await randomEoaSigner.getAddress();
      const secureClient = await createSecureClient({
        environment,
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

      await expect(
        secureClient.setupTradingApprovals(),
      ).resolves.toBeUndefined();
    });

    it.runIf(runMeteredTests)(
      'submits a combined trading-setup approval workflow for a new Deposit Wallet',
      async ({ builderAuthentication, environment, randomEoaSigner }) => {
        const secureClient = await createSecureClient({
          apiKey: builderAuthentication,
          environment,
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

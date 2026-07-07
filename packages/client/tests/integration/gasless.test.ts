import {
  createSecureClient,
  type SecureClient,
  type TransactionOutcome,
  WalletType,
} from '@polymarket/client';
import { describe, expect, it } from './fixtures';

describe('Gasless', () => {
  describe('legacy wallet execution', () => {
    it('executes a gasless transaction for a Proxy wallet', async ({
      builderAuthentication,
      proxyWalletAddress,
      proxyWalletSigner,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: builderAuthentication,
        signer: proxyWalletSigner,
        wallet: proxyWalletAddress,
      });

      expect(secureClient.account.walletType).toBe(WalletType.POLY_PROXY);

      await expect(
        executeRepresentativeGaslessTransaction(
          secureClient,
          'Test legacy Proxy wallet gasless execution',
        ),
      ).resolves.toBeTruthy();
    });

    it('executes a gasless transaction for a Safe wallet', async ({
      builderAuthentication,
      safeWalletAddress,
      safeWalletSigner,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: builderAuthentication,
        signer: safeWalletSigner,
        wallet: safeWalletAddress,
      });

      expect(secureClient.account.walletType).toBe(WalletType.GNOSIS_SAFE);

      await expect(
        executeRepresentativeGaslessTransaction(
          secureClient,
          'Test legacy Safe wallet gasless execution',
        ),
      ).resolves.toBeTruthy();
    });
  });
});

async function executeRepresentativeGaslessTransaction(
  secureClient: SecureClient,
  metadata: string,
): Promise<TransactionOutcome> {
  const handle = await secureClient.approveErc20({
    amount: 'max',
    metadata,
    spenderAddress: secureClient.environment.contracts.standardExchange,
    tokenAddress: secureClient.environment.contracts.collateralToken,
  });

  return handle.wait();
}

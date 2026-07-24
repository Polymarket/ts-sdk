import { OrderSide } from '@polymarket/bindings';
import { AssetType } from '@polymarket/bindings/clob';
import {
  type ApiKeyAuthorization,
  createSecureClient,
  type EvmAddress,
  WalletType,
} from '@polymarket/client';
import {
  cancelOrder,
  fetchApiKeys,
  fetchBalanceAllowance,
} from '@polymarket/client/actions';
import { type PrivyWalletConfig, signerFrom } from '@polymarket/client/privy';
import { expectPresent } from '@polymarket/types';
import { PrivyClient } from '@privy-io/node';
import type { TestContext } from 'vitest';
import { describe, expect, it, runMeteredTests } from './fixtures';
import { expectAcceptedOrderResponse } from './helpers';

const TEST_MARKET_SLUG = 'eth-flipped-in-2026';

type Skip = TestContext['skip'];

type PrivyTestAccount = {
  hasCollateralBalance: boolean;
  wallet: PrivyWalletConfig;
  walletAddress: EvmAddress;
};

let privyTestAccountPromise: Promise<PrivyTestAccount> | undefined;

describe('privy', () => {
  it('authenticates a secure client', async ({
    builderAuthentication,
    skip,
  }) => {
    const account = await setupPrivyTestAccount({
      builderAuthentication,
      skip,
    });
    const secureClient = await createSecureClient({
      signer: signerFrom(account.wallet),
      wallet: account.walletAddress,
    });

    await expect(fetchApiKeys(secureClient)).resolves.toBeDefined();
  });

  it.runIf(runMeteredTests)(
    'places and cancels a limit order',
    async ({ builderAuthentication, publicClient, skip }) => {
      const account = await setupPrivyTestAccount({
        builderAuthentication,
        skip,
      });

      if (!account.hasCollateralBalance) {
        skip('Privy test wallet has no collateral balance');
      }

      const market = await publicClient.fetchMarket({
        slug: TEST_MARKET_SLUG,
      });
      const yesTokenId = expectPresent(market.outcomes.yes.tokenId);
      const price = expectPresent(market.trading.minimumTickSize);
      const size = expectPresent(market.trading.minimumOrderSize);
      const secureClient = await createSecureClient({
        signer: signerFrom(account.wallet),
        wallet: account.walletAddress,
      });

      const response = await secureClient.placeLimitOrder({
        price,
        size,
        side: OrderSide.BUY,
        tokenId: yesTokenId,
      });

      expect(response.ok).toBe(true);
      const acceptedResponse = expectAcceptedOrderResponse(response);

      await expect(
        cancelOrder(secureClient, { orderId: acceptedResponse.orderId }),
      ).resolves.toEqual(
        expect.objectContaining({
          canceled: expect.arrayContaining([acceptedResponse.orderId]),
        }),
      );
    },
    120_000,
  );
});

type SetupPrivyTestAccountRequest = {
  builderAuthentication: ApiKeyAuthorization;
  skip: Skip;
};

function setupPrivyTestAccount(request: SetupPrivyTestAccountRequest) {
  privyTestAccountPromise ??= createPrivyTestAccount(request);

  return privyTestAccountPromise;
}

async function createPrivyTestAccount({
  builderAuthentication,
  skip,
}: SetupPrivyTestAccountRequest): Promise<PrivyTestAccount> {
  const wallet: PrivyWalletConfig = {
    privy: new PrivyClient({
      appId: loadPrivyEnv('PRIVY_TEST_APP_ID', skip),
      appSecret: loadPrivyEnv('PRIVY_TEST_APP_SECRET', skip),
    }),
    walletId: loadPrivyEnv('PRIVY_TEST_WALLET_ID', skip),
  };
  const secureClient = await createSecureClient({
    apiKey: builderAuthentication,
    signer: signerFrom(wallet),
  });
  expect(secureClient.account.walletType).toBe(WalletType.DEPOSIT_WALLET);

  const hasCollateralBalance =
    (
      await fetchBalanceAllowance(secureClient, {
        assetType: AssetType.COLLATERAL,
      })
    ).balance !== '0';

  if (hasCollateralBalance && runMeteredTests) {
    await secureClient.setupTradingApprovals();
  }

  return {
    hasCollateralBalance,
    wallet,
    walletAddress: secureClient.account.wallet,
  };
}

function loadPrivyEnv(name: string, skip: Skip): string {
  const value = process.env[name];

  if (value === undefined) {
    skip(`${name} is not set`);
  }

  return value;
}

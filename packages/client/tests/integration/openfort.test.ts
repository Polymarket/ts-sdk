import Openfort from '@openfort/openfort-node';
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
import {
  type OpenfortWalletConfig,
  signerFrom,
} from '@polymarket/client/openfort';
import { expectPresent } from '@polymarket/types';
import type { TestContext } from 'vitest';
import { describe, expect, it, runMeteredTests } from './fixtures';
import { expectAcceptedOrderResponse } from './helpers';

const TEST_MARKET_SLUG = 'eth-flipped-in-2026';

type Skip = TestContext['skip'];

type OpenfortTestAccount = {
  hasCollateralBalance: boolean;
  wallet: OpenfortWalletConfig;
  walletAddress: EvmAddress;
};

let openfortTestAccountPromise: Promise<OpenfortTestAccount> | undefined;

describe('openfort', () => {
  it('authenticates a secure client', async ({
    builderAuthentication,
    skip,
  }) => {
    const account = await setupOpenfortTestAccount({
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
      const account = await setupOpenfortTestAccount({
        builderAuthentication,
        skip,
      });

      if (!account.hasCollateralBalance) {
        skip('Openfort test wallet has no collateral balance');
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

type SetupOpenfortTestAccountRequest = {
  builderAuthentication: ApiKeyAuthorization;
  skip: Skip;
};

function setupOpenfortTestAccount(request: SetupOpenfortTestAccountRequest) {
  openfortTestAccountPromise ??= createOpenfortTestAccount(request);

  return openfortTestAccountPromise;
}

async function createOpenfortTestAccount({
  builderAuthentication,
  skip,
}: SetupOpenfortTestAccountRequest): Promise<OpenfortTestAccount> {
  const wallet: OpenfortWalletConfig = {
    openfort: new Openfort(loadOpenfortEnv('OPENFORT_TEST_SECRET_KEY', skip), {
      walletSecret: loadOpenfortEnv('OPENFORT_TEST_WALLET_SECRET', skip),
    }),
    accountId: loadOpenfortEnv('OPENFORT_TEST_ACCOUNT_ID', skip),
  };
  const secureClient = await createSecureClient({
    apiKey: builderAuthentication,
    signer: signerFrom(wallet),
  });
  const depositWalletClient = await secureClient.setupGaslessWallet();

  expect(depositWalletClient.account.walletType).toBe(
    WalletType.DEPOSIT_WALLET,
  );

  const hasCollateralBalance =
    (
      await fetchBalanceAllowance(depositWalletClient, {
        assetType: AssetType.COLLATERAL,
      })
    ).balance !== '0';

  if (hasCollateralBalance && runMeteredTests) {
    await depositWalletClient.setupTradingApprovals();
  }

  return {
    hasCollateralBalance,
    wallet,
    walletAddress: depositWalletClient.account.wallet,
  };
}

function loadOpenfortEnv(name: string, skip: Skip): string {
  const value = process.env[name];

  if (value === undefined) {
    skip(`${name} is not set`);
  }

  return value;
}

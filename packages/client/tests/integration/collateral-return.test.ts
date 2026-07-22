import {
  type ApiKeyAuthorization,
  type CollateralReturnPlan,
  createSecureClient,
  forkEnvironmentConfig,
  type SecureClient,
  type Signer,
  WalletType,
} from '@polymarket/client';
import type { EvmAddress } from '@polymarket/types';
import { describe, expect, it, runMeteredTests } from './fixtures';

// Explicit opt-in for live collateral-return runs. Point this at the target
// deployment (production, or a stage mesh URL) to run these tests.
const collateralReturnUrl = process.env.POLYMARKET_COLLATERAL_RETURN_URL;

describe('Collateral return', () => {
  it('plans a collateral return for the Deposit Wallet account', async ({
    depositWalletAddress,
    depositWalletSigner,
    relayerAuthentication,
    skip,
  }) => {
    if (collateralReturnUrl === undefined || collateralReturnUrl === '') {
      skip('POLYMARKET_COLLATERAL_RETURN_URL is not set');
      return;
    }

    const secureClient = await createCollateralReturnClient(
      collateralReturnUrl,
      relayerAuthentication,
      depositWalletSigner,
      depositWalletAddress,
    );

    expect(secureClient.account.walletType).toBe(WalletType.DEPOSIT_WALLET);

    const plan = await secureClient.planCollateralReturn();

    expect(plan.wallet.toLowerCase()).toBe(depositWalletAddress.toLowerCase());
    expect(plan.planHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(plan.chainId).toBe(secureClient.environment.chainId);
    expect(plan.blockNumber).toBeGreaterThan(0n);
    expect(plan.routerCall.to.toLowerCase()).toBe(
      secureClient.environment.contracts.protocolV2Router.toLowerCase(),
    );
    expect(plan.routerCall.data).toMatch(/^0x[0-9a-f]*$/i);
    expect(typeof plan.truncated).toBe('boolean');
    expect(Number(plan.startingCollateral)).not.toBeNaN();
    expect(Number(plan.collateralReturned)).not.toBeNaN();
    expect(Number(plan.finalCollateral)).not.toBeNaN();
    expect(Number(plan.requiredCollateral)).not.toBeNaN();
    expect(Array.isArray(plan.positionSummary.consumed)).toBe(true);
    expect(Array.isArray(plan.positionSummary.created)).toBe(true);
    for (const operation of plan.operations) {
      expect(operation.kind).toBeTruthy();
      expect(Number(operation.amount)).not.toBeNaN();
    }
  });

  it.runIf(runMeteredTests)(
    'executes truncated plan chunks until the return completes',
    async ({
      depositWalletAddress,
      depositWalletSigner,
      relayerAuthentication,
      skip,
    }) => {
      if (collateralReturnUrl === undefined || collateralReturnUrl === '') {
        skip('POLYMARKET_COLLATERAL_RETURN_URL is not set');
        return;
      }

      const secureClient = await createCollateralReturnClient(
        collateralReturnUrl,
        relayerAuthentication,
        depositWalletSigner,
        depositWalletAddress,
      );

      let plan: CollateralReturnPlan;

      do {
        plan = await secureClient.planCollateralReturn();

        if (Number(plan.collateralReturned) <= 0) {
          skip('The account holds no positions with returnable collateral');
        }

        const handle = await secureClient.executeCollateralReturnPlan({
          plan,
        });
        const outcome = await handle.wait();

        expect(outcome.transactionHash).toMatch(/^0x[0-9a-f]{64}$/i);
      } while (plan.truncated);
    },
  );
});

function createCollateralReturnClient(
  url: string,
  apiKey: ApiKeyAuthorization,
  signer: Signer,
  wallet: EvmAddress,
): Promise<SecureClient> {
  return createSecureClient({
    apiKey,
    environment: forkEnvironmentConfig({
      name: 'collateral-return-integration',
      collateralReturn: { rest: url },
    }),
    signer,
    wallet,
  });
}

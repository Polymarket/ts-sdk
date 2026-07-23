import type { CollateralReturnPlan, SecureClient } from '@polymarket/client';
import {
  CollateralReturnPlanRejectedError,
  RequestRejectedError,
  WalletType,
} from '@polymarket/client';
import { type TestContext, vi } from 'vitest';
import { describe, expect, it, runMeteredTests } from './fixtures';

const SEED_SPLIT_AMOUNT = 1_000_000n; // 1 pUSD in base units
const PLAN_RETRY_ATTEMPTS = 3;
const EXECUTE_RETRY_ATTEMPTS = 3;

describe('Collateral return', () => {
  it('plans a collateral return for the Deposit Wallet account', async ({
    secureClientWithDepositWallet,
  }) => {
    const secureClient = secureClientWithDepositWallet;

    expect(secureClient.account.walletType).toBe(WalletType.DEPOSIT_WALLET);

    const plan = await secureClient.planCollateralReturn();

    expect(plan.wallet.toLowerCase()).toBe(
      secureClient.account.wallet.toLowerCase(),
    );
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
    'seeds combo inventory and executes plans until the return completes',
    async ({ secureClientWithDepositWallet, skip }) => {
      const secureClient = secureClientWithDepositWallet;

      let plan = await fetchPlan(secureClient);

      if (Number(plan.collateralReturned) <= 0) {
        plan = await seedReturnableInventory(secureClient, plan, skip);
      }

      let rejections = 0;

      for (;;) {
        try {
          const handle = await secureClient.executeCollateralReturnPlan({
            plan,
          });
          const outcome = await handle.wait();

          expect(outcome.transactionHash).toMatch(/^0x[0-9a-f]{64}$/i);
        } catch (error) {
          // Wallet state can move between planning and submission; the
          // documented recovery is to request a fresh plan and execute that.
          rejections += 1;

          if (
            !(error instanceof CollateralReturnPlanRejectedError) ||
            rejections > EXECUTE_RETRY_ATTEMPTS
          ) {
            throw error;
          }

          plan = await fetchPlan(secureClient);

          if (Number(plan.collateralReturned) <= 0) {
            break;
          }

          continue;
        }

        if (!plan.truncated) {
          break;
        }

        plan = await fetchPlan(secureClient);

        if (Number(plan.collateralReturned) <= 0) {
          break;
        }
      }
    },
    300_000,
  );
});

// Retries planning through transient upstream failures (for example edge
// 502s) that are unrelated to the plan itself.
async function fetchPlan(
  secureClient: SecureClient,
): Promise<CollateralReturnPlan> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await secureClient.planCollateralReturn();
    } catch (error) {
      if (
        attempt >= PLAN_RETRY_ATTEMPTS ||
        !(error instanceof RequestRejectedError) ||
        error.status < 500
      ) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}

// Splits collateral into complementary YES/NO combo positions so the planner
// has something to merge back. Executing the resulting plan returns the same
// collateral, keeping the seeded amount a net-zero round trip.
async function seedReturnableInventory(
  secureClient: SecureClient,
  currentPlan: CollateralReturnPlan,
  skip: TestContext['skip'],
): Promise<CollateralReturnPlan> {
  if (Number(currentPlan.startingCollateral) < 1) {
    skip(
      'The account needs at least 1 pUSD of collateral to seed combo inventory',
    );
  }

  const comboMarkets = await secureClient.listComboMarkets({}).firstPage();
  const [marketA, marketB] = comboMarkets.items;

  if (marketA === undefined || marketB === undefined) {
    skip('Expected at least two combo-eligible markets to seed inventory');
  }

  const handle = await secureClient.splitPosition({
    amount: SEED_SPLIT_AMOUNT,
    legs: [marketA.outcomes.yes.positionId, marketB.outcomes.yes.positionId],
  });
  await handle.wait();

  // The planner snapshots positions through the indexer, so poll until the
  // new complementary pair becomes visible and the plan turns profitable.
  return vi.waitFor(
    async () => {
      const plan = await fetchPlan(secureClient);

      expect(Number(plan.collateralReturned)).toBeGreaterThan(0);

      return plan;
    },
    { interval: 5_000, timeout: 120_000 },
  );
}

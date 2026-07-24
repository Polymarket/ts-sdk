import type {
  CollateralReturnPlanResponse,
  SecureClient,
} from '@polymarket/client';
import {
  createSecureClient,
  RequestRejectedError,
  WalletType,
} from '@polymarket/client';
import { expectHexString } from '@polymarket/types';
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
  });

  it('plans a collateral return for a Safe Wallet account', async ({
    safeWalletAddress,
    safeWalletSigner,
  }) => {
    const secureClient = await createSecureClient({
      signer: safeWalletSigner,
      wallet: safeWalletAddress,
    });

    expect(secureClient.account.walletType).toBe(WalletType.GNOSIS_SAFE);

    const plan = await fetchPlan(secureClient);

    expect(plan.wallet.toLowerCase()).toBe(safeWalletAddress.toLowerCase());
  });

  it('plans a collateral return for a Proxy Wallet account', async ({
    proxyWalletAddress,
    proxyWalletSigner,
  }) => {
    const secureClient = await createSecureClient({
      signer: proxyWalletSigner,
      wallet: proxyWalletAddress,
    });

    expect(secureClient.account.walletType).toBe(WalletType.POLY_PROXY);

    const plan = await fetchPlan(secureClient);

    expect(plan.wallet.toLowerCase()).toBe(proxyWalletAddress.toLowerCase());
  });

  it('rejects planning for an EOA-bound account', async ({
    randomEoaSigner,
  }) => {
    const signerAddress = await randomEoaSigner.getAddress();
    const secureClient = await createSecureClient({
      signer: randomEoaSigner,
      wallet: signerAddress,
    });

    expect(secureClient.account.walletType).toBe(WalletType.EOA);

    await expect(secureClient.planCollateralReturn()).rejects.toThrow(
      /Deposit Wallet, Safe Wallet, and Proxy Wallet accounts/,
    );
  });

  // Relayer API keys are address-bound, so a fresh random Deposit Wallet
  // cannot be deployed against production. The empty-plan scenario instead
  // uses the configured account, which holds no returnable inventory between
  // metered runs; it skips when inventory is pending.
  it.runIf(runMeteredTests)(
    'returns an empty plan when nothing is returnable and rejects executing it',
    async ({ secureClientWithDepositWallet, skip }) => {
      const secureClient = secureClientWithDepositWallet;

      const plan = await fetchPlan(secureClient);

      if (Number(plan.netPusdOut) > 0) {
        skip('The account holds returnable inventory; empty plan unavailable');
      }

      expect(plan.operations).toEqual([]);

      // A plan that returns no collateral is re-validated and rejected by the
      // service at submission.
      await expect(
        secureClient.executeCollateralReturnPlan({ plan }),
      ).rejects.toThrow(RequestRejectedError);
    },
    300_000,
  );

  // A corrupted execution artifact fails submit validation and is rejected
  // by the service before anything reaches the relayer.
  it.runIf(runMeteredTests)(
    'rejects a tampered plan as an invalid submission',
    async ({ secureClientWithDepositWallet }) => {
      const secureClient = secureClientWithDepositWallet;
      const plan = await fetchPlan(secureClient);

      const tampered: CollateralReturnPlanResponse = {
        ...plan,
        routerCall: {
          ...plan.routerCall,
          data: expectHexString('0xdeadbeef'),
        },
      };

      await expect(
        secureClient.executeCollateralReturnPlan({ plan: tampered }),
      ).rejects.toThrow(RequestRejectedError);
    },
    300_000,
  );

  it.runIf(runMeteredTests)(
    'seeds combo inventory and executes plans until the return completes',
    async ({ secureClientWithDepositWallet, skip }) => {
      await seedAndExecuteCollateralReturn(secureClientWithDepositWallet, skip);
    },
    300_000,
  );

  // TODO(DEV-482): Re-enable after the Safe combo split no longer reverts
  // during relayer delegatecall simulation.
  it.skipIf(true)(
    'seeds and executes a collateral return for a Safe Wallet account',
    async ({
      builderAuthentication,
      safeWalletAddress,
      safeWalletSigner,
      skip,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: builderAuthentication,
        signer: safeWalletSigner,
        wallet: safeWalletAddress,
      });

      expect(secureClient.account.walletType).toBe(WalletType.GNOSIS_SAFE);

      await seedAndExecuteCollateralReturn(secureClient, skip);
    },
    300_000,
  );

  it.runIf(runMeteredTests)(
    'seeds and executes a collateral return for a Proxy Wallet account',
    async ({
      builderAuthentication,
      proxyWalletAddress,
      proxyWalletSigner,
      skip,
    }) => {
      const secureClient = await createSecureClient({
        apiKey: builderAuthentication,
        signer: proxyWalletSigner,
        wallet: proxyWalletAddress,
      });

      expect(secureClient.account.walletType).toBe(WalletType.POLY_PROXY);

      await seedAndExecuteCollateralReturn(secureClient, skip);
    },
    300_000,
  );
});

// Seeds returnable inventory when needed, executes plans until the return
// completes, and verifies a consumed plan can no longer be re-submitted.
async function seedAndExecuteCollateralReturn(
  secureClient: SecureClient,
  skip: TestContext['skip'],
): Promise<void> {
  let plan = await fetchPlan(secureClient);

  if (Number(plan.netPusdOut) <= 0) {
    plan = await seedReturnableInventory(secureClient, plan, skip);
  }

  let rejections = 0;
  let executedPlan: CollateralReturnPlanResponse | undefined;

  for (;;) {
    try {
      const handle = await secureClient.executeCollateralReturnPlan({
        plan,
      });
      const outcome = await handle.wait();

      expect(outcome.transactionHash).toMatch(/^0x[0-9a-f]{64}$/i);
      executedPlan = plan;
    } catch (error) {
      // Wallet state can move between planning and submission; the service
      // rejects the stale plan with a 409 and the documented recovery is to
      // request a fresh plan and execute that.
      rejections += 1;

      const stalePlan =
        error instanceof RequestRejectedError && error.status === 409;

      if (!stalePlan || rejections > EXECUTE_RETRY_ATTEMPTS) {
        throw error;
      }

      plan = await fetchPlan(secureClient);

      if (Number(plan.netPusdOut) <= 0) {
        break;
      }

      continue;
    }

    if (!plan.truncated) {
      break;
    }

    plan = await fetchPlan(secureClient);

    if (Number(plan.netPusdOut) <= 0) {
      break;
    }
  }

  // The executed plan no longer matches wallet state, so re-submitting it
  // must be rejected in favor of a fresh plan.
  if (executedPlan !== undefined) {
    await expect(
      secureClient.executeCollateralReturnPlan({ plan: executedPlan }),
    ).rejects.toThrow(RequestRejectedError);
  }
}

// Retries planning through transient upstream failures (for example edge
// 502s) that are unrelated to the plan itself.
async function fetchPlan(
  secureClient: SecureClient,
): Promise<CollateralReturnPlanResponse> {
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
  currentPlan: CollateralReturnPlanResponse,
  skip: TestContext['skip'],
): Promise<CollateralReturnPlanResponse> {
  if (Number(currentPlan.startingPusd) < 1) {
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

      expect(Number(plan.netPusdOut)).toBeGreaterThan(0);

      return plan;
    },
    { interval: 5_000, timeout: 120_000 },
  );
}

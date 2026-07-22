// Prepares an account for the metered collateral-return integration test.
//
// Splits 1 pUSD into complementary YES/NO combo positions so the
// collateral-return planner has something to merge back. Executing the
// resulting plan (for example through the metered integration test) returns
// the same collateral to the wallet, so the round trip is net-zero. Legs are
// picked from live combo-eligible markets. Requires a funded Deposit Wallet;
// exits early when the current plan already returns collateral.
import { createSecureClient, relayerApiKey } from '@polymarket/client';
import { privateKey } from '@polymarket/client/viem';
import { requireEnv } from './lib/env';

const SPLIT_AMOUNT = 1_000_000n; // 1 pUSD in base units

const secureClient = await createSecureClient({
  apiKey: relayerApiKey({
    key: requireEnv('POLYMARKET_RELAYER_API_KEY'),
    address: requireEnv('POLYMARKET_RELAYER_API_KEY_ADDRESS'),
  }),
  wallet: requireEnv('POLYMARKET_DEPOSIT_WALLET'),
  signer: privateKey(requireEnv('POLYMARKET_PRIVATE_KEY')),
});

console.log('account:', {
  wallet: secureClient.account.wallet,
  walletType: secureClient.account.walletType,
});

let plan = await secureClient.planCollateralReturn();
console.log('plan before preparation:', {
  startingCollateral: plan.startingCollateral,
  collateralReturned: plan.collateralReturned,
  operations: plan.operations.length,
});

if (Number(plan.collateralReturned) > 0) {
  console.log('Plan already returns collateral; nothing to prepare.');
  process.exit(0);
}

if (Number(plan.startingCollateral) < 1) {
  throw new Error(
    `Wallet holds ${plan.startingCollateral} pUSD; fund it with at least 1 pUSD before preparing.`,
  );
}

const comboMarkets = await secureClient.listComboMarkets({}).firstPage();
const [marketA, marketB] = comboMarkets.items;
if (marketA === undefined || marketB === undefined) {
  throw new Error('Expected at least two combo-eligible markets.');
}
const legs = [marketA.outcomes.yes.positionId, marketB.outcomes.yes.positionId];
console.log('picked combo legs:', {
  marketA: marketA.title,
  marketB: marketB.title,
  legs,
});

console.log('Ensuring trading approvals…');
await secureClient.setupTradingApprovals();

console.log('Splitting 1 pUSD into complementary combo positions…');
const handle = await secureClient.splitPosition({
  amount: SPLIT_AMOUNT,
  legs,
});
const outcome = await handle.wait();
console.log('split confirmed:', outcome.transactionHash);

// The planner snapshots positions through the indexer, so poll until the new
// complementary pair becomes visible and the plan turns profitable.
for (let attempt = 1; attempt <= 20; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 6_000));

  try {
    plan = await secureClient.planCollateralReturn();
  } catch (error) {
    console.log(`plan attempt ${attempt} failed, retrying:`, `${error}`);
    continue;
  }

  console.log(`plan attempt ${attempt}:`, {
    collateralReturned: plan.collateralReturned,
    operations: plan.operations.length,
    truncated: plan.truncated,
  });

  if (Number(plan.collateralReturned) > 0) {
    console.log('Plan now returns collateral:', {
      collateralReturned: plan.collateralReturned,
      requiredCollateral: plan.requiredCollateral,
      positionSummary: plan.positionSummary,
      operations: plan.operations,
    });
    process.exit(0);
  }
}

throw new Error(
  'Planner still returns no collateral; check indexing of the new positions.',
);

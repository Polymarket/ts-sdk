# Directional collateral return

The SDK supports module-4 lines, real buckets and Void. A line is a normal
YES/NO trading market: YES means ABOVE the boundary and NO means BELOW it.
Buckets and Void are inventory and resolution instruments with no order book.

## Market maker workflow

Use `listMarkets({ version: ProtocolVersion.V2 })` to discover tradable lines.
Orders take each outcome's `positionId` as their `assetId`. Buy YES on the lower
line and NO on the higher line, then wait for both fills to settle **on chain**.
Order acceptance or a matched fill alone does not establish wallet balances.

```ts
import { decodePositionId } from '@polymarket/client';

const low = decodePositionId(yesLowPositionId);
const high = decodePositionId(noHighPositionId);
if (low.kind !== 'line' || low.side !== 'above' ||
    high.kind !== 'line' || high.side !== 'below' ||
    low.eventId !== high.eventId || low.index >= high.index) {
  throw new Error('Expected ABOVE(low) and BELOW(high) in the same event');
}

await client.setupTradingApprovals();
const pair = { eventId: low.eventId, lowLine: low.index, highLine: high.index };
const transaction = await client.mergeDirectional(pair);
const outcome = await transaction.wait();
console.log(outcome.transactionHash);
```

The decoder uses local bit math and accepts decimal module-4 position IDs. It
returns `{ moduleId, eventId, bucketCount, kind, index, side, conditionId }`.
It rejects CTF and other modules rather than interpreting hashes as directional
instruments. `kind` is `line`, `bucket` or `void`; line indices are **ordinal
boundaries**, not point totals or the encoded `0x8000 | index` descriptor.
Protocol event IDs are bytes29 (zero-padded bytes32 is also accepted), distinct
from the numeric event IDs used by the market catalog and position filters.

`mergeDirectional` consumes ABOVE(low) and BELOW(high). Per pair, it returns
1 pUSD plus one YES on each real bucket in `[lowLine, highLine)`. With six real
buckets, merging lines 2 and 4 returns pUSD plus bucket YES positions 2 and 3.
It does not return Void. BELOW baskets used by threshold composition do include
Void; ABOVE baskets do not.

Both methods accept `amount?: bigint | 'max'`, in six-decimal base units:

- Merge: omitted or `'max'` uses the fresh minimum of the two threshold balances.
- Split: omitted or `'max'` uses the fresh minimum of pUSD and **every** required
  middle-bucket YES balance. Splitting requires both collateral and buckets.
- Explicit amounts must be positive uint256 values. Preparation rejects empty
  inventory and insufficient balances before signing. Balances can still change
  before execution; the Router transaction is atomic.

To reverse a known merge, use its explicit amount so other inventory is untouched:

```ts
const split = await client.splitDirectional({ ...pair, amount: 1_000_000n });
await split.wait();
```

`client.findDirectionalPairs({ eventId })` optionally narrows discovery to one
protocol event; omit the request to scan this account. It scans indexed holdings
and refreshes candidate balances on chain. Each result has `amount` and
`expectedPusd` in base units and can supply the parameters to `mergeDirectional`.
Overlapping pairs share inventory: do not add their amounts or treat the result
as a batch execution plan. Unindexed positions cannot be discovered this way;
an explicitly known pair can still be merged using local IDs and wallet balances.

## Wallets and approvals

Deposit Wallet, Safe and Proxy use their existing atomic wallet-batch path.
EOAs send a direct Router transaction and pay gas. Every operation uses the
authenticated account wallet as holder and recipient; there is no recipient
override or wallet migration. `wait()` remains explicit.

`setupTradingApprovals()` already includes pUSD approval for the Router and
PositionManager `setApprovalForAll(Router)`. It waits for its approval work and
returns `void`. Directional operations do not submit approvals automatically.
An EOA signer must use the same chain and RPC as the SDK environment; for a
staging fork, pass that transport to `privateKey(key, { chain, transport })`.

For custom signing, each operation exposes a `prepare*` action and bound method.
Preparing reads balances where needed, but does not sign or submit until its
workflow is advanced. Router calldata builders are also exported. The wallet
batch transport alone does **not** establish server selector acceptance, policy
classification or sponsorship; verify all three in the target environment.

## Inventory and data

| Intent | SDK method |
| --- | --- |
| Split/merge one line, bucket or Void YES/NO pair | `splitPosition`, `mergePositions` with `conditionId` |
| Redeem an eligible outcome | `redeemPositions` |
| Split collateral into every bucket YES, including Void | `splitEventPositions` |
| Merge that complete YES set | `mergeEventPositions` |
| Convert a bucket NO, including Void NO, into other buckets' YES | `convertPosition` |
| Convert buckets to a threshold side or back | `composeThreshold`, `decomposeThreshold` |
| Return collateral from two lines, or reverse it | `mergeDirectional`, `splitDirectional` |

Directional split/merge/redeem by condition ID resolves IDs locally and does not
require a market listing. The existing `horizontalSplit`, `horizontalMerge` and
`convert` APIs remain neg-risk workflows; use the event/position methods above
for module 4.

`listActivity` accepts and parses all four new types in default or filtered
feeds. `DIRECTIONAL_MERGE` / `DIRECTIONAL_SPLIT` return an on-chain `eventId`,
`pairs` and collateral `amount`; they are not deposits or market-level rows.
`THRESHOLD_COMPOSE` / `THRESHOLD_DECOMPOSE` return a line condition, side and
`shares`, with zero collateral movement. Missing metadata remains optional.
Filtering for `MERGE` or `SPLIT` does not include the directional variants.

To resolve residual bucket or Void metadata, use
`listMarkets({ positionIds: [id], closed: 'any' })`. Unfiltered discovery excludes
these instruments. A successful identity lookup does not prove that
`listPositions` includes the holding: deployment must leave its market active
and unarchived. Collateral-return PnL policy remains an upstream open decision;
the SDK does not invent residual cost basis or realized PnL.

## Validation and remaining integration work

This PR includes local codec, Router encoding, balance-limit, activity, pair
discovery and public-type coverage. The runnable `directional:positions` example
shows the IDs and decoded line contract without any credentials.

The staging integration test covers Deposit Wallet, Safe and EOA. It requires a
deployed event with at least three real buckets and dedicated wallets with no
inventory on lines 1/2, bucket 1 or Void. It splits two line sets, merges the
cross-line pair, checks pUSD and bucket balances plus one merge activity row and
bucket metadata/holdings, reverses the pair, then merges the original line sets.
It uses one pair and requires at least 2 pUSD per wallet, plus EOA gas.

Configure locally or through the secret runner, without committing values:

- `POLYMARKET_INTEGRATION_ENVIRONMENT_CONFIG`: explicit staging environment
  JSON, including name, chain ID, RPC, deployed contract overrides and service
  URLs/headers. Do not inherit production endpoints for staging transactions.
- `POLYMARKET_DCR_EVENT_ID`: on-chain directional event ID.
- Deposit Wallet: `POLYMARKET_PRIVATE_KEY`, `POLYMARKET_DEPOSIT_WALLET`.
- Safe: `POLYMARKET_SAFE_PRIVATE_KEY`, `POLYMARKET_SAFE_WALLET`.
- EOA: `POLYMARKET_DCR_EOA_PRIVATE_KEY`.
- Wallet-batch authorization: `POLYMARKET_RELAYER_API_KEY` and
  `POLYMARKET_RELAYER_API_KEY_ADDRESS`, matching the account under test.

```sh
pnpm build
pnpm test:client:integration --run packages/client/tests/integration/directional.test.ts
```

Missing event/credential configuration skips with a reason; skips are not a
staging pass. Partial transaction failures may leave test inventory; inspect
confirmed transactions before rerunning. The test rejects the default production
environment. Its deterministic line splits do not validate trading or settlement.

Complete these launch checks in staging, in order:

1. Verify module 4 registration and the deployed Router ABI; enable line books
   through the normal deployment flow. Buckets/Void must stay nontradable.
2. Run the round trip above for all three wallet types. Verify each of the four
   selectors under sponsorship and withdrawal-allowlist policy, and retain clear
   revert diagnostics. SDK code cannot enable server policy or sponsorship.
3. Buy the two wings through SDK orders, wait for chain settlement, then run the
   merge/reverse workflow. Assert the activity row and residual holdings, not
   only transaction success. Repeat invalid-pair and insufficient-balance cases.
4. Validate threshold compose/decompose, whole-event operations including Void,
   and eligible bucket/line redemptions. Confirm portfolio visibility and the
   agreed PnL policy with the data owners.

As of 2 November 2026, the linked testing thread reports threshold trading after
manually enabling its book, followed by a deployed test fix. That evidence does
not establish normal book activation or DCR wallet execution. This cloud session
has no staging credentials/VNet RPC, no VPN, and its allowed hosts exclude the
staging `polymarket.sh` endpoints. Live staging execution remains unverified.

Directional integration into `planCollateralReturn` / `executeCollateralReturnPlan`
is P2 and remains deferred, as specified. Pair discovery is read-only and does
not imply that the existing collateral-return service plans directional pairs.

Sources: [SDK scope](https://app.notion.com/p/408d316c50d581e2bb8fc824d9ec5016),
[Gamma contract](https://github.com/Polymarket/markets-tooling/blob/main/packages/api/agent-docs/directional-markets.md),
[data decisions](https://app.notion.com/p/402d316c50d5819aaea8e8d12097e1f5),
[staging discussion](https://polymarket.slack.com/archives/C0BRN8DLS8G/p1793288989782179).

# `@polymarket/client`

`@polymarket/client` is the official TypeScript client for building on Polymarket.

## Installation

```bash
pnpm add @polymarket/client
```

## Usage

```ts
import { createPublicClient } from '@polymarket/client';

const client = createPublicClient();

const result = client.listMarkets({
  closed: false,
  pageSize: 3,
});

for await (const page of result) {
  // page.items: Market[] 
}
```

## Neg-risk positions (protocol V2)

An authenticated client can convert a NO position into YES positions for every
other condition, split pUSD into a complete YES basket, or merge that basket back
into pUSD. The basket includes the synthetic **Other** condition; conversion from
NO(Other) produces YES only for the real conditions. Condition indexes
run from zero through the event's encoded arity; Other uses the arity as its index.

Use the on-chain neg-risk event ID (`bytes29`, or `bytes32` with its final three
bytes zero), not the numeric API event ID, a condition ID, or a legacy neg-risk
market ID. Amounts are positive explicit integers in six-decimal base units;
`1_000_000n` means one pUSD or one share per condition. These methods do not accept
`'max'`.

```ts
// secureClient is an authenticated client; eventId is the on-chain event ID.
// Set approvals once, then wait for them before using the Router.
await secureClient.setupTradingApprovals();

await (await secureClient.horizontalSplit({ eventId, amount: 1_000_000n })).wait();
await (await secureClient.horizontalMerge({ eventId, amount: 1_000_000n })).wait();

// Requires an existing NO position for condition 0.
await (await secureClient.convert({ eventId, conditionIndex: 0, amount: 1_000_000n })).wait();
```

Horizontal split requires pUSD spending approval for the Router. Convert and
horizontal merge require PositionManager operator approval for the Router.
`setupTradingApprovals()` includes these approvals; the three operations do not
approve automatically. Each uses the authenticated EOA or gasless wallet and returns
a transaction handle without waiting for confirmation.

For externally managed signing, `prepareConvert`, `prepareHorizontalSplit`, and
`prepareHorizontalMerge` return workflows without signing or submitting. Advance
the workflow with its requested signer responses to execute it.

## License

MIT

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

## HTTP request controls

HTTP request controls are experimental and may change in a breaking way in any
release, including patch releases. This includes the `fetch` and `retry` client
options, per-operation `signal`, and `RequestAbortedError`.

Provide a custom `fetch` for instrumentation or your application's transport.
Set `retry: false` when a query library owns retries:

```ts
import { createPublicClient } from '@polymarket/client';

const client = createPublicClient({
  fetch: appFetch,
  retry: false,
});

useQuery({
  queryKey: ['order-book', assetId],
  queryFn: ({ signal }) => client.fetchOrderBook({ assetId }, { signal }),
});
```

Without these options, the SDK uses native fetch and its existing retry policy.
Rate-limited reads allow two retries, wait one second when no retry delay is
provided, and propagate delays longer than five seconds to the caller.
`retry: false` disables HTTP transport retries and read recovery. Wallet workflow
recovery, such as refreshing a nonce or approving and resubmitting a transaction,
is unchanged. Retries inside your custom fetch are controlled by your application.

HTTP reads accept an optional final `{ signal }` argument. Aborting rejects with
`RequestAbortedError`, whose `cause` is the signal's reason, and stops pending
requests, response reads, and retry waits. A custom fetch must honor the request's
signal. Concurrent operations on the same client have independent cancellation.
Order submission, wallet mutations, and WebSocket sessions do not accept these
per-operation cancellation options.

Create a paginator within each query invocation so its continuation requests use
that invocation's signal:

```ts
import type { PaginationCursor } from '@polymarket/client';

useInfiniteQuery({
  queryKey: ['positions', user],
  initialPageParam: undefined as PaginationCursor | undefined,
  queryFn: ({ pageParam, signal }) =>
    client.listPositions({ user, cursor: pageParam }, { signal }).firstPage(),
  getNextPageParam: (page) =>
    page.hasMore && !page.limitReached ? page.nextCursor : undefined,
});
```

The same signal is retained by `.from(cursor)` and `for await` traversal. An
aborted unfinished traversal rejects; pages already returned remain usable.
For authenticated methods with optional filters, keep the request argument slot:
`secureClient.listPositions(undefined, { signal }).firstPage()`.

`createSecureClient` accepts the same `fetch` and `retry` options. Authentication,
client extensions, and the public client returned by `endAuthentication()` retain
these settings. Custom fetch covers SDK-owned HTTP, including authentication and
remote signing; it does not configure a wallet provider's own network requests.

## Neg-risk positions (protocol V2)

An authenticated client can convert a NO position into YES positions for every
other condition, split pUSD into a complete YES basket, or merge that basket back
into pUSD. The basket includes the synthetic **Other** condition; conversion from
NO(Other) produces YES only for the real conditions.

Pass the market's protocol V2 neg-risk `conditionId` (`bytes31`, or `bytes32`
with a zero final byte). The SDK derives the event and condition index locally;
horizontal operations use the entire event containing that condition. Legacy,
binary, combo and position IDs are rejected. Amounts are positive explicit integers in six-decimal base units;
`1_000_000n` means one pUSD or one share per condition. These methods do not accept
`'max'`.

```ts
// secureClient is authenticated; conditionId comes from a V2 neg-risk market.
// Set approvals once, then wait for them before using the Router.
await secureClient.setupTradingApprovals();

await (await secureClient.horizontalSplit({ conditionId, amount: 1_000_000n })).wait();
await (await secureClient.horizontalMerge({ conditionId, amount: 1_000_000n })).wait();

// Requires an existing NO position for this condition.
await (await secureClient.convert({ conditionId, amount: 1_000_000n })).wait();
```

Low-level `routerConvertCall`, `routerHorizontalSplitCall` and
`routerHorizontalMergeCall` retain explicit `protocolEventId` inputs;
conversion also takes a `conditionIndex`.

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

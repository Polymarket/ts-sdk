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
release, including patch releases. This includes the `fetch` client
option, per-operation `signal` and `retries`, and `RequestAbortedError`.

Provide a custom `fetch` for instrumentation or your application's transport.
Set `retries: 0` on reads when a query library owns retries:

```ts
import { createPublicClient } from '@polymarket/client';

const client = createPublicClient({
  fetch: appFetch,
});

useQuery({
  queryKey: ['order-book', assetId],
  queryFn: ({ signal }) => client.fetchOrderBook({ assetId }, { signal, retries: 0 }),
});
```

Without a custom fetch, the SDK uses native fetch. Eligible data reads accept
`retries`, an integer from 0 through 5, defaulting to 2. Zero means one attempt;
two means at most three attempts. Transport failures and rate limits share one
budget per request, and each pagination request gets a fresh budget. Invalid
values reject with `UserInputError` before sending a request. Rate-limit waits
default to one second when no delay is provided; delays longer than five seconds
propagate to the caller. Wallet workflow recovery, such as refreshing a nonce,
approving and resubmitting a transaction, or relay recovery, is unchanged. Retries inside your custom fetch are controlled by your application.

HTTP reads accept an optional final `{ signal, retries }` argument. Aborting rejects with
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
    client.listPositions({ user, cursor: pageParam }, { signal, retries: 0 }).firstPage(),
  getNextPageParam: (page) =>
    page.hasMore && !page.limitReached ? page.nextCursor : undefined,
});
```

The same signal is retained by `.from(cursor)` and `for await` traversal. An
aborted unfinished traversal rejects; pages already returned remain usable.
For authenticated methods with optional filters, keep the request argument slot:
`secureClient.listPositions(undefined, { signal }).firstPage()`.

`createSecureClient` accepts the same `fetch` option. Authentication, client
extensions, and the public client returned by `endAuthentication()` retain it.
Retry budgets belong to each read; there is no client-level retry setting.
Custom fetch covers SDK-owned HTTP, including authentication and
remote signing; it does not configure a wallet provider's own network requests.

## Experimental service requests

`PublicClient.predictions` and `SecureClient.predictions` send requests to the
endpoint used by the polymarket.com UI. This getter is experimental and is not
intended for external consumers, who should use the high-level SDK actions.
Breaking changes may occur in any release, including patch releases.

Production requests go to `https://api.defi.polymarket.com`. Environment forks
can override `predictions.rest` and `predictions.headers`. Trading credentials
are not attached automatically, so callers supply any headers the endpoint
requires.

Prediction POST, PATCH, and DELETE requests are sent once, including when a
connection drops after dispatch. GET accepts the same per-request `retries` budget.
Gateway rejections preserve their `code` and message on `RequestRejectedError`.
After `cancel_outcome_unknown`, check open orders before manually retrying;
cancellation may already have taken effect. Aborting a mutation stops the local
request but cannot prove it had no effect. Raw callers inspect the status/body,
including rate limits; raw mode only retries transport failures.

```ts
const markets = await client.predictions.get("/next/markets", {
  params: new URLSearchParams({ page_size: "1", closed: "false" }),
  signal,
});
```

Requests resolve parsed JSON and reject with SDK errors. Pass a `zod@^4` schema
to validate the response and infer its type, or set `responseType` for `blob`,
`arrayBuffer`, `text`, `empty` or `raw` responses. A `raw` response
resolves for every status, including 4xx, so the caller can check
`response.ok` and read the error body.

## Removed `neverthrow` re-exports

`@polymarket/types` no longer re-exports `neverthrow` APIs or the `unwrap`
helper. Applications that still use `neverthrow` must add it as their own
dependency and import from it directly:

```ts
// Before
import { ResultAsync, ok } from "@polymarket/types";
```

```ts
// After
import { ResultAsync, ok } from "neverthrow";
```

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

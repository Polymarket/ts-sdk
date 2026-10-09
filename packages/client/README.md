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

## Experimental service requests

`PublicClient.predictions` and `SecureClient.predictions` send requests to the
endpoint used by the polymarket.com UI. This getter is experimental and is not
intended for external consumers, who should use the high-level SDK actions.
Breaking changes may occur in any release, including patch releases.

Production requests go to `https://api.defi.polymarket.com`. Environment forks
can override `predictions.rest` and `predictions.headers`. Trading credentials
are not attached automatically, so callers supply any headers the endpoint
requires.

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

## License

MIT

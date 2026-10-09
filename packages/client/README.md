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

`PublicClient.predictions` and `SecureClient.predictions` expose a `ServiceClient`
for polymarket.com UI requests. Production requests use
`https://api.defi.polymarket.com`; advanced environment forks may override
`predictions.rest` and `predictions.headers`. The internal preproduction
environment uses `https://api-defi-staging.polymarket.dev`. The getter is
experimental, and breaking changes may occur in any release, including patch
releases. External consumers should use high-level SDK actions. Existing service
getters, routes, authentication, and high-level actions retain their behavior.

All four methods (`get`, `post`, `patch`, `del`) accept a flat options object:

```ts
const client = createPublicClient();
const ping = await client.predictions.get<{ status: string }>("/next/ping", {
  signal,
});

// endpoint, payload and ResponseSchema come from the UI's endpoint contract.
const result = await client.predictions.post(endpoint, {
  json: payload,
  ...options,
  signal,
  schema: ResponseSchema,
});
```

POST bodies use `json`; request controls such as `headers`, `timeout` and
`retry: false` sit alongside `signal` and `schema`, rather than inside a nested
`options` object. GET query parameters use `params: URLSearchParams`. Responses
resolve as parsed data; errors reject the promise and can be handled with
`try/catch`. A schema validates/transforms the response and infers the result
type; a generic alone declares an unchecked JSON result type. Existing trading
credentials are not automatically attached to these requests. Supply headers
required by the chosen gateway endpoint; gateway identity login and refresh are
not implemented here. Configuring the URL does not establish edge availability
or grant access through its deployment gates.

Configured service clients return promises from `get`,
`post`, `patch`, and `del`. JSON is the default response mode. Supply the verified
endpoint's schema and the operation's signal in the same options object; schema
validation and transformations determine the resolved type. The following
helper illustrates inference for an endpoint whose response is a numeric string;
its caller supplies a configured service and endpoint path. The UI project
needs its own `zod` dependency for this schema example (`pnpm add zod`):

```ts
import type { ServiceClient } from "@polymarket/client";
import { z } from "zod";

async function readCount(service: ServiceClient, path: string, signal: AbortSignal) {
  return service.get(path, {
    schema: z.string().regex(/^\d+$/).transform(Number),
    signal,
  });
  // Promise<number>, inferred from the schema's output
}
```

`service.get<ExpectedResponse>(path, { signal })` declares an unchecked JSON
return type; it does not validate or transform the data. Without a schema or
generic type, `service.get(path, { signal })` returns `Promise<unknown>`.

All four verbs accept `schema` and `signal`. GET also accepts `params` and
`headers`; POST and PATCH accept `json` and `headers`; DELETE accepts `json`,
`params`, and `headers`. Explicit `responseType` values select `json`, `blob`,
`arrayBuffer`, `text`, `empty`, or `raw`, resolving to JSON data, `Blob`,
`ArrayBuffer`, `string`, `void`, or `Response`, respectively. Only JSON mode
accepts a schema. Empty mode consumes and discards the successful body.

Raw mode resolves when successful response headers are available. The caller
owns subsequent body reads and their fetch errors; the signal remains attached
to the underlying request even after the service promise resolves:

```ts
async function readRawText(service: ServiceClient, path: string, signal: AbortSignal) {
  const response = await service.get(path, { responseType: "raw", signal });
  return response.text();
}
```

For parsed modes, request cancellation covers authentication resolution,
transport, response consumption, and the check before synchronous schema
validation. It rejects with `RequestAbortedError` and preserves the signal's
reason as `cause`. Raw body-read failures after the service promise resolves
come from the body read itself.

`@polymarket/types` no longer re-exports `neverthrow` APIs or the legacy `unwrap`
helper. This is a breaking change to those imports. Applications that still use
`neverthrow` must add it as their own dependency and import its APIs directly:

```ts
// Before
import { ResultAsync, ok } from "@polymarket/types";
```

```ts
// After: declare neverthrow as an application dependency
import { ResultAsync, ok } from "neverthrow";
```

SDK service requests now return promises. Replace
`await unwrap(service.get(path))` with `await service.get(path)`; the promise
resolves parsed response data rather than a raw response. Use
`{ responseType: "raw" }` when you need the response object.

## License

MIT

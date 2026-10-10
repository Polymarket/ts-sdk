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

## Gateway client metadata

Requests sent through the gateway client include `POLYMARKET_CLIENT` with the
package and runtime versions, for example
`@polymarket/client@0.12.0:nodejs@24.0.0`. Detection is local, best effort, and uses
`unknown` when a runtime or version is unavailable. The generated value takes
precedence over configured or per-request values for this header.

This metadata does not change request routing or authentication. Requests sent
directly to other services do not receive the generated header.

## License

MIT

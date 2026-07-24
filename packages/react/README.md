# `@polymarket/react`

The `@polymarket/react` package is the React hooks SDK for Polymarket, built on top of `@polymarket/client`.

## Status

This package is in early development. The current surface covers the provider, the read-hook primitives, and discovery read hooks.

## Installation

```bash
pnpm add @polymarket/react @polymarket/client
```

## Usage

```tsx
import { createConfig, PolymarketProvider, useMarkets } from '@polymarket/react';

const config = createConfig();

function Root() {
  return (
    <PolymarketProvider config={config}>
      <MarketList />
    </PolymarketProvider>
  );
}

function MarketList() {
  const { data: markets, isLoading } = useMarkets({ closed: false });

  if (isLoading) return <p>Loading…</p>;
  return (
    <ul>
      {markets?.map((market) => (
        <li key={market.id}>{market.question}</li>
      ))}
    </ul>
  );
}
```

See `docs/react-sdk-direction.md` at the repository root for the design direction.

## Development

From the monorepo root:

```bash
pnpm --filter @polymarket/react build
```

## License

MIT

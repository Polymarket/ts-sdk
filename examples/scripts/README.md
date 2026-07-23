# TypeScript Examples

This private workspace package contains runnable TypeScript scripts that demonstrate SDK workflows.

Run an example from the repository root:

```bash
pnpm --filter @polymarket/examples list:markets
pnpm --filter @polymarket/examples fetch:market
pnpm --filter @polymarket/examples pagination
pnpm --filter @polymarket/examples market:prices
pnpm --filter @polymarket/examples search
pnpm --filter @polymarket/examples stream:public
pnpm --filter @polymarket/examples order:create-limit
pnpm --filter @polymarket/examples order:create-market
pnpm --filter @polymarket/examples positions:list
```

Secure client examples use the same environment variables as the integration tests. Copy the root `.env.example` to `.env` and set `POLYMARKET_PRIVATE_KEY` and `POLYMARKET_DEPOSIT_WALLET` before running them.

Typecheck the examples:

```bash
pnpm --filter @polymarket/examples typecheck
```

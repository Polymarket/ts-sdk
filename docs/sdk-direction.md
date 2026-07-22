# SDK Direction

This repository is the home for Polymarket's official TypeScript SDK packages.

## Purpose

The TypeScript SDK should make building on Polymarket simpler, typed, and workflow-oriented. Public packages should organize around developer workflows rather than internal API boundaries.

The SDK should hide internal service boundaries where possible while staying close to real integration needs. Lower-level controls can still be exposed when they support concrete workflows, but the default experience should feel cohesive.

## Current Focus

- Evolve `@polymarket/client` on a stable 0.x release line.
- Support common workflows across market data, trading, account, wallet, and realtime APIs.
- Keep `@polymarket/client` focused on backend, script, and automation workflows.
- Use developer feedback to refine the experience without mirroring internal services directly.

## Design Principles

- Prefer workflow-first APIs over service-shaped APIs.
- Keep public models pragmatic, typed, and consistent.
- Standardize SDK identifier naming on JS/TS-style `...Id` forms such as `orderId`, `tradeId`, `tokenId`, and `marketId`.
- Normalize the CTF position identifier to `tokenId` in the SDK public model, even when upstream services call the same value `assetId`.
- Translate legacy `...ID` and wire-format variants at the service boundary.
- Add lower-level controls only when they support a concrete SDK workflow.

## API Scope Decisions

- Add readonly API key management only if there is a concrete SDK use case and clearer public documentation.
- Add a public server-time action only if clock synchronization becomes necessary for supported SDK workflows.
- Add `simplified-markets`, `sampling-markets`, and `sampling-simplified-markets` market listing variants only when they support a concrete SDK workflow.
- Treat auto-redeem as an ERC-1155 operator approval on the Conditional Tokens position contract. `setupTradingApprovals` includes it for integrators who want a fully ready account.
- Do not add every low-level endpoint just because it exists.

## Wallet Direction

- Existing EOA, Poly Proxy, and Poly Safe wallets must continue to authenticate and trade.
- Deposit Wallet is the current wallet setup direction. Existing EOA, Poly Proxy, and Poly Safe wallets must remain supported.
- A `SecureClient` is architecturally bound to one Polymarket account, identified by the authenticated signer and selected account/funder wallet. The `wallet` option is not a per-action balance lookup address; it is the account wallet used for authentication, balances, order funding, and transaction execution.
- Per-action APIs should not accept alternate wallet or user overrides that would make reads and execution target different accounts. Relayer API keys must match the same authenticated account binding; relayer submission failures for a signer/wallet pair should be treated as account configuration issues, not worked around with action-level wallet overrides.
- `createSecureClient` should treat Proxy-bound and Safe-bound clients as already gasless and preserve the existing wallet binding.
- Do not make wallet migration implicit. Existing wallet-bound clients should remain usable as Deposit Wallet support evolves.

## Package Direction

- `@polymarket/client` is the first package in this TypeScript SDK repository.
- `@polymarket/client` should provide a cohesive TypeScript-first API for backend, script, and automation workflows.
- `@polymarket/types` and `@polymarket/bindings` support SDK packages and are not the main user-facing surface.
- Future work includes `@polymarket/react`, which should build on the same workflow model and provide a higher-level React interface.

## Non-Goals

- Mirror internal service boundaries directly in the public SDK surface.
- Wait for internal platform consolidation before improving developer experience.
- Expose every underlying endpoint as a public SDK action.

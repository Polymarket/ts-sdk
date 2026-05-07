# SDK Direction

This repo is the home for Polymarket's TypeScript SDKs.

The first shipping target is `@polymarket/client`. Its job is to make Polymarket easier to integrate with today, without waiting for full platform consolidation across backend services.

## Current Goal

- Ship the first iteration of `@polymarket/client`.
- Build on top of Polymarket's 4 current API surfaces: CLOB, Gamma, data, and relayer.
- Give consumers one coherent TypeScript interface for common workflows.

## Design Direction

- The public SDK should hide today's service boundaries where possible.
- Package design should follow developer workflows rather than the current internal API split.
- The SDK should feel pragmatic and typed, staying close to real integration needs without forcing consumers to understand how current services are divided.
- The SDK can still expose lower-level controls when they are useful, but the default experience should feel unified.

## Current Decisions

- Omit readonly API key management from the first `@polymarket/client` surface for now.
- Keep phase 2 focused on standard authenticated account reads that are clearly part of the primary trading workflow.
- Revisit readonly API keys later if there is a concrete SDK use case and clearer public documentation.
- Pause a public server-time action until there is clear evidence that clock synchronization is needed for supported SDK workflows.
- Do not add `simplified-markets`, `sampling-markets`, or `sampling-simplified-markets` actions unless a concrete SDK workflow needs those legacy market listing variants.
- Do not add heartbeat actions to `@polymarket/client`; the current heartbeat endpoint is expected to be removed in v2.
- Normalize the CTF position identifier to `tokenId` in the SDK public model, even when upstream services call the same value `assetId`.
- Auto-redeem is an ERC-1155 operator approval on the Conditional Tokens position contract. `setupTradingApprovals` includes it for integrators who want a fully ready account, and `approveAutoRedeem` remains available when consumers need to manage that approval independently.
- Standardize SDK identifier naming on JS/TS-style `...Id` forms such as `orderId`, `tradeId`, `tokenId`, and `marketId`, and translate legacy `...ID` and wire-format variants at the service boundary.

## Wallet Direction

- Existing EOA, Poly Proxy, and Poly Safe wallets must continue to authenticate and trade.
- The next wallet deployment target is the Deposit Wallet. Once introduced, new wallet setup flows should deploy Deposit Wallets rather than the current gasless Safe wallet.
- Treat the current `SecureClient.setupGaslessWallet` naming as transitional. Future public APIs may become `SecureClient.setupDepositWallet` and, if needed, a separate `SecureClient.upgradeDepositWallet` migration path.
- During the transitional period, `SecureClient.setupGaslessWallet` should treat Proxy-bound clients as already gasless and preserve the Proxy binding rather than migrating them to Safe.
- Do not make proxy-to-deposit migration implicit until the migration product behavior is decided. Existing wallet-bound clients should remain usable while migration is introduced over time.

## Package Direction

- `@polymarket/client` is the main near-term package.
- It should provide a cohesive server-side and TypeScript-first integration surface.
- Future work includes `@polymarket/react`, which should build on the same core model but offer a higher-level frontend-oriented interface.

## Non-Goals

- Mirror today's service fragmentation directly in the public SDK surface.
- Make all future SDKs expose the exact same abstraction level.
- Wait for backend consolidation before improving developer experience.

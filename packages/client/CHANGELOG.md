# @polymarket/client

## 0.5.0

### Minor Changes

- fb81779: Add perps auto-cancel (dead man's switch) support. `PerpsSession.armAutoCancel` schedules a signed one-shot cancel-all at a future time (at least 5 seconds ahead), `disarmAutoCancel` clears the schedule without firing, and `fetchAutoCancelStatus` reads the account's auto-cancel status, including the deadline (`null` when unarmed) and daily trigger usage. Arming past the daily trigger limit is rejected with the new `AutoCancelDailyLimitError`.

### Patch Changes

- 93df9d5: Internal refactor: Exchange v3 order construction helpers now live in the exchange module. No behavior change.
- f6d1542: Prevent Perps `placeOrder` from missing private order updates that arrive before the command acknowledgement. High-level placement now generates a client order ID when callers omit it.
- Updated dependencies [fb81779]
- Updated dependencies [4c56d7b]
  - @polymarket/bindings@0.5.0

## 0.4.0

### Minor Changes

- 5a6b56c: Cache market configuration, platform fees, and builder fee rates used to prepare repeated orders. If cached tick metadata rejects a limit or protected price, the SDK fetches current metadata and validates once more before returning the input error. Unprotected market orders now derive price, tick size, and exchange selection from one live order-book response. Order-book tick sizes are normalized to supported numeric values. `maxSpend` is now documented as an estimated all-in spend target based on recently resolved fees rather than a strict cap.

### Patch Changes

- 4911f43: Add Perps session support for adjusting isolated position margin.
- Updated dependencies [2ba6be3]
- Updated dependencies [5a6b56c]
  - @polymarket/bindings@0.4.0

## 0.3.0

### Minor Changes

- 0bb6a4b: Add typed 30-second and 60-second Chainlink TWAP realtime subscriptions.
- 40dc38d: Add Perps account notifications support: `session.listNotifications()` with SDK-owned keyset pagination (including a `sinceSeq` backfill bound pinned across pages), `session.fetchUnreadNotificationsCount()`, `session.markNotificationsRead()` by ids or `upTo` a notification, and the `notifications` session WebSocket channel emitting typed `notification` events.

### Patch Changes

- ca595ec: listActivity now returns all activity types by default, including deposits and withdrawals. The endpoint excludes DEPOSIT and WITHDRAWAL rows unless excludeDepositsWithdrawals=false and strips both values from the type filter, so the SDK now always opts out and the type filter alone decides which rows come back. Previously those rows never appeared, even when requested explicitly.
- 11afc3d: Validate Chainlink TWAP subscription input at the public subscribe boundary.
- dbd6f53: Stop populating `Page.totalCount` from the per-response `count` on cursor-paginated endpoints (open orders, account trades, earnings, builder lists). That value was the current page's item count, not a total across all pages.
- 5c56abd: RequestRejectedError and RateLimitError now expose retryAfter, populated from the Retry-After response header, so callers can honor server-provided backoff.
- 2f02252: Deposit-wallet gasless and collateral-return submits now self-heal nonce mismatches: when the relayer rejects a batch with the on-chain nonce in the error, the batch is re-signed with that nonce and resubmitted once.
- c092352: Migrate Perps fills pagination to the API-native cursor and add a fills time sort direction option.
- 4ddf659: Expose the granular Combos RFQ quote-validation error codes.
- Updated dependencies [0bb6a4b]
- Updated dependencies [28813f6]
- Updated dependencies [7463938]
- Updated dependencies [40dc38d]
- Updated dependencies [c092352]
- Updated dependencies [4ddf659]
  - @polymarket/bindings@0.3.0

## 0.3.0-beta.1

### Minor Changes

- 40dc38d: Add Perps account notifications support: `session.listNotifications()` with SDK-owned keyset pagination (including a `sinceSeq` backfill bound pinned across pages), `session.fetchUnreadNotificationsCount()`, `session.markNotificationsRead()` by ids or `upTo` a notification, and the `notifications` session WebSocket channel emitting typed `notification` events.

### Patch Changes

- 2f02252: Deposit-wallet gasless and collateral-return submits now self-heal nonce mismatches: when the relayer rejects a batch with the on-chain nonce in the error, the batch is re-signed with that nonce and resubmitted once.
- c092352: Migrate Perps fills pagination to the API-native cursor and add a fills time sort direction option.
- Updated dependencies [40dc38d]
- Updated dependencies [c092352]
  - @polymarket/bindings@0.3.0-beta.1

## 0.3.0-beta.0

### Minor Changes

- 0bb6a4b: Add typed 30-second and 60-second Chainlink TWAP realtime subscriptions.

### Patch Changes

- dbd6f53: Stop populating `Page.totalCount` from the per-response `count` on cursor-paginated endpoints (open orders, account trades, earnings, builder lists). That value was the current page's item count, not a total across all pages.
- 5c56abd: RequestRejectedError and RateLimitError now expose retryAfter, populated from the Retry-After response header, so callers can honor server-provided backoff.
- 4ddf659: Expose the granular Combos RFQ quote-validation error codes.
- Updated dependencies [0bb6a4b]
- Updated dependencies [28813f6]
- Updated dependencies [7463938]
- Updated dependencies [4ddf659]
  - @polymarket/bindings@0.3.0-beta.0

## 0.2.0

### Minor Changes

- e3aafe4: Add `isolatedOnly` to `PerpsInstrument`, indicating whether the instrument supports only isolated margin.
- 3ae2f13: Add `client.waitForOrderFillSettlement(order)`, which waits until every fill listed in an order response reaches a terminal settlement outcome and returns the settlement transaction hashes. Matched order responses are no longer guaranteed to include `transactionsHashes`; use this method to obtain hashes reliably. `ClobTrade.status` is now typed as the shared `TradeStatus` enum instead of a bare string.

### Patch Changes

- dd8733f: Add Collateral Return plan/execute support: `planCollateralReturn` returns an inspectable plan and `executeCollateralReturnPlan` signs and submits the plan's exact Router call for Deposit Wallet, Safe, and Proxy accounts, returning a transaction handle.
- 04ed7b2: Fix offset-paginated list methods silently stopping after the first page when `pageSize` reached the server's limit cap.

  - `pageSize` is now validated per endpoint and rejects values above the cap with `UserInputError`: 500 for `listPositions`, `listActivity`, `listMarketPositions`; 100 for `listTags`, `listComments`, `listCommentsByUserAddress`, `listTeams`, `listMarketClarifications`; 50 for `listClosedPositions`, `listBuilderLeaderboard`, `listTraderLeaderboard`, `listSeries`; 10,000 for `listTrades`.
  - Requests fetch exactly `pageSize` rows instead of probing with `pageSize + 1`. A full page reports `hasMore: true`; when a collection ends exactly on a page boundary, the final page is empty.

- 9b13de2: Accept withdrawal statuses introduced after a client release instead of failing the response parse. Known statuses now live in the `PerpsKnownWithdrawalStatus` enum, which adds the `failed` status the withdrawal contract already includes, and `PerpsWithdrawalStatus` is widened so unrecognized statuses flow through as plain strings.
- e628321: Reject limit and protected market order prices that are not a multiple of the market tick size. Previously, prices within the tick's decimal allowance but off the tick grid (for example `0.007` on a `0.005` tick market) passed client-side validation and were rejected by the exchange after signing.
- Updated dependencies [dd8733f]
- Updated dependencies [e3aafe4]
- Updated dependencies [d29c369]
- Updated dependencies [9b13de2]
- Updated dependencies [3ae2f13]
  - @polymarket/bindings@0.2.0

## 0.1.0

### Minor Changes

- 7c76b5a: Add confirmed combo trade broadcasts to RFQ quoter sessions.
- 15597df: Bootstrap beta prerelease publishing.
- de391df: Graduate the SDK to the stable 0.x release line, mark Perps APIs as experimental, and remove deprecated compatibility APIs.
- 1903b61: Expose `parentEventId` on `Event` so child events such as sports "more markets" events link back to their parent event. The value is normalized to the same `EventId` type as `Event.id`.
- 9b0e018: Add reduce-only support for normal Perps orders.
- b20773a: Add Perps SDK support with public market data reads/subscriptions, credential-backed private sessions, account reads, trading commands, approvals, deposits, withdrawals, and Perps bindings.

### Patch Changes

- 369cd11: Default `createSecureClient` to the signer's current deterministic Deposit Wallet when no wallet is provided, deploying it when needed while preserving explicit EOA and existing wallet behavior.
- 369cd11: Make `setupTradingApprovals` idempotent by checking existing ERC-20 allowances and ERC-1155 operator approvals before submitting transactions. The method now waits internally and returns a deprecated compatibility handle for callers that still call `wait()`.
- 77fdb6e: Document order book level ordering and custom market subscription events.
- dccac9d: Add a `conditionId` alias to the CLOB order book, open order, trade, and builder trade shapes, carrying the same value as `market`, and mark `market` deprecated. `market` on these types holds a CTF condition id; `conditionId` names it consistently with the rest of the SDK. Additive and non-breaking: both fields are emitted.
- 2e091ef: Support CLOB order tick sizes `0.005` and `0.0025`.
- 7649a5e: Parse Combo lifecycle activity from the canonical API `type` field instead of the legacy `side` verb.
- 9233e69: Add Combo activity pagination with normalized activity types, server-cursor Combo position pagination, Combo position sync request fields, and Combo position outcome/redeemable fields.
- b2e487f: Normalize Combo data field names to use wallet, amount, and payout consistently with the existing activity and portfolio surfaces, and brand Combo activity row IDs.
- 84335f8: Add `listComboMarkets` for fetching Combo market catalog entries with typed response bindings and SDK-owned pagination.
- d134853: Add support for redeeming full combo position balances by position ID.
- b982460: Add `RESOLVED_PARTIAL` to `ComboPositionStatus`. The data API emits this terminal status for combo positions that fully resolve at a fractional on-chain payout (e.g. a voided/50-50 leg). Without it, the zod schema rejected the response and combo-positions parsing failed.
- 6516128: Add support for splitting and merging combo positions by legs, including `amount: 'max'` for combo merge.
- ebd7b86: Point Combos RFQ endpoints at the new production domains: `combos-rfq-api.polymarket.com` (REST) and `combos-rfq-gateway-quoter.polymarket.com` (quoter WebSocket).
- 02ad8fa: Add distinct CTF and combo condition ID brands, keeping the previous condition ID exports as deprecated CTF aliases.
- 638bcc9: Default new Perps sessions to a one-week credential expiry when no custom `expiresIn` is provided.
- b03e211: Map unknown builder fee responses to `UserInputError`.
- d00d70f: Accept copied `/event/{slug}` market URLs when fetching markets by URL.
- c188742: Default `listEvents` to open events when `closed` is omitted.
- 04bbc46: Align wallet action error unions with gasless transaction failure paths for non-EOA accounts.
- 3b9ef1d: Handle legacy multi-outcome markets in market responses. `listMarkets` now omits markets that cannot be represented by the binary `Market` model instead of aborting the whole page, and `fetchMarket` fails with a typed `UnexpectedResponseError` instead of a raw `TypeError`.
- 72dbe7b: Normalize empty-string decimal fields from order and trade responses: order `makingAmount`/`takingAmount` map `""` to `"0"`, and maker order `feeRateBps` maps `""` to `null`, matching py-sdk behavior.
- ba70f93: Surface missing trade and position market icons as null instead of an empty string.
- a2688db: Add `maxPrice` and `minPrice` protection fields to market order requests.
- 6082a3e: Make pagination request cursor inputs infer the branded pagination cursor type.
- 1182ebb: Improve the Perps public SDK surface with explicit request types, root exports, and TSDoc examples.
- d230d3a: Preserve `groupItemTitle` on normalized market responses.
- 700acc9: Publish `expectPrivateKey` from `@polymarket/types` and republish the client against the corrected types package.
- e8c3230: Export `PriceHistoryInterval` from `@polymarket/client`.
- d731b5b: Add `listMarketClarifications` for reading market clarification text, with SDK-owned offset pagination and market/event/state/question/tx filters.
- 8790a22: Normalize empty-string optional decimal fields on streamed market and trade events to null (for example a trade's `feeRateBps` and a price change's `bestBid`/`bestAsk`), so consumers never receive `''` where a decimal string or null is expected.
- e8abc2a: Return branded decimal string types from CLOB price read helpers instead of widening validated decimal strings to plain strings.
- ea844f3: Strengthen CLOB batch price read result types so midpoint, price, and spread lookups are keyed by `TokenId`. `fetchPrices` now returns partial `OrderSide` records containing decimal strings, while `fetchMidpoints` and `fetchSpreads` return token ID keyed decimal strings.
- 66fb8a8: Drop unknown WebSocket frames without closing the connection. Frames that fail to parse — new frame types, malformed known frames, or known frames carrying values the SDK does not model — are silently discarded on every stream, and subsequent events keep flowing. In particular, the RFQ quoter session no longer fails with `TransportError` on an unrecognized or unreadable frame: the frame is dropped, the session stays open, and a caller waiting on an unreadable acknowledgement fails through its acknowledgement timeout. Well-formed but uncorrelated RFQ errors still fail the session.
- e60eefc: Type CLOB cancellation results with a branded `OrderId`. `CancelOrdersResponse` now exposes `canceled` as `OrderId[]` and keys `notCanceled` by `OrderId` across `cancelOrder`, `cancelOrders`, `cancelMarketOrders`, and `cancelAll`. Runtime values and wire shapes are unchanged; the new `OrderId` type, `toOrderId`, and `OrderIdSchema` are exported from `@polymarket/bindings`.
- 0f25328: Remove the unreleased `QUOTE_VALIDATION_TIMEOUT_INTERNAL` member from `RfqKnownErrorCode`. The gateway now reports quote-validation timeouts as `SERVICE_UNAVAILABLE`; gateways still emitting the internal code during rollout flow through the open `RfqErrorCode` type as plain strings.
- 55d0ecf: Allow GTD limit order expirations exactly 60 seconds in the future and document using an additional latency buffer.
- c6e0285: Parse RFQ quote rejections that use the `SUBMISSION_WINDOW_CLOSED` gateway error code.
- 6e0f923: Add repository metadata required for npm trusted publishing provenance validation.
- 3d4b073: Require GTD limit order expirations to be at least 3 minutes in the future.
- d1fcc5f: Harden RFQ quoter WebSocket handling for unknown and malformed inbound frames.
- 3bbdb26: Restore account trade listing to the legacy endpoint and parse legacy epoch-seconds timestamps correctly.
- f5fa4fd: Clean up Deposit Wallet deployment after the beacon factory upgrade by preserving deployed legacy UUPS wallets and defaulting new deployments to beacon wallets.
- 766d709: Fix legacy Proxy wallet gasless execution and add live Safe and Proxy wallet coverage.
- e7a8858: Drop unsupported tag/series request params and response fields, and normalize related tag id fields to camelCase.
- 6516128: Add `listComboPositions` for fetching combo positions with typed response bindings and SDK-owned pagination.
- b0181de: Mark public action entry point helpers as low-level functions and point consumers to client instance APIs.
- 0dc6339: Declare Node.js 24 as the minimum supported runtime for published SDK packages.
- d8f3aed: Align Perps session account pagination cursor decode failures with the rest of the SDK by throwing `UserInputError`.
- 4c7ac45: Add `session.fetchStats()` for Perps account stats.
- cf34be0: Add Perps session support for cancelling all open orders.
- 81114f9: Normalize Perps trading commands to match the rest of the SDK: place and modify orders now use `OrderSide`, place, modify, and cancel return per-item acknowledgement unions, and leverage and margin updates return `void` while throwing `RequestRejectedError` when rejected. Clean up the `PerpsInstrument` type, including a typed `PerpsFundingInterval` string format.
- 0f8cb2b: Fix Perps session command signing to match backend MessagePack hashes and surface top-level WebSocket error acknowledgements as request rejections.
- 1f27825: Remove Perps modify order methods from the session API, rename Perps cancel order return types from acknowledgements to results, and stop exporting raw response schema names from Perps and CLOB bindings.
- 578890d: Remove the degenerate `instrumentType` filter from `fetchPerpsInstruments` requests.
- d28b989: Remove unsupported Perps margin updates and return the leverage update result.
- e2ce4f9: Tighten Perps order request input types and validation for time-in-force-specific price and post-only constraints.
- 91c9e63: Normalize Perps order reads to expose `side: OrderSide` instead of upstream `buy`.
- fc9d5c7: Make Perps session `placeOrder` wait for the first matching orders update, rename ack-only batch placement to `postOrders`, normalize Perps order entity ids as `id`, and type order statuses with `PerpsOrderStatus`.
- b434b43: Support Perps fills frames containing a list of fills.
- 5708113: Forward repeated Perps balance and portfolio ticks instead of deduplicating unchanged payloads.
- a282c35: Add Perps TP/SL order metadata, lifecycle events, unified `placeOrder` TP/SL placement, and `placePositionTpSl` with position-side inference. Remove unsupported Perps margin updates and return the leverage update result.
- 1e707cd: Support Perps trades frames containing a list of trades.
- 9ac8027: Update the production RFQ quoter WebSocket URL.
- e1e5808: Add maker-side RFQ WebSocket support.
- 3a8d59a: chore: configure packages for public beta release.
- 5b81c3d: Resolve closed markets when preparing market position redemptions.
- e8584aa: Remove the retired CLOB v1 Neg Risk Adapter from `setupTradingApprovals` and `prepareTradingApprovals`. The setup flow no longer grants a MAX collateral allowance or ERC-1155 approval-for-all to the retired adapter; all current exchanges, collateral adapters, and the auto-redeem operator remain approved.
- aeec7ff: Clear cached RFQ quoter sessions immediately after unexpected websocket disconnects.
- 90e76a4: Support new Combos RFQ websocket error codes for balance, allowance, and pre-execution reservation failures.
- 30aef9d: Expose RFQ error identifiers and signature-validation error codes to quoter clients.
- 14d50f2: Update the RFQ quoter WebSocket URL.
- b57a13a: Define RFQ quoter WebSocket behavior for uncorrelated error frames.
- e41ec20: Retry rejected JSON-RPC `eth_call` batches by recursively splitting them into smaller batches.
- 9a1f0e5: Reject whitespace-only search queries and trim leading or trailing search input.
- d37bde4: Add a typed `SearchSort` enum for supported search sort fields and reject unsupported search sort values.
- 11818ef: Omit market filters from broad user websocket subscriptions so all-market streams receive trade events.
- feead94: Model activity trades as an `isCombo`-discriminated union so Combo trade activity rows parse without binary market metadata.
- d045298: Allow activity market icons to be null when the Data API returns sparse historical rows without an icon URL.
- 50d56ce: Harden RFQ quoter sessions:

  - Unknown error codes no longer fail the session; they flow through as plain strings via the now-open `RfqErrorCode` type (known codes moved to `RfqKnownErrorCode`).
  - Unsolicited connection loss now fails in-flight operations and the session iterator with the new `ConnectionLostError`, carrying the close `code` and `reason`.

- c056ec6: Wait for gasless relayer transactions to reach confirmed state before resolving transaction handles.
- d144ca9: chore: empty changeset to test new release workflow
- 2067f38: Allow `createSecureClient` authentication to accept an explicit `nonce: 0`, matching the documented default nonce behavior.
- Updated dependencies [7c76b5a]
- Updated dependencies [77fdb6e]
- Updated dependencies [dccac9d]
- Updated dependencies [2e091ef]
- Updated dependencies [7649a5e]
- Updated dependencies [9233e69]
- Updated dependencies [b2e487f]
- Updated dependencies [84335f8]
- Updated dependencies [b982460]
- Updated dependencies [02ad8fa]
- Updated dependencies [15597df]
- Updated dependencies [3b9ef1d]
- Updated dependencies [72dbe7b]
- Updated dependencies [ba70f93]
- Updated dependencies [6082a3e]
- Updated dependencies [d230d3a]
- Updated dependencies [700acc9]
- Updated dependencies [d731b5b]
- Updated dependencies [8790a22]
- Updated dependencies [ea844f3]
- Updated dependencies [7633fad]
- Updated dependencies [de391df]
- Updated dependencies [e60eefc]
- Updated dependencies [0f25328]
- Updated dependencies [1903b61]
- Updated dependencies [c6e0285]
- Updated dependencies [6e0f923]
- Updated dependencies [3bbdb26]
- Updated dependencies [e7a8858]
- Updated dependencies [6516128]
- Updated dependencies [0dc6339]
- Updated dependencies [4c7ac45]
- Updated dependencies [cf34be0]
- Updated dependencies [81114f9]
- Updated dependencies [330af57]
- Updated dependencies [1f27825]
- Updated dependencies [d28b989]
- Updated dependencies [e2ce4f9]
- Updated dependencies [91c9e63]
- Updated dependencies [7f7eefe]
- Updated dependencies [b20773a]
- Updated dependencies [b434b43]
- Updated dependencies [a282c35]
- Updated dependencies [1e707cd]
- Updated dependencies [e1e5808]
- Updated dependencies [3a8d59a]
- Updated dependencies [0809105]
- Updated dependencies [90e76a4]
- Updated dependencies [feead94]
- Updated dependencies [d045298]
- Updated dependencies [50d56ce]
- Updated dependencies [d144ca9]
  - @polymarket/bindings@0.1.0
  - @polymarket/types@0.1.0

## 0.1.0-beta.18

### Patch Changes

- 66fb8a8: Drop unknown WebSocket frames without closing the connection. Frames that fail to parse — new frame types, malformed known frames, or known frames carrying values the SDK does not model — are silently discarded on every stream, and subsequent events keep flowing. In particular, the RFQ quoter session no longer fails with `TransportError` on an unrecognized or unreadable frame: the frame is dropped, the session stays open, and a caller waiting on an unreadable acknowledgement fails through its acknowledgement timeout. Well-formed but uncorrelated RFQ errors still fail the session.
- e8584aa: Remove the retired CLOB v1 Neg Risk Adapter from `setupTradingApprovals` and `prepareTradingApprovals`. The setup flow no longer grants a MAX collateral allowance or ERC-1155 approval-for-all to the retired adapter; all current exchanges, collateral adapters, and the auto-redeem operator remain approved.
- Updated dependencies [7633fad]
  - @polymarket/bindings@0.1.0-beta.16

## 0.1.0-beta.17

### Patch Changes

- 8790a22: Normalize empty-string optional decimal fields on streamed market and trade events to null (for example a trade's `feeRateBps` and a price change's `bestBid`/`bestAsk`), so consumers never receive `''` where a decimal string or null is expected.
- e8abc2a: Return branded decimal string types from CLOB price read helpers instead of widening validated decimal strings to plain strings.
- ea844f3: Strengthen CLOB batch price read result types so midpoint, price, and spread lookups are keyed by `TokenId`. `fetchPrices` now returns partial `OrderSide` records containing decimal strings, while `fetchMidpoints` and `fetchSpreads` return token ID keyed decimal strings.
- 0f25328: Remove the unreleased `QUOTE_VALIDATION_TIMEOUT_INTERNAL` member from `RfqKnownErrorCode`. The gateway now reports quote-validation timeouts as `SERVICE_UNAVAILABLE`; gateways still emitting the internal code during rollout flow through the open `RfqErrorCode` type as plain strings.
- b434b43: Support Perps fills frames containing a list of fills.
- 1e707cd: Support Perps trades frames containing a list of trades.
- 50d56ce: Harden RFQ quoter sessions:

  - Unknown error codes no longer fail the session; they flow through as plain strings via the now-open `RfqErrorCode` type (known codes moved to `RfqKnownErrorCode`).
  - Unsolicited connection loss now fails in-flight operations and the session iterator with the new `ConnectionLostError`, carrying the close `code` and `reason`.

- Updated dependencies [8790a22]
- Updated dependencies [ea844f3]
- Updated dependencies [0f25328]
- Updated dependencies [b434b43]
- Updated dependencies [1e707cd]
- Updated dependencies [50d56ce]
  - @polymarket/bindings@0.1.0-beta.15

## 0.1.0-beta.16

### Patch Changes

- b982460: Add `RESOLVED_PARTIAL` to `ComboPositionStatus`. The data API emits this terminal status for combo positions that fully resolve at a fractional on-chain payout (e.g. a voided/50-50 leg). Without it, the zod schema rejected the response and combo-positions parsing failed.
- Updated dependencies [b982460]
  - @polymarket/bindings@0.1.0-beta.14

## 0.1.0-beta.15

### Patch Changes

- 7649a5e: Parse Combo lifecycle activity from the canonical API `type` field instead of the legacy `side` verb.
- Updated dependencies [7649a5e]
  - @polymarket/bindings@0.1.0-beta.13

## 0.1.0-beta.14

### Patch Changes

- 9233e69: Add Combo activity pagination with normalized activity types, server-cursor Combo position pagination, Combo position sync request fields, and Combo position outcome/redeemable fields.
- b2e487f: Normalize Combo data field names to use wallet, amount, and payout consistently with the existing activity and portfolio surfaces, and brand Combo activity row IDs.
- Updated dependencies [9233e69]
- Updated dependencies [b2e487f]
  - @polymarket/bindings@0.1.0-beta.12

## 0.1.0-beta.13

### Minor Changes

- 9b0e018: Add reduce-only support for normal Perps orders.

### Patch Changes

- 1182ebb: Improve the Perps public SDK surface with explicit request types, root exports, and TSDoc examples.
- d731b5b: Add `listMarketClarifications` for reading market clarification text, with SDK-owned offset pagination and market/event/state/question/tx filters.
- 766d709: Fix legacy Proxy wallet gasless execution and add live Safe and Proxy wallet coverage.
- d8f3aed: Align Perps session account pagination cursor decode failures with the rest of the SDK by throwing `UserInputError`.
- cf34be0: Add Perps session support for cancelling all open orders.
- 578890d: Remove the degenerate `instrumentType` filter from `fetchPerpsInstruments` requests.
- 5b81c3d: Resolve closed markets when preparing market position redemptions.
- c056ec6: Wait for gasless relayer transactions to reach confirmed state before resolving transaction handles.
- Updated dependencies [d731b5b]
- Updated dependencies [cf34be0]
  - @polymarket/bindings@0.1.0-beta.11

## 0.1.0-beta.12

### Patch Changes

- 3d4b073: Require GTD limit order expirations to be at least 3 minutes in the future.
- 4c7ac45: Add `session.fetchStats()` for Perps account stats.
- a282c35: Add Perps TP/SL order metadata, lifecycle events, unified `placeOrder` TP/SL placement, and `placePositionTpSl` with position-side inference. Remove unsupported Perps margin updates and return the leverage update result.
- Updated dependencies [4c7ac45]
- Updated dependencies [a282c35]
  - @polymarket/bindings@0.1.0-beta.10

## 0.1.0-beta.11

### Patch Changes

- 2e091ef: Support CLOB order tick sizes `0.005` and `0.0025`.
- 6082a3e: Make pagination request cursor inputs infer the branded pagination cursor type.
- d28b989: Remove unsupported Perps margin updates and return the leverage update result.
- 91c9e63: Normalize Perps order reads to expose `side: OrderSide` instead of upstream `buy`.
- Updated dependencies [2e091ef]
- Updated dependencies [6082a3e]
- Updated dependencies [d28b989]
- Updated dependencies [91c9e63]
  - @polymarket/bindings@0.1.0-beta.9

## 0.1.0-beta.10

### Patch Changes

- f5fa4fd: Clean up Deposit Wallet deployment after the beacon factory upgrade by preserving deployed legacy UUPS wallets and defaulting new deployments to beacon wallets.

## 0.1.0-beta.9

### Patch Changes

- 638bcc9: Default new Perps sessions to a one-week credential expiry when no custom `expiresIn` is provided.
- d230d3a: Preserve `groupItemTitle` on normalized market responses.
- 700acc9: Publish `expectPrivateKey` from `@polymarket/types` and republish the client against the corrected types package.
- e8c3230: Export `PriceHistoryInterval` from `@polymarket/client`.
- 81114f9: Normalize Perps trading commands to match the rest of the SDK: place and modify orders now use `OrderSide`, place, modify, and cancel return per-item acknowledgement unions, and leverage and margin updates return `void` while throwing `RequestRejectedError` when rejected. Clean up the `PerpsInstrument` type, including a typed `PerpsFundingInterval` string format.
- 0f8cb2b: Fix Perps session command signing to match backend MessagePack hashes and surface top-level WebSocket error acknowledgements as request rejections.
- 1f27825: Remove Perps modify order methods from the session API, rename Perps cancel order return types from acknowledgements to results, and stop exporting raw response schema names from Perps and CLOB bindings.
- e2ce4f9: Tighten Perps order request input types and validation for time-in-force-specific price and post-only constraints.
- fc9d5c7: Make Perps session `placeOrder` wait for the first matching orders update, rename ack-only batch placement to `postOrders`, normalize Perps order entity ids as `id`, and type order statuses with `PerpsOrderStatus`.
- 5708113: Forward repeated Perps balance and portfolio ticks instead of deduplicating unchanged payloads.
- d37bde4: Add a typed `SearchSort` enum for supported search sort fields and reject unsupported search sort values.
- Updated dependencies [d230d3a]
- Updated dependencies [700acc9]
- Updated dependencies [81114f9]
- Updated dependencies [1f27825]
- Updated dependencies [e2ce4f9]
- Updated dependencies [7f7eefe]
  - @polymarket/bindings@0.1.0-beta.8
  - @polymarket/types@0.1.0-beta.4

## 0.1.0-beta.8

### Minor Changes

- 7c76b5a: Add confirmed combo trade broadcasts to RFQ quoter sessions.
- b20773a: Add Perps SDK support with public market data reads/subscriptions, credential-backed private sessions, account reads, trading commands, approvals, deposits, withdrawals, and Perps bindings.

### Patch Changes

- 30aef9d: Expose RFQ error identifiers and signature-validation error codes to quoter clients.
- Updated dependencies [7c76b5a]
- Updated dependencies [330af57]
- Updated dependencies [b20773a]
  - @polymarket/bindings@0.1.0-beta.7

## 0.1.0-beta.7

### Minor Changes

- 1903b61: Expose `parentEventId` on `Event` so child events such as sports "more markets" events link back to their parent event. The value is normalized to the same `EventId` type as `Event.id`.

### Patch Changes

- 3b9ef1d: Handle legacy multi-outcome markets in market responses. `listMarkets` now omits markets that cannot be represented by the binary `Market` model instead of aborting the whole page, and `fetchMarket` fails with a typed `UnexpectedResponseError` instead of a raw `TypeError`.
- 72dbe7b: Normalize empty-string decimal fields from order and trade responses: order `makingAmount`/`takingAmount` map `""` to `"0"`, and maker order `feeRateBps` maps `""` to `null`, matching py-sdk behavior.
- ba70f93: Surface missing trade and position market icons as null instead of an empty string.
- a2688db: Add `maxPrice` and `minPrice` protection fields to market order requests.
- 90e76a4: Support new Combos RFQ websocket error codes for balance, allowance, and pre-execution reservation failures.
- e41ec20: Retry rejected JSON-RPC `eth_call` batches by recursively splitting them into smaller batches.
- 11818ef: Omit market filters from broad user websocket subscriptions so all-market streams receive trade events.
- feead94: Model activity trades as an `isCombo`-discriminated union so Combo trade activity rows parse without binary market metadata.
- Updated dependencies [3b9ef1d]
- Updated dependencies [72dbe7b]
- Updated dependencies [ba70f93]
- Updated dependencies [1903b61]
- Updated dependencies [90e76a4]
- Updated dependencies [feead94]
  - @polymarket/bindings@0.1.0-beta.6

## 0.1.0-beta.6

### Patch Changes

- ebd7b86: Point Combos RFQ endpoints at the new production domains: `combos-rfq-api.polymarket.com` (REST) and `combos-rfq-gateway-quoter.polymarket.com` (quoter WebSocket).

## 0.1.0-beta.5

### Patch Changes

- 84335f8: Add `listComboMarkets` for fetching Combo market catalog entries with typed response bindings and SDK-owned pagination.
- c6e0285: Parse RFQ quote rejections that use the `SUBMISSION_WINDOW_CLOSED` gateway error code.
- Updated dependencies [84335f8]
- Updated dependencies [c6e0285]
  - @polymarket/bindings@0.1.0-beta.5

## 0.1.0-beta.4

### Patch Changes

- 02ad8fa: Add distinct CTF and combo condition ID brands, keeping the previous condition ID exports as deprecated CTF aliases.
- 9ac8027: Update the production RFQ quoter WebSocket URL.
- 9a1f0e5: Reject whitespace-only search queries and trim leading or trailing search input.
- Updated dependencies [02ad8fa]
- Updated dependencies [0809105]
  - @polymarket/bindings@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- 369cd11: Default `createSecureClient` to the authenticated signer's current deterministic Deposit Wallet when no wallet is provided. The client now derives the current Deposit Wallet at runtime, deploys it when needed, and preserves explicit EOA and existing wallet behavior.
- 369cd11: Make `setupTradingApprovals` idempotent by checking existing ERC-20 allowances and ERC-1155 operator approvals before submitting transactions. The method now waits internally and returns a deprecated compatibility handle for callers that still call `wait()`.
- 77fdb6e: Document order book level ordering and custom market subscription events.
- d134853: Add support for redeeming full combo position balances by position ID.
- 6516128: Add support for splitting and merging combo positions by legs, including `amount: 'max'` for combo merge.
- b03e211: Map unknown builder fee responses to `UserInputError`.
- d00d70f: Accept copied `/event/{slug}` market URLs when fetching markets by URL.
- c188742: Default `listEvents` to open events when `closed` is omitted.
- 04bbc46: Align wallet action error unions with gasless transaction failure paths for non-EOA accounts.
- 55d0ecf: Allow GTD limit order expirations exactly 60 seconds in the future and document using an additional latency buffer.
- 6e0f923: Add repository metadata required for npm trusted publishing provenance validation.
- d1fcc5f: Harden RFQ quoter WebSocket handling for unknown and malformed inbound frames.
- 3bbdb26: Restore account trade listing to the legacy endpoint and parse legacy epoch-seconds timestamps correctly.
- e7a8858: Drop unsupported tag/series request params and response fields, and normalize related tag id fields to camelCase.
- 6516128: Add `listComboPositions` for fetching combo positions with typed response bindings and SDK-owned pagination.
- b0181de: Mark public action entry point helpers as low-level functions and point consumers to client instance APIs.
- 0dc6339: Declare Node.js 24 as the minimum supported runtime for published SDK packages.
- e1e5808: Add maker-side RFQ WebSocket support.
- aeec7ff: Clear cached RFQ quoter sessions immediately after unexpected websocket disconnects.
- 14d50f2: Update the RFQ quoter WebSocket URL.
- b57a13a: Define RFQ quoter WebSocket behavior for uncorrelated error frames.
- d045298: Allow activity market icons to be null when the Data API returns sparse historical rows without an icon URL.
- 2067f38: Allow `createSecureClient` authentication to accept an explicit `nonce: 0`, matching the documented default nonce behavior.
- Updated dependencies [77fdb6e]
- Updated dependencies [6e0f923]
- Updated dependencies [3bbdb26]
- Updated dependencies [e7a8858]
- Updated dependencies [6516128]
- Updated dependencies [0dc6339]
- Updated dependencies [e1e5808]
- Updated dependencies [d045298]
  - @polymarket/bindings@0.1.0-beta.3
  - @polymarket/types@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- 3a8d59a: chore: configure packages for public beta release.
- Updated dependencies [3a8d59a]
  - @polymarket/bindings@0.1.0-beta.2
  - @polymarket/types@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- d144ca9: chore: empty changeset to test new release workflow
- Updated dependencies [d144ca9]
  - @polymarket/bindings@0.1.0-beta.1
  - @polymarket/types@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 15597df: Bootstrap beta prerelease publishing.

### Patch Changes

- Updated dependencies [15597df]
  - @polymarket/bindings@0.1.0-beta.0
  - @polymarket/types@0.1.0-beta.0

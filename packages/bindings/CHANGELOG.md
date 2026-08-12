# @polymarket/bindings

## 0.5.0

### Minor Changes

- fb81779: Add perps auto-cancel (dead man's switch) support. `PerpsSession.armAutoCancel` schedules a signed one-shot cancel-all at a future time (at least 5 seconds ahead), `disarmAutoCancel` clears the schedule without firing, and `fetchAutoCancelStatus` reads the account's auto-cancel status, including the deadline (`null` when unarmed) and daily trigger usage. Arming past the daily trigger limit is rejected with the new `AutoCancelDailyLimitError`.

### Patch Changes

- 4c56d7b: Add a required `id` on Perps account funding payment records, matching the unique funding-record id the platform now returns on funding history and the realtime funding stream. The id is exposed as the branded `PerpsFundingPaymentId` type.

## 0.4.0

### Minor Changes

- 5a6b56c: Cache market configuration, platform fees, and builder fee rates used to prepare repeated orders. If cached tick metadata rejects a limit or protected price, the SDK fetches current metadata and validates once more before returning the input error. Unprotected market orders now derive price, tick size, and exchange selection from one live order-book response. Order-book tick sizes are normalized to supported numeric values. `maxSpend` is now documented as an estimated all-in spend target based on recently resolved fees rather than a strict cap.

### Patch Changes

- 2ba6be3: Type accepted order response IDs as `OrderId`.

## 0.3.0

### Minor Changes

- 0bb6a4b: Add typed 30-second and 60-second Chainlink TWAP realtime subscriptions.
- 40dc38d: Add Perps account notifications support: `session.listNotifications()` with SDK-owned keyset pagination (including a `sinceSeq` backfill bound pinned across pages), `session.fetchUnreadNotificationsCount()`, `session.markNotificationsRead()` by ids or `upTo` a notification, and the `notifications` session WebSocket channel emitting typed `notification` events.

### Patch Changes

- 28813f6: Add the DEPOSIT, WITHDRAWAL, and TAKER_REBATE activity types to the ActivityType enum, model them as typed account-level activities, and parse them in ActivitySchema so activity responses containing these rows no longer fail validation.
- 7463938: Open order `createdAt` and `expiresAt` now parse epoch-seconds wire timestamps correctly instead of treating them as milliseconds.
- c092352: Migrate Perps fills pagination to the API-native cursor and add a fills time sort direction option.
- 4ddf659: Expose the granular Combos RFQ quote-validation error codes.

## 0.3.0-beta.1

### Minor Changes

- 40dc38d: Add Perps account notifications support: `session.listNotifications()` with SDK-owned keyset pagination (including a `sinceSeq` backfill bound pinned across pages), `session.fetchUnreadNotificationsCount()`, `session.markNotificationsRead()` by ids or `upTo` a notification, and the `notifications` session WebSocket channel emitting typed `notification` events.

### Patch Changes

- c092352: Migrate Perps fills pagination to the API-native cursor and add a fills time sort direction option.

## 0.3.0-beta.0

### Minor Changes

- 0bb6a4b: Add typed 30-second and 60-second Chainlink TWAP realtime subscriptions.

### Patch Changes

- 28813f6: Add the DEPOSIT, WITHDRAWAL, and TAKER_REBATE activity types to the ActivityType enum, model them as typed account-level activities, and parse them in ActivitySchema so activity responses containing these rows no longer fail validation.
- 7463938: Open order `createdAt` and `expiresAt` now parse epoch-seconds wire timestamps correctly instead of treating them as milliseconds.
- 4ddf659: Expose the granular Combos RFQ quote-validation error codes.

## 0.2.0

### Minor Changes

- e3aafe4: Add `isolatedOnly` to `PerpsInstrument`, indicating whether the instrument supports only isolated margin.
- 3ae2f13: Add `client.waitForOrderFillSettlement(order)`, which waits until every fill listed in an order response reaches a terminal settlement outcome and returns the settlement transaction hashes. Matched order responses are no longer guaranteed to include `transactionsHashes`; use this method to obtain hashes reliably. `ClobTrade.status` is now typed as the shared `TradeStatus` enum instead of a bare string.

### Patch Changes

- dd8733f: Add Collateral Return plan/execute support: `planCollateralReturn` returns an inspectable plan and `executeCollateralReturnPlan` signs and submits the plan's exact Router call for Deposit Wallet, Safe, and Proxy accounts, returning a transaction handle.
- d29c369: Add `PerpsFeeTier` and a required `tiers` array on `PerpsFeeScheduleEntry`, matching the volume-based fee tiers (including negative maker rebate rates) in the updated `GET /v1/info/fees` contract.
- 9b13de2: Accept withdrawal statuses introduced after a client release instead of failing the response parse. Known statuses now live in the `PerpsKnownWithdrawalStatus` enum, which adds the `failed` status the withdrawal contract already includes, and `PerpsWithdrawalStatus` is widened so unrecognized statuses flow through as plain strings.

## 0.1.0

### Minor Changes

- 7c76b5a: Add confirmed combo trade broadcasts to RFQ quoter sessions.
- 15597df: Bootstrap beta prerelease publishing.
- de391df: Graduate the SDK to the stable 0.x release line, mark Perps APIs as experimental, and remove deprecated compatibility APIs.
- 1903b61: Expose `parentEventId` on `Event` so child events such as sports "more markets" events link back to their parent event. The value is normalized to the same `EventId` type as `Event.id`.
- b20773a: Add Perps SDK support with public market data reads/subscriptions, credential-backed private sessions, account reads, trading commands, approvals, deposits, withdrawals, and Perps bindings.

### Patch Changes

- 77fdb6e: Document order book level ordering and custom market subscription events.
- dccac9d: Add a `conditionId` alias to the CLOB order book, open order, trade, and builder trade shapes, carrying the same value as `market`, and mark `market` deprecated. `market` on these types holds a CTF condition id; `conditionId` names it consistently with the rest of the SDK. Additive and non-breaking: both fields are emitted.
- 2e091ef: Support CLOB order tick sizes `0.005` and `0.0025`.
- 7649a5e: Parse Combo lifecycle activity from the canonical API `type` field instead of the legacy `side` verb.
- 9233e69: Add Combo activity pagination with normalized activity types, server-cursor Combo position pagination, Combo position sync request fields, and Combo position outcome/redeemable fields.
- b2e487f: Normalize Combo data field names to use wallet, amount, and payout consistently with the existing activity and portfolio surfaces, and brand Combo activity row IDs.
- 84335f8: Add `listComboMarkets` for fetching Combo market catalog entries with typed response bindings and SDK-owned pagination.
- b982460: Add `RESOLVED_PARTIAL` to `ComboPositionStatus`. The data API emits this terminal status for combo positions that fully resolve at a fractional on-chain payout (e.g. a voided/50-50 leg). Without it, the zod schema rejected the response and combo-positions parsing failed.
- 02ad8fa: Add distinct CTF and combo condition ID brands, keeping the previous condition ID exports as deprecated CTF aliases.
- 3b9ef1d: Handle legacy multi-outcome markets in market responses. `listMarkets` now omits markets that cannot be represented by the binary `Market` model instead of aborting the whole page, and `fetchMarket` fails with a typed `UnexpectedResponseError` instead of a raw `TypeError`.
- 72dbe7b: Normalize empty-string decimal fields from order and trade responses: order `makingAmount`/`takingAmount` map `""` to `"0"`, and maker order `feeRateBps` maps `""` to `null`, matching py-sdk behavior.
- ba70f93: Surface missing trade and position market icons as null instead of an empty string.
- 6082a3e: Make pagination request cursor inputs infer the branded pagination cursor type.
- d230d3a: Preserve `groupItemTitle` on normalized market responses.
- d731b5b: Add `listMarketClarifications` for reading market clarification text, with SDK-owned offset pagination and market/event/state/question/tx filters.
- 8790a22: Normalize empty-string optional decimal fields on streamed market and trade events to null (for example a trade's `feeRateBps` and a price change's `bestBid`/`bestAsk`), so consumers never receive `''` where a decimal string or null is expected.
- ea844f3: Strengthen CLOB batch price read result types so midpoint, price, and spread lookups are keyed by `TokenId`. `fetchPrices` now returns partial `OrderSide` records containing decimal strings, while `fetchMidpoints` and `fetchSpreads` return token ID keyed decimal strings.
- 7633fad: Remove `RfqKnownInboundMessageSchema`. The loose `{ type }` base was extended and its `type` field overwritten by every concrete inbound message schema, so it added nothing; each message schema now declares its own object shape directly.
- e60eefc: Type CLOB cancellation results with a branded `OrderId`. `CancelOrdersResponse` now exposes `canceled` as `OrderId[]` and keys `notCanceled` by `OrderId` across `cancelOrder`, `cancelOrders`, `cancelMarketOrders`, and `cancelAll`. Runtime values and wire shapes are unchanged; the new `OrderId` type, `toOrderId`, and `OrderIdSchema` are exported from `@polymarket/bindings`.
- 0f25328: Remove the unreleased `QUOTE_VALIDATION_TIMEOUT_INTERNAL` member from `RfqKnownErrorCode`. The gateway now reports quote-validation timeouts as `SERVICE_UNAVAILABLE`; gateways still emitting the internal code during rollout flow through the open `RfqErrorCode` type as plain strings.
- c6e0285: Parse RFQ quote rejections that use the `SUBMISSION_WINDOW_CLOSED` gateway error code.
- 6e0f923: Add repository metadata required for npm trusted publishing provenance validation.
- 3bbdb26: Restore account trade listing to the legacy endpoint and parse legacy epoch-seconds timestamps correctly.
- e7a8858: Drop unsupported tag/series request params and response fields, and normalize related tag id fields to camelCase.
- 6516128: Add `listComboPositions` for fetching combo positions with typed response bindings and SDK-owned pagination.
- 0dc6339: Declare Node.js 24 as the minimum supported runtime for published SDK packages.
- 4c7ac45: Add `session.fetchStats()` for Perps account stats.
- cf34be0: Add Perps session support for cancelling all open orders.
- 81114f9: Normalize Perps trading commands to match the rest of the SDK: place and modify orders now use `OrderSide`, place, modify, and cancel return per-item acknowledgement unions, and leverage and margin updates return `void` while throwing `RequestRejectedError` when rejected. Clean up the `PerpsInstrument` type, including a typed `PerpsFundingInterval` string format.
- 330af57: Normalize placeholder Perps deposit update hashes to `undefined`.
- 1f27825: Remove Perps modify order methods from the session API, rename Perps cancel order return types from acknowledgements to results, and stop exporting raw response schema names from Perps and CLOB bindings.
- d28b989: Remove unsupported Perps margin updates and return the leverage update result.
- e2ce4f9: Tighten Perps order request input types and validation for time-in-force-specific price and post-only constraints.
- 91c9e63: Normalize Perps order reads to expose `side: OrderSide` instead of upstream `buy`.
- 7f7eefe: Rename duplicate Perps raw model and response schemas to the public schema names.
- b434b43: Support Perps fills frames containing a list of fills.
- a282c35: Add Perps TP/SL order metadata, lifecycle events, unified `placeOrder` TP/SL placement, and `placePositionTpSl` with position-side inference. Remove unsupported Perps margin updates and return the leverage update result.
- 1e707cd: Support Perps trades frames containing a list of trades.
- e1e5808: Add maker-side RFQ WebSocket support.
- 3a8d59a: chore: configure packages for public beta release.
- 0809105: Parse RFQ inbound websocket messages by their type discriminator.
- 90e76a4: Support new Combos RFQ websocket error codes for balance, allowance, and pre-execution reservation failures.
- feead94: Model activity trades as an `isCombo`-discriminated union so Combo trade activity rows parse without binary market metadata.
- d045298: Allow activity market icons to be null when the Data API returns sparse historical rows without an icon URL.
- 50d56ce: Harden RFQ quoter sessions:

  - Unknown error codes no longer fail the session; they flow through as plain strings via the now-open `RfqErrorCode` type (known codes moved to `RfqKnownErrorCode`).
  - Unsolicited connection loss now fails in-flight operations and the session iterator with the new `ConnectionLostError`, carrying the close `code` and `reason`.

- d144ca9: chore: empty changeset to test new release workflow
- Updated dependencies [15597df]
- Updated dependencies [700acc9]
- Updated dependencies [6e0f923]
- Updated dependencies [0dc6339]
- Updated dependencies [3a8d59a]
- Updated dependencies [d144ca9]
  - @polymarket/types@0.1.0

## 0.1.0-beta.16

### Patch Changes

- 7633fad: Remove `RfqKnownInboundMessageSchema`. The loose `{ type }` base was extended and its `type` field overwritten by every concrete inbound message schema, so it added nothing; each message schema now declares its own object shape directly.

## 0.1.0-beta.15

### Patch Changes

- 8790a22: Normalize empty-string optional decimal fields on streamed market and trade events to null (for example a trade's `feeRateBps` and a price change's `bestBid`/`bestAsk`), so consumers never receive `''` where a decimal string or null is expected.
- ea844f3: Strengthen CLOB batch price read result types so midpoint, price, and spread lookups are keyed by `TokenId`. `fetchPrices` now returns partial `OrderSide` records containing decimal strings, while `fetchMidpoints` and `fetchSpreads` return token ID keyed decimal strings.
- 0f25328: Remove the unreleased `QUOTE_VALIDATION_TIMEOUT_INTERNAL` member from `RfqKnownErrorCode`. The gateway now reports quote-validation timeouts as `SERVICE_UNAVAILABLE`; gateways still emitting the internal code during rollout flow through the open `RfqErrorCode` type as plain strings.
- b434b43: Support Perps fills frames containing a list of fills.
- 1e707cd: Support Perps trades frames containing a list of trades.
- 50d56ce: Harden RFQ quoter sessions:

  - Unknown error codes no longer fail the session; they flow through as plain strings via the now-open `RfqErrorCode` type (known codes moved to `RfqKnownErrorCode`).
  - Unsolicited connection loss now fails in-flight operations and the session iterator with the new `ConnectionLostError`, carrying the close `code` and `reason`.

## 0.1.0-beta.14

### Patch Changes

- b982460: Add `RESOLVED_PARTIAL` to `ComboPositionStatus`. The data API emits this terminal status for combo positions that fully resolve at a fractional on-chain payout (e.g. a voided/50-50 leg). Without it, the zod schema rejected the response and combo-positions parsing failed.

## 0.1.0-beta.13

### Patch Changes

- 7649a5e: Parse Combo lifecycle activity from the canonical API `type` field instead of the legacy `side` verb.

## 0.1.0-beta.12

### Patch Changes

- 9233e69: Add Combo activity pagination with normalized activity types, server-cursor Combo position pagination, Combo position sync request fields, and Combo position outcome/redeemable fields.
- b2e487f: Normalize Combo data field names to use wallet, amount, and payout consistently with the existing activity and portfolio surfaces, and brand Combo activity row IDs.

## 0.1.0-beta.11

### Patch Changes

- d731b5b: Add `listMarketClarifications` for reading market clarification text, with SDK-owned offset pagination and market/event/state/question/tx filters.
- cf34be0: Add Perps session support for cancelling all open orders.

## 0.1.0-beta.10

### Patch Changes

- 4c7ac45: Add `session.fetchStats()` for Perps account stats.
- a282c35: Add Perps TP/SL order metadata, lifecycle events, unified `placeOrder` TP/SL placement, and `placePositionTpSl` with position-side inference. Remove unsupported Perps margin updates and return the leverage update result.

## 0.1.0-beta.9

### Patch Changes

- 2e091ef: Support CLOB order tick sizes `0.005` and `0.0025`.
- 6082a3e: Make pagination request cursor inputs infer the branded pagination cursor type.
- d28b989: Remove unsupported Perps margin updates and return the leverage update result.
- 91c9e63: Normalize Perps order reads to expose `side: OrderSide` instead of upstream `buy`.

## 0.1.0-beta.8

### Patch Changes

- d230d3a: Preserve `groupItemTitle` on normalized market responses.
- 81114f9: Normalize Perps trading commands to match the rest of the SDK: place and modify orders now use `OrderSide`, place, modify, and cancel return per-item acknowledgement unions, and leverage and margin updates return `void` while throwing `RequestRejectedError` when rejected. Clean up the `PerpsInstrument` type, including a typed `PerpsFundingInterval` string format.
- 1f27825: Remove Perps modify order methods from the session API, rename Perps cancel order return types from acknowledgements to results, and stop exporting raw response schema names from Perps and CLOB bindings.
- e2ce4f9: Tighten Perps order request input types and validation for time-in-force-specific price and post-only constraints.
- 7f7eefe: Rename duplicate Perps raw model and response schemas to the public schema names.
- Updated dependencies [700acc9]
  - @polymarket/types@0.1.0-beta.4

## 0.1.0-beta.7

### Minor Changes

- 7c76b5a: Add confirmed combo trade broadcasts to RFQ quoter sessions.
- b20773a: Add Perps SDK support with public market data reads/subscriptions, credential-backed private sessions, account reads, trading commands, approvals, deposits, withdrawals, and Perps bindings.

### Patch Changes

- 330af57: Normalize placeholder Perps deposit update hashes to `undefined`.

## 0.1.0-beta.6

### Minor Changes

- 1903b61: Expose `parentEventId` on `Event` so child events such as sports "more markets" events link back to their parent event. The value is normalized to the same `EventId` type as `Event.id`.

### Patch Changes

- 3b9ef1d: Handle legacy multi-outcome markets in market responses. `listMarkets` now omits markets that cannot be represented by the binary `Market` model instead of aborting the whole page, and `fetchMarket` fails with a typed `UnexpectedResponseError` instead of a raw `TypeError`.
- 72dbe7b: Normalize empty-string decimal fields from order and trade responses: order `makingAmount`/`takingAmount` map `""` to `"0"`, and maker order `feeRateBps` maps `""` to `null`, matching py-sdk behavior.
- ba70f93: Surface missing trade and position market icons as null instead of an empty string.
- 90e76a4: Support new Combos RFQ websocket error codes for balance, allowance, and pre-execution reservation failures.
- feead94: Model activity trades as an `isCombo`-discriminated union so Combo trade activity rows parse without binary market metadata.

## 0.1.0-beta.5

### Patch Changes

- 84335f8: Add `listComboMarkets` for fetching Combo market catalog entries with typed response bindings and SDK-owned pagination.
- c6e0285: Parse RFQ quote rejections that use the `SUBMISSION_WINDOW_CLOSED` gateway error code.

## 0.1.0-beta.4

### Patch Changes

- 02ad8fa: Add distinct CTF and combo condition ID brands, keeping the previous condition ID exports as deprecated CTF aliases.
- 0809105: Parse RFQ inbound websocket messages by their type discriminator.

## 0.1.0-beta.3

### Patch Changes

- 77fdb6e: Document order book level ordering and custom market subscription events.
- 6e0f923: Add repository metadata required for npm trusted publishing provenance validation.
- 3bbdb26: Restore account trade listing to the legacy endpoint and parse legacy epoch-seconds timestamps correctly.
- e7a8858: Drop unsupported tag/series request params and response fields, and normalize related tag id fields to camelCase.
- 6516128: Add `listComboPositions` for fetching combo positions with typed response bindings and SDK-owned pagination.
- 0dc6339: Declare Node.js 24 as the minimum supported runtime for published SDK packages.
- e1e5808: Add maker-side RFQ WebSocket support.
- d045298: Allow activity market icons to be null when the Data API returns sparse historical rows without an icon URL.
- Updated dependencies [6e0f923]
- Updated dependencies [0dc6339]
  - @polymarket/types@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- 3a8d59a: chore: configure packages for public beta release.
- Updated dependencies [3a8d59a]
  - @polymarket/types@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- d144ca9: chore: empty changeset to test new release workflow
- Updated dependencies [d144ca9]
  - @polymarket/types@0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- 15597df: Bootstrap beta prerelease publishing.

### Patch Changes

- Updated dependencies [15597df]
  - @polymarket/types@0.1.0-beta.0

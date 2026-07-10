# @polymarket/bindings

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

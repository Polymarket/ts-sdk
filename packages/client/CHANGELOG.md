# @polymarket/client

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

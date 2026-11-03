# Predictions action routing

Supported discovery, market data, trading, portfolio, wallet and combo actions use the existing `predictions.rest` endpoint. Public and authenticated clients share this route selection. Authenticated clients attach their current bearer access token. Saved L2 credentials are migration input: client creation exchanges them for bearer credentials before business requests.

## API-key headers

A configured API key adds headers only to the operations its credential family covers. These are the same operations it signed before the routes moved:

- Builder keys sign trading, pricing, rewards and account operations.
- Builder keys sign builder RFQ writes, but not RFQ status reads.
- Keys that support gasless transactions sign wallet, collateral return and session-signer operations.
- Market discovery, comments, profiles, portfolio and leaderboard reads carry no API-key headers.

The signature covers the upstream method, path and exact body, even when the gateway path or method differs. Order payload owners are trading identities. Bearer credentials never become order owners.

## Direct endpoints

The following actions keep their direct endpoints because the gateway has no equivalent operation:

- Comment reads that need offset pagination: `holdersOnly`, `getPositions`, other sorts, or saved offset cursors. Keyset comments use `/v1/comments`, which returns the cursor envelope.
- Accounting snapshot downloads.
- `sendOrderHeartbeat`. It requires the V1 `{ heartbeat_id }` contract at `/v1/heartbeats`, but the gateway forwards `/v1/trading/heartbeats` to the legacy `/heartbeats` endpoint, which answers `{ status: "ok" }`. The action moves to the gateway once that operation serves the V1 contract.

The SDK chooses the route before dispatch. It does not fall back to another endpoint after a request fails.

Standalone credential administration is no longer provided by the SDK. Perps and websocket transports keep their independent configuration and lifecycle.

The gateway origin may include an application proxy prefix. Keep direct endpoint configurations consistent with that environment.

Routing follows the gateway passthrough tables at `5d031a59` (2026-11-03). Gateway-only endpoints without corresponding SDK methods are outside this change.

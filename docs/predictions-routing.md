# Predictions action routing

Supported discovery, market data, trading, portfolio, wallet and combo actions use the existing `predictions.rest` endpoint. Public and authenticated clients share this route selection. Authenticated clients attach their current bearer access token. Saved L2 credentials are migration input: client creation exchanges them for bearer credentials before business requests. Configured builder and submission authorization is combined with user authentication. Requester RFQ and session-signer operations also use their Predictions route contracts.

Builder and submission authorization covers the canonical service method, path and exact body, even when the gateway URL or method differs. Order payload owners are trading identities; bearer credentials never become order owners.

Supplying L2 credentials to `createSecureClient` produces a bearer session. Token references and keyset comment reads use Predictions. Keyset comments use `/v1/comments`, which returns the cursor envelope. Comment reads requiring offset pagination (`holdersOnly`, `getPositions`, other sorts or saved offset cursors) retain the direct comments endpoint because the gateway has no equivalent. Accounting snapshot downloads also retain their direct endpoint because the gateway does not expose that archive. These choices are made before dispatch; there is no automatic fallback after a request fails.

Standalone credential administration is no longer provided by the SDK. Perps and websocket transports keep their independent configuration and lifecycle.

The gateway origin may include an application proxy prefix. Keep direct endpoint configurations consistent with that environment. Offline tests cover routing, authentication, signing, token rotation and cleanup; they do not prove deployment availability or browser network access.

Routing follows the gateway passthrough tables at `401aa24e` (2026-11-02). Existing CLOB and Data methods use their supported gateway routes; gateway-only endpoints without corresponding SDK methods are outside this change. Offline validation does not establish production deployment availability.

## Heartbeat compatibility blocker

`sendOrderHeartbeat` requires the V1 `{ heartbeat_id }` response and canonical signing path `/v1/heartbeats`. At `401aa24e`, the gateway still forwards `/v1/trading/heartbeats` to the legacy `/heartbeats` endpoint, which returns `{ status: "ok" }`. The gateway must expose the V1 heartbeat contract and preserve its signing path before this SDK workflow can work through Predictions. Passing offline SDK tests does not resolve that upstream mismatch.

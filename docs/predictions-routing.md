# Predictions action routing

Supported discovery, market data, trading, portfolio, wallet and combo actions use the existing `predictions.rest` endpoint. Public and authenticated clients share this route selection. Bearer sessions attach their current access token; L2 trading requests retain their HMAC authentication. Builder and submission authorization remain independent.

Request signing covers the canonical service method, path and exact body, even when the gateway URL or method differs. Order payload owners are trading identities; bearer credentials never become order owners.

Direct clients remain available for compatibility. Credential administration, cursor-based comment reads, token references, session-signer operations and requester RFQ actions retain their configured direct services where no compatible Predictions route is available. Perps and websocket transports keep their independent configuration and lifecycle. There is no automatic fallback after a dispatched request fails.

The gateway origin may include an application proxy prefix. Keep direct endpoint configurations consistent with that environment. Offline tests cover routing, authentication, signing, token rotation and cleanup; they do not prove deployment availability or browser network access.

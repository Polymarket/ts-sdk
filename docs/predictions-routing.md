# Predictions action routing

Supported discovery, market data, trading, portfolio, wallet and combo actions use the existing `predictions.rest` endpoint. Public and authenticated clients share this route selection. Authenticated clients attach their current bearer access token. Saved L2 credentials are migration input: client creation exchanges them for bearer credentials before business requests. Configured builder and submission authorization is combined with user authentication. Requester RFQ and session-signer operations also use their Predictions route contracts.

Builder and submission authorization covers the canonical service method, path and exact body, even when the gateway URL or method differs. Order payload owners are trading identities; bearer credentials never become order owners.

Direct service transports remain available for compatibility; supplying L2 credentials to `createSecureClient` still produces a bearer session. Token references and both cursor-based and offset-based comment reads use Predictions. Standalone credential administration is no longer provided by the SDK. Perps and websocket transports keep their independent configuration and lifecycle. There is no automatic fallback after a dispatched request fails.

The gateway origin may include an application proxy prefix. Keep direct endpoint configurations consistent with that environment. Offline tests cover routing, authentication, signing, token rotation and cleanup; they do not prove deployment availability or browser network access.

Routing assumes these API contracts are available in the configured gateway environment. Offline validation does not establish production deployment availability.

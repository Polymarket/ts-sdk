---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add BUY-side requester combo RFQ support: `client.requestComboQuote(...)`, `client.acceptComboQuote(...)`, and `client.waitForComboFill(...)`, plus the `fetchRfqStatus` action in `@polymarket/client/actions`. Requests authenticate with the client's Builder API Key (`builderApiKey(...)` or `remoteBuilderSigning(...)`), and winning quotes are self-contained JSON values that may be persisted or routed between processes before acceptance. Business outcomes such as no quotes, a maker declining, or an expired acceptance window are returned as result values; gateway rejections throw the new `RfqRequestRejectedError` with a classified `RfqRejectionCode`.

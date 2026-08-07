---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add requester-side combo RFQ support: `client.requestComboQuote(...)`, `client.acceptComboQuote(...)`, and `client.waitForComboFill(...)`, plus the `fetchRfqStatus` action in `@polymarket/client/actions`. Requests authenticate with the client's Builder API Key (`builderApiKey(...)` or `remoteBuilderSigning(...)`), and winning quotes are accepted by RFQ and quote ID using the same client instance. Business outcomes such as no quotes, a maker declining, or an expired acceptance window are returned as result values; gateway rejections throw the new `RfqRequestRejectedError` with a classified `RfqRejectionCode`.

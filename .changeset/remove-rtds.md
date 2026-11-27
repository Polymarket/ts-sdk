---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

**Breaking:** Remove the legacy `comments`, `prices.crypto.binance`, `prices.crypto.chainlink`, `prices.crypto.chainlink.twap`, and `prices.equity.pyth` subscription topics, along with their subscription, event, and event-type exports such as `CommentsSubscription`, `CommentsEvent`, `CryptoPricesSubscription`, `CryptoPricesEvent`, `CryptoPricesChainlinkTwapSubscription`, `CryptoPricesChainlinkTwapEvent`, `EquityPricesSubscription`, and `EquityPricesEvent`. The deprecated `rtds` environment endpoint and fork option are also removed. Use `prices.crypto`, `prices.crypto.twap`, and `prices.equity` with a secure client; 30-second TWAP has no replacement. Use `listComments()` to read comments; live comment and reaction events are no longer available.

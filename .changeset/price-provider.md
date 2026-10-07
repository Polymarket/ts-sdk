---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Add optional Chainlink and Pyth provider selection to cryptocurrency, equity, and their 60-second TWAP subscriptions. Keep different requested providers on separate connections so fallback and disabled selection do not mix subscriptions. Price sources continue to identify the actual producer. An optional `onSubscribed` callback reports the provider the server confirms, on acceptance and after every reconnect.

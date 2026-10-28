---
'@polymarket/bindings': minor
'@polymarket/client': patch
---

Add an optional `logIndex` to Perps deposits so multiple deposits in one transaction stay distinct. Deposit listings remove repeated deposit events by transaction hash and log index, while deposits recorded without a log index are no longer collapsed within a page. Funding payment, deposit and withdrawal listings now continue paging through records at the inclusive start timestamp.

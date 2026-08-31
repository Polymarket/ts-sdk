---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Remove legacy AMM-era fields that the API no longer returns: `marketMakerAddress`, `ammType`, `fpmmLive`, `volumeAmm`, `volume24hrAmm`, `volume1wkAmm`, `volume1moAmm`, `volume1yrAmm`, and `liquidityAmm` from the raw market schema, `liquidityAmm` from the raw event schema, `volumeAmm` from `MarketMetrics`, and `liquidityAmm` from `EventMetrics`. Also remove the internal `pagerDutyNotificationEnabled` market field and `requiresTranslation` from market, event, series, and tag models, and drop the `marketMakerAddresses` filter from `listMarkets`. Responses that still carry any of these fields keep parsing; the values are ignored.

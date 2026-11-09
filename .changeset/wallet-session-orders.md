---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Add wallet-wide open-order listing and owner cancellation, with signer attribution and nullable `owner` metadata. Cancel selected orders with `cancelWalletOrders({ orderIds })`, or every open order with `cancelAllWalletOrders()`.

Allow session-key authorization with `relayerApiKey` as well as local or remote builder authorizers. Account credentials alone remain insufficient for session-key authorization and revocation.

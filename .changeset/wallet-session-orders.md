---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Add `listWalletOpenOrders` to list open orders across a Deposit Wallet, including orders placed by its session keys. Each order reports the `signerAddress` that placed it and a nullable `owner`. Filter by `market`, `assetId`, or 1 to 50 `signerAddresses`.

Add `cancelWalletOrders({ orderIds })` and `cancelAllWalletOrders()` so the Deposit Wallet owner can cancel orders placed by any of its signers. `listOpenOrders`, `cancelOrder`, `cancelOrders`, and `cancelAll` still cover only orders placed with the client's own credentials.

Allow session-key authorization with `relayerApiKey` as well as `builderApiKey` and `remoteBuilderSigning`. Account credentials alone remain insufficient for session-key authorization and revocation.

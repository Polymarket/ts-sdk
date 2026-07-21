---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Add `waitForOrderSettlement` to follow a placed order's fills to on-chain settlement.

Order settlement is moving to an asynchronous pipeline: matched order responses are no longer guaranteed to include `transactionsHashes` and instead carry the `tradeIds` of the fills. If you read `transactionsHashes` from `placeMarketOrder`, `placeLimitOrder`, `postOrder`, or `postOrders` responses, migrate to:

```ts
const response = await client.placeMarketOrder({ ... });

if (response.ok) {
  const hashes = await client.waitForOrderSettlement(response);
  // hashes: TxHash[]
}
```

`waitForOrderSettlement` returns hashes already present in the order response without waiting, so it behaves identically before and after the settlement pipeline rollout. `OrderResponse` fields are now fully documented, including the best-effort semantics of `transactionsHashes`.

`ClobTrade.status` is now typed as the `TradeStatus` enum (previously a bare string). The enum is shared with the user stream trade events, and both wire forms of the status are normalized to it.

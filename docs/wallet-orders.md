# Wallet-wide orders

Use an authenticated Deposit Wallet client to read orders across the wallet owner
and its non-revoked session signers. Expired signers' resting orders are included.

```ts
for await (const page of client.listWalletOpenOrders({
  assetId,
  sessionKeys: [sessionAddress],
})) {
  for (const order of page.items) {
    console.log(order.id, order.signerAddress, order.owner);
  }
}
```

`signerAddress` identifies the signer that placed the order. `makerAddress` is the
Deposit Wallet. `owner` contains the API-key identifier when disclosed, or `null`
when withheld. Prices and sizes are decimal strings. Timestamps are ISO strings.
An order without an expiration has no `expiresAt` property.

The optional filters are `market`, `assetId`, and up to 50 `sessionKeys`. A signer
outside the wallet matches no orders. Pages can be short or empty while another
page remains. Use the paginator, which follows continuation cursors until the
server reports completion. No caller-selected page size is available.

Only the wallet owner can cancel across the wallet:

```ts
const cancellation = await client.cancelWalletOrders({ orderIds: [orderId] });
console.log(cancellation.canceled, cancellation.notCanceled);

await client.cancelWalletOrders({ all: true });
```

Choose exactly one mode. Selected cancellation accepts 1 to 1,000 order hashes.
Partial failures are returned in `notCanceled`. A missing, foreign, or already
cancelled order is not treated as successfully cancelled. The SDK does not split
requests into batches or retry cancellation after a transport failure. Read the
wallet's orders before deciding whether to retry an uncertain cancellation.
Existing `listOpenOrders`, `cancelOrder`, `cancelOrders`, and `cancelAll` retain
their API-key-scoped behavior.

Availability depends on the environment's cancellation rollout. A disabled
endpoint can return a 404 rejection. The SDK preserves that failure and does not
fall back to a narrower cancellation endpoint.

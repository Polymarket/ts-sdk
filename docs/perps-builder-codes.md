# Perps builder fees

Configure a builder once when opening a Perps session to attribute new orders to your application. The builder address identifies the account receiving the additional fee; it does not change the trader authenticated by the session.

Perps APIs are experimental and may change in a breaking way in any release, including patch releases. These examples assume an initialized owner-signed `SecureClient` named `client`, your application's registered `builderAddress`, and a selected `instrumentId`. Import `OrderSide` and `PerpsTimeInForce` from `@polymarket/client` for the order examples.

## Set session defaults

Check public availability during application setup, then open the trader's session:

```ts
const status = await client.fetchPerpsBuilderStatus({ address: builderAddress });
if (!status.registered || !status.enabled || !status.admissionEnabled) {
  throw new Error("Builder attribution is unavailable");
}

const builder = { address: builderAddress, feeRate: "0.0005" }; // 5 bps
let session = await client.openPerpsSession({ builder });
```

Rates are exact decimal strings: `"0.001"` is the platform maximum of **10 bps**, and `"0.0005"` is 5 bps. Use fixed-point notation with at most 28 fractional digits. The SDK rejects unsupported precision and over-cap values without rounding. A status check describes availability at the time of the read; the platform validates each order when submitted.

Defaults are copied into the session, remain fixed for its lifetime, and survive reconnects. They add no builder lookup to each placement. They are not included in exported credentials. Supply them again when resuming:

```ts
const credentials = session.credentials;
await session.close();

session = await client.openPerpsSession({ credentials, builder });
```

Protect saved credentials as secrets. Omitting `builder` when creating or resuming a session opens it without a builder default. Close the session when its work is finished.

## Obtain the trader's consent

Session configuration does not approve fees. Before tagged trading, the account owner must approve a maximum rate for the selected builder. The following example uses an already-open trader session and grants up to 10 bps:

```ts
const approvals = await session.fetchBuilderApprovals({ builder: builderAddress });
const previous = approvals[0];

const approval = await client.approvePerpsBuilderFee({
  builder: builderAddress,
  maxFeeRate: "0.001",
  approvalVersion: (previous?.approvalVersion ?? 0) + 1,
});
```

Each approval version must be exactly the last committed version plus one, initially `1`. A delegated trading session can read and use consent, but cannot grant it. Present the rate to the trader before requesting their owner signature.

If another approval wins the race, read the saved grant again and reconcile the intended change with the owner. After a timeout or lost response, first check whether the original approval committed. Do not automatically increment the version and resubmit: that could overwrite a newer revocation or reduced allowance.

To revoke permission for new tagged orders, call the same method with `maxFeeRate: "0"` and the explicit next version. Zero-rate tagged orders still require a positive active approval. Revocation and removing session defaults do not change terms already saved on resting orders.

## Place attributed orders

These examples use an open `session` configured with the approved builder:

```ts
const orderRequest = {
  instrumentId,
  side: OrderSide.BUY,
  quantity: "0.01",
  timeInForce: PerpsTimeInForce.IOC,
} as const;

await session.placeOrder(orderRequest); // Inherit the session default.

await session.placeOrder({
  ...orderRequest,
  builder: { address: builderAddress, feeRate: "0.0003" }, // Replace both terms.
});

await session.placeOrder({ ...orderRequest, builder: null }); // No builder attribution.
```

Omission or `undefined` inherits the default; a complete object replaces it; `null` disables builder attribution for that placement. Exchange fees still apply. When replacing the address, the trader needs a valid approval for that recipient too.

The same precedence applies independently to each item in `session.postOrders({ orders })`. The SDK validates the entire batch before submission. There is no batch-wide builder override.

A placement's resolved terms apply to its entry and every generated TP/SL exit:

```ts
await session.placeOrder({
  ...orderRequest,
  takeProfit: { triggerPrice: "110" },
  stopLoss: { triggerPrice: "90" },
});

await session.placePositionTpSl({
  instrumentId,
  takeProfit: { triggerPrice: "110" },
  stopLoss: { triggerPrice: "90" },
  builder: null,
});
```

The illustrative trigger prices must be chosen for your instrument and position. Entry and exit executions can each incur a builder fee. A `builder: null` placement opts out all its generated legs; individual trigger objects do not accept builder settings. Cancellation and other account operations do not inherit order attribution.

## Read fees and earnings

On account fills, `fee` remains the exchange fee. `builderFee` is the additional builder amount and `totalFee` is their sum. All three are decimal strings; retain exact decimal arithmetic in your application. Exchange rebates and total fees can be negative. Older responses without a builder fee normalize to zero, with the total derived from the available amounts.

Public builder status exposes availability and the platform cap. Private approvals belong to the authenticated trader. A session's configured builder address does not select another account's balances, approvals, or earnings.

To read earnings, authenticate `builderSession` as the account receiving those fees. Each fetched page retains its reporting window and indexed sequence cutoff, including empty pages:

```ts
const earnings = builderSession.listBuilderEarnings();
const page = await earnings.firstPage();

if (page.snapshot !== null) {
  const summary = await builderSession.fetchBuilderEarningsSummary(page.snapshot);
  console.log(page.items, summary.assets);
}

for await (const nextPage of earnings.from(page.nextCursor)) {
  console.log(nextPage.items);
}
```

History defaults to seven days and accepts windows up to 90 days. `.from(page.nextCursor)` preserves the original window and cutoff. A missing cursor produces no continuation pages; its synthetic `firstPage()` has `snapshot: null`. An explicit `asOfSequence` must already be fully indexed. The summary's `activeApprovalCount` reflects current grants, independently of its historical cutoff.

## Recover live receipts

`await builderSession.subscribeBuilderFills()` returns an async iterable handle with `close()`. Events are either `builderFill`, whose `payload` contains receipts, or `resync`, which requests reconciliation. The stream has no initial history, automatic replay, or exactly-once guarantee. Engine sequences are sparse: a numerical jump alone does not prove a missing receipt. Keep zero-fee receipts.

Use the following application-level pseudocode to combine the stream with history. The journal, recovery coordinator, checkpoint, and transactional deduplication belong to your application; they are not additional SDK methods.

```text
handle = await builderSession.subscribeBuilderFills()
start consuming handle concurrently, before requesting history:
  on builderFill: append receipts to a durable journal
  on resync: mark recovery required; retain unresolved recovery windows
  on stream failure: mark recovery required and reconnect/reopen the handle

for initial startup, each resync, and periodic reconciliation:
  choose a window overlapping the last reconciled interval
  page builderSession.listBuilderEarnings({ start, end })
    keep the first fetched page's snapshot and use its continuation cursors
    persist every receipt with a unique key:
      (authenticated builder account, earningId)
    apply receipt effects atomically with that unique insertion
  drain journal receipts through the same idempotent persistence path
  if another resync occurred while paging, repeat reconciliation
  retain intervals still affected by indexing lag and retry them later

on shutdown: stop recovery work, await handle.close(), flush the journal
```

History can lag the live stream. An empty page or reaching the requested window's end does not prove that an outage is recovered. Use the returned indexed cutoff to track progress, retain unresolved intervals until indexing has caught up to the recovery boundary, and repeat overlapping reads. Do not advance the historical checkpoint merely from the newest live receipt. Partition longer recoveries into windows of at most 90 days.

Set explicit journal capacity, retention, and backpressure policies. If capacity is exceeded, record a recovery gap and reconcile it; do not silently drop receipts or accumulate an unbounded in-memory buffer. Keep deduplication keys for every interval that may be replayed. Atomic persistence prevents duplicate local application, while external side effects require their own idempotency or an outbox. The SDK does not guarantee exactly-once processing.

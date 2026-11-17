---
"@polymarket/bindings": minor
"@polymarket/client": minor
---

Preserve activity and combination rows with empty optional identifiers, enrichment, or first-entry timestamps.

Activity `transactionHash` and trade `title` can now be `undefined` when unavailable. Regular-market activity may also have unavailable `conditionId`, `assetId`/`tokenId`, `title`, `slug`, `eventSlug`, or `outcome` values. Combination position `firstEntryAt` and leg `legConditionId` can also be `undefined`. Existing callers must check these values before using an identifier, constructing a URL, or parsing a date; unavailable values no longer reject the entire page.

```ts
if (activity.transactionHash !== undefined) {
  console.log(activity.transactionHash.toLowerCase());
}
if (position.firstEntryAt !== undefined) {
  console.log(new Date(position.firstEntryAt));
}
```

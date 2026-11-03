---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Support directional events: derive bucket, Void, and threshold position IDs, split and merge an event's complete bucket set, convert bucket NO positions, compose and decompose thresholds, and split and merge between two threshold lines. Directional conditions work with `splitPosition`, `mergePositions`, and `redeemPositions` without a market listing, and with condition filters. Add the `ATOMIC_DIRECTIONAL` and `INCREMENTAL_DIRECTIONAL` resolution types. Behavior for binary, neg-risk, combo, and CTF markets is unchanged.

Expose `mergeDirectional(positionIdA, positionIdB, amount?)` and `splitDirectional(positionIdA, positionIdB, amount?)`, accepting ABOVE on a lower line and BELOW on a higher line in either argument order. The SDK derives the event and line indices locally. Optional amounts are bigint values in six-decimal base units or `'max'`; omission defaults to fresh maximum balances, including collateral checks for splits. The corresponding `prepare*` methods use the same arguments. Add `decodePositionId`, read-only `findDirectionalPairs`, custom-signing workflows, and the four dedicated directional activity types with event-level and threshold-level models.

---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

**Breaking**: the feed surfaces are fully replaced — same names, new contracts. `listActivity`, `listComboActivity`, `listPositions`, and `listComboPositions` now serve exact cursor pagination with automatic rate-limit retry and the `condition`-id vocabulary. `listPositions` bundles the whole lifecycle behind `status` (`OPEN`/`REDEEMABLE`/`CLOSED`) with `redeemable`/`mergeable` flags and fee-exclusive entry economics on every row — `listClosedPositions` and `listMarketPositions` are removed (use `listPositions` with `status`/a `conditionId` anchor). Every windowed method takes one `window` option (`'full' | { start?, end? }`, epoch seconds or `Date`) replacing raw `start`/`end`. Amount fields are numbers; the `Activity` union, `Position`, `ComboPosition`, and `ComboActivity` rows are strict and normalized (epoch ms, empty-string/999-sentinel absence as `undefined`, `assetId` canonical with deprecated `tokenId` alias). Combo activity rows carry `positionId` on every row while dropping `transactionAt`/`logIndex`/`moduleId`.

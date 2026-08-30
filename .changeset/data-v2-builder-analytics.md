---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

**Breaking**: migrate `listBuilderLeaderboard` and `fetchBuilderVolume` to their v2 contracts. Builder rankings now use server cursors and normalized `BuilderStanding` rows; builder volume returns complete date buckets as `BuilderVolumePoint` rows. Replace `timePeriod` with `window` or `interval`, and use `bucketLimit` to bound volume buckets.

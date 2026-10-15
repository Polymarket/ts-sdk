---
'@polymarket/bindings': minor
'@polymarket/client': minor
---

Breaking 0.x change: `SplitActivity`, `MergeActivity` and `RedeemActivity` now
include Combo variants with `isCombo: true`, `ComboConditionId`, optional titles
and no `slug`/`eventSlug`. For `listActivity` results, add `!activity.isCombo` to
the existing SPLIT/MERGE/REDEEM type guard before accessing market URLs.
Parsed ordinary rows return `isCombo: false`; ordinary object construction may
still omit the flag.

Combo splits, merges and redemptions accept missing presentation metadata.
Trades and redemptions retain basket token `outcome`/`outcomeIndex`: blank labels
and index `999` become `undefined`, while zero is preserved. Automatic redemption
remains REDEEM; the separate `listComboActivity` models are unchanged.

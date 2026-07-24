---
"@polymarket/bindings": patch
---

Add `PerpsFeeTier` and a required `tiers` array on `PerpsFeeScheduleEntry`, matching the volume-based fee tiers (including negative maker rebate rates) in the updated `GET /v1/info/fees` contract.

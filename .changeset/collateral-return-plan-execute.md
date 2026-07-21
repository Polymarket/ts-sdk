---
"@polymarket/bindings": patch
"@polymarket/client": patch
---

Add Collateral Return plan/execute support: `planCollateralReturn` returns an inspectable plan and `executeCollateralReturnPlan` signs and submits the plan's exact Router call for Deposit Wallet, Safe, and legacy Proxy accounts, returning a transaction handle.

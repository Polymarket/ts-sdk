---
"@polymarket/client": patch
---

Remove the retired CLOB v1 Neg Risk Adapter from `setupTradingApprovals` and `prepareTradingApprovals`. The setup flow no longer grants a MAX collateral allowance or ERC-1155 approval-for-all to the retired adapter; all current exchanges, collateral adapters, and the auto-redeem operator remain approved.

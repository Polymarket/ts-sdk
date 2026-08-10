---
"@polymarket/client": minor
---

Add `fetchTradingApprovalsState` for reading a wallet's missing trading approvals without a signer or transaction workflow. Export the approval requirement types, and report malformed approval-check results as `UnexpectedResponseError` in both read and setup workflows.

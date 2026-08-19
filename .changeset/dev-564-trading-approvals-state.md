---
"@polymarket/client": minor
---

Add `fetchTradingApprovalsState` for reading a wallet's missing trading approvals without a signer or transaction workflow. Export the approval requirement types, and report malformed approval-check results as `UnexpectedResponseError` in both read and setup workflows.

Secure account read methods now reject invalid request values—including `null`, arrays, primitives, and `user: null`—with `UserInputError` instead of silently defaulting the wallet or throwing a raw error.

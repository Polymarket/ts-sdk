---
"@polymarket/client": patch
---

Default `createSecureClient` to the signer's current deterministic Deposit Wallet when no wallet is provided, deploying it when needed while preserving explicit EOA and existing wallet behavior.

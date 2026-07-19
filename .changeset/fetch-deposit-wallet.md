---
"@polymarket/client": patch
---

Add `fetchDepositWallet`, a low-level action that resolves the Deposit Wallet address for a signer address: the existing deployed UUPS Deposit Wallet when there is one, or the signer's Beacon Deposit Wallet otherwise.

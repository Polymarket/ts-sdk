---
"@polymarket/client": patch
---

Deposit-wallet gasless and collateral-return submits now self-heal nonce mismatches: when the relayer rejects a batch with the on-chain nonce in the error, the batch is re-signed with that nonce and resubmitted once.

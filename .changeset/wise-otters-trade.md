---
"@polymarket/client": patch
---

Add an `@polymarket/client/openfort` entrypoint with a `signerFrom` factory that signs and trades with Openfort EVM backend wallets. The entrypoint mirrors the Privy integration: Node-only runtime guards, the shared `Signer` contract, the same public error mapping, and a direct transaction handle that waits for receipts. `@openfort/openfort-node` is a new optional peer dependency.

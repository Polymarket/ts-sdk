---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

The secure client can migrate an account from its Safe or Proxy wallet to its Deposit Wallet: `fetchWalletMigration`, `previewWalletMigration`, `migrateWallet`, `cancelWalletMigration`, `fetchWalletLeftovers` and `sweepWalletLeftovers`. `migrateWallet` binds the Deposit Wallet to the session when the migration completes. The methods are experimental.

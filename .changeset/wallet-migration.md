---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

The secure client can migrate an account from its Safe or Proxy wallet to its Deposit Wallet: `fetchWalletMigration`, `previewWalletMigration`, `migrateWallet`, `cancelWalletMigration`, `fetchWalletLeftovers` and `sweepWalletLeftovers`. `migrateWallet` binds the Deposit Wallet to the session when the migration completes, and returns the current wallet and credentials for an account that needs no migration. `migrateWallet`, `sweepWalletLeftovers` and `cancelWalletMigration` accept an abort `signal`. The methods are experimental.

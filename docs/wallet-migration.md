# Wallet migration

A wallet migration moves an account from its Safe or Proxy wallet to its Deposit Wallet. The secure client runs the migration, then binds the Deposit Wallet to its session, so the same client trades from the Deposit Wallet afterwards. The migration runs only when the application calls it. The methods are experimental.

## Before the migration

`fetchWalletMigration` reads the migration of the authenticated account: its state, the Deposit Wallet and what the current wallet holds. `previewWalletMigration` lists what the migration would move and each blocker that stops it. Neither read changes anything. An account that already trades from its Deposit Wallet gets status `422` from the preview.

```ts
const migration = await secureClient.fetchWalletMigration();
const preview = await secureClient.previewWalletMigration();

for (const blocker of preview.blockers) {
  console.log(blocker.code, blocker.message);
}
```

Each blocker has a `code` and a `message` for the user. `WalletMigrationKnownBlockerCode` names the known codes: `MULTIPLE_ACCOUNTS`, `UNSUPPORTED_WALLET`, `TOO_MANY_POSITIONS`, `LEGACY_FUNDS`, `SIBLING_FUNDED`, `DESTINATION_IN_USE` and `PROFILE_RESTRICTED`. A later release can add codes.

When a migration cannot start, `migrateWallet` rejects with `RequestRejectedError`. Its `status` is `422`, and its `code` is the blocker code, such as `SIBLING_FUNDED`. The error carries no other blocker details, so call `previewWalletMigration` first to show the blockers.

## The migration

One `migrateWallet()` call runs the whole migration:

1. It starts the migration, or continues one that an earlier call started.
2. It waits while the transactions confirm. This can take minutes.
3. When the migration completes, it binds the Deposit Wallet to the session.

`migrateWallet` asks the signer to sign each sweep that moves funds. A restart after a conflict can ask for another signature. A poll while a transaction confirms asks for none. The bind needs no signature and keeps the refresh token. The same client stays open: `secureClient.account` moves to the Deposit Wallet, and the new access token reaches `onCredentialsChanged`. A bind from another wallet ends the open user subscriptions with `TransportError`, so subscribe again for the events of the Deposit Wallet. The Deposit Wallet needs trading approvals before it trades.

```ts
const preview = await secureClient.previewWalletMigration();
if (preview.blockers.length === 0) {
  const { credentials } = await secureClient.migrateWallet();
  await saveCredentials(credentials);
  await secureClient.setupTradingApprovals();
}
```

If the bind fails after the migration completes, `migrateWallet` rejects. While the session is usable, call `migrateWallet()` again to bind the Deposit Wallet. A bind that times out can still apply on the server. The session then renews and follows the Deposit Wallet. If the server refuses that renewal, the session ends, and the application signs in again.

A failed migration throws `TransactionFailedError`, and a new call starts it again. An account that needs no migration (`NOT_REQUIRED`), such as one that already uses its Deposit Wallet, binds nothing: the result names the current wallet and credentials. A migration that ends in another state throws `UnexpectedResponseError`. A flow that keeps restarting or asking for signatures also throws `UnexpectedResponseError`, and a flow that reaches the poll limit throws `TimeoutError`.

Pass `signal` to stop the migration, for example when the user leaves the page. The abort also stops the wait before a poll, and the call rejects with `RequestAbortedError`. A migration that the server already started continues on the server, and a new `migrateWallet()` call continues it. The SDK stops waiting for a signature in progress, but it cannot cancel the signer.

```ts
const controller = new AbortController();
const migration = secureClient.migrateWallet({ signal: controller.signal });
```

## Cancel

`cancelWalletMigration` cancels a migration before funds move. The account keeps its current wallet and can migrate later. A migration whose transaction is in flight, or whose funds reached the Deposit Wallet, rejects with status `409`.

```ts
const migration = await secureClient.cancelWalletMigration();
```

## Leftovers

After a completed migration, the old wallet can still hold funds or positions. `fetchWalletLeftovers` reads what the old wallet holds, its value, the blockers of a sweep and the state of the last sweep. `sweepWalletLeftovers` moves the leftovers to the Deposit Wallet and returns the leftovers after the sweep. The sweep asks the signer to sign it when funds must move, and it does not change the session. `sweepWalletLeftovers` and `cancelWalletMigration` also accept `signal`.

```ts
const leftovers = await secureClient.fetchWalletLeftovers();
if (leftovers.hasLeftovers && leftovers.sweepAvailable) {
  const after = await secureClient.sweepWalletLeftovers();
  if (after.hasLeftovers) {
    console.log('Leftovers remain. Last sweep:', after.lastSweep?.state);
  }
}
```

The returned leftovers show the outcome: check `hasLeftovers` and `lastSweep`. The sweep reads the leftovers again after it moves funds. If that read fails, the sweep can still have moved funds, so call `fetchWalletLeftovers()` before you retry the sweep.

An account without a completed migration gets status `409` from both methods, and a blocked sweep gets status `422`.

## Availability

The methods need an API Gateway that serves the migration operations and accepts the session's access token on them. Against another gateway, they reject with `RequestRejectedError`. A deployment can keep the cancel and the leftover sweep off. It then rejects them with status `503`.

The methods are experimental. They can change in a breaking way in any release.

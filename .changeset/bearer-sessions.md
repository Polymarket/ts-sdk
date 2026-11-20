---
'@polymarket/client': major
'@polymarket/bindings': major
---

**Breaking:** secure clients authenticate with bearer sessions from the unified API. `secureClient.credentials`, `publicClient.login`, `publicClient.migrateCredentials` and `onCredentialsChanged` use `{ accessToken, refreshToken }` pairs. Code that reads `.key`, `.secret` or `.passphrase` from `secureClient.credentials` must change. Save `secureClient.credentials` after creation and save renewals from `onCredentialsChanged`. See `docs/authentication-migration.md` before upgrading.

- Saved L2 credentials are exchanged for a bearer session during client creation, without a new wallet signature. `publicClient.migrateCredentials` does the same on its own and takes the owner as `signerAddress`.
- Saved credentials that no longer work reject `createSecureClient` with `RequestRejectedError` instead of falling back to a new signature. A saved bearer session ends after logout or when its refresh token expires (seven days without a renewal in production).
- Restoring saved bearer credentials sends one renewal request before the client is returned.
- Add `walletSetup` to `createSecureClient`, defaulting to `true`. With wallet setup, credentials without a wallet are bound to the requested wallet, or the default Deposit Wallet, without a new signature, and the default Deposit Wallet is deployed when needed. Pass `false` to use the session as it is, for example while the application runs its own onboarding.
- Add `secureClient.upgradeCredentials({ wallet })` to bind a wallet to a session that has none, without a new signature. It updates the same client and returns the new credentials: `account` moves to the wallet and subscriptions stay open. Failures are reported as `UpgradeCredentialsError`.
- Add `secureClient.refreshCredentials()` to renew the session on demand. A call made during a renewal joins it, and failures are reported as `RefreshCredentialsError`.
- Renewal follows the token lifetime returned by the server rather than the device clock, and keeps the session through transport failures, rate limits and server errors. Only a rejected refresh token or an invalid renewal response ends it. A request rejected for an expired access token is renewed and replayed once.
- When another client sharing the session binds a wallet, this client follows it on its next renewal.
- Login signs only the expected `ClobAuth` ownership challenge for the signer and the configured chain, and rejects any other payload with `UnexpectedResponseError`. A wallet the signer cannot use is rejected with `UserInputError` before anything is signed.
- `endAuthentication()` ends the bearer session and reports failures as `EndAuthenticationError`. It does not revoke L2 credentials migrated into the session, and issued access tokens stay valid until they expire.
- `openRfqSession` rejects with `RequestRejectedError` when the quoter rejects the access token. `CreateSecureClientError` includes `RequestAbortedError`.

If creation fails after opening a new session, the client logs it out and closes local resources while keeping the original error. Notifications for a new session are deferred until setup succeeds. Caller-supplied bearer sessions are not logged out when restoration fails.

---
'@polymarket/client': minor
'@polymarket/bindings': minor
---

**Breaking:** secure clients authenticate with gateway bearer sessions. `secureClient.credentials`, `publicClient.login`, `publicClient.migrateCredentials` and the new `onCredentialsChanged` callback use plain `{ accessToken, refreshToken }` pairs. Code that reads `.key`, `.secret` or `.passphrase` from `secureClient.credentials` must change. Save `secureClient.credentials` after creation and save renewals from `onCredentialsChanged`. See `docs/authentication-migration.md` before upgrading.

- Saved L2 credentials are exchanged for a bearer session during client creation, without a new wallet signature.
- Saved credentials that no longer work reject `createSecureClient` with `RequestRejectedError` instead of falling back to a new signature. A saved bearer session ends after logout or when its refresh token expires (seven days without a renewal in production).
- Restoring saved bearer credentials sends one renewal request before the client is returned. Saved credentials without a wallet are bound to the requested wallet, or the default Deposit Wallet, without a new signature, so a secure client always has an account wallet.
- `endAuthentication()` ends the bearer session. It does not revoke the L2 credentials migrated into it, and issued access tokens stay valid until they expire.
- Renewal follows the token lifetime returned by the server rather than the device clock. Transport failures, rate limits and server errors during renewal keep the session and retry with backoff. Only a rejected refresh token or an invalid renewal response ends it.
- Login signs only the expected `ClobAuth` ownership challenge for the signer and the configured chain, and rejects any other payload with `UnexpectedResponseError`.
- `publicClient.migrateCredentials` takes the owner as `signerAddress`.
- `openRfqSession` rejects with `RequestRejectedError` when the quoter rejects the access token. `CreateSecureClientError` includes `RequestAbortedError`, and `endAuthentication` failures are documented as `EndAuthenticationError`.

If creation fails after opening a new session, the client logs it out and closes local resources while keeping the original error. Notifications for a new session are deferred until setup succeeds. Caller-supplied bearer sessions are not logged out when restoration fails.

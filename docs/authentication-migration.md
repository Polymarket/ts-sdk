# Bearer session migration

Secure clients authenticate with a bearer session: an access token and a refresh token. `createSecureClient` accepts saved L2 credentials as `{ key, secret, passphrase }` or saved bearer credentials as `{ accessToken, refreshToken }`. It exchanges L2 credentials for a bearer session automatically and always exposes the bearer pair through `secureClient.credentials`. Login, migration and `onCredentialsChanged` use the same plain pair. Applications own persistence, and the SDK never logs credentials.

```ts
// Before: the stored object held the L2 key, secret and passphrase.
const saved = await loadCredentials();

// After: the same call accepts saved L2 or bearer credentials.
const client = await createSecureClient({
  signer,
  credentials: saved,
  onCredentialsChanged: async (credentials) => {
    try {
      await saveCredentials(credentials);
    } catch {
      reportStorageFailure(); // Do not log credentials.
    }
  },
});
await saveCredentials(client.credentials);
```

After the first successful creation, save `client.credentials` to replace the stored L2 object with the bearer pair. The callback then saves every later renewal.

## Breaking changes

- `secureClient.credentials` is now `{ accessToken, refreshToken }`. Code that reads `.key`, `.secret` or `.passphrase` must switch to `BearerCredentials`.
- The SDK no longer supports creating, deriving, listing or deleting API keys, or creating, listing or revoking builder API keys. `createApiKey`, `deriveApiKey`, `createOrDeriveApiKey`, `fetchApiKeys`, `deleteApiKey`, `createBuilderApiKey`, `fetchBuilderApiKeys` and `revokeBuilderApiKey` are removed from `@polymarket/client/actions`, together with their error guards and `ApiKeyAuthRequest`. They have no replacement in the SDK.
- Saved credentials that no longer work reject `createSecureClient` with `RequestRejectedError`. The SDK no longer falls back to a new wallet signature. Create the client without `credentials` to sign in again (see below).
- A saved bearer session ends when it is logged out or when its refresh token expires. In production a refresh token expires after seven days without a renewal. Saved L2 credentials did not expire.
- Restoring saved bearer credentials sends one renewal request before the client is returned, so it needs the network.
- `endAuthentication()` ends the bearer session. It does not revoke the L2 credentials that were migrated into that session, and access tokens that were already issued stay valid until they expire.
- `publicClient.migrateCredentials` takes the owner as `signerAddress`.
- `openRfqSession` rejects with `RequestRejectedError` when the quoter rejects the access token.
- `CreateSecureClientError` now includes `RequestAbortedError`. `endAuthentication` documents its failures as `EndAuthenticationError`.

Signing in again after a saved session ends:

```ts
async function connect(saved?: ClientCredentials) {
  try {
    return await createSecureClient({
      signer,
      credentials: saved,
      onCredentialsChanged: saveCredentials,
    });
  } catch (error) {
    if (saved === undefined || !(error instanceof RequestRejectedError))
      throw error;
    return createSecureClient({ signer, onCredentialsChanged: saveCredentials });
  }
}
```

## Migrating saved L2 credentials

During client creation, saved L2 credentials are exchanged at `/v1/auth/migrate` with an HMAC ownership proof and the signer's address. The L2 secret never leaves the SDK, and migration asks for no wallet signature. A rejected migration throws `RequestRejectedError`. It does not return a client, sign, call the persistence callback or change the saved object. You can also call `publicClient.migrateCredentials({ credentials, signerAddress, wallet, verificationToken })`, save the returned pair and pass it to `createSecureClient`.

If login or migration succeeds but a later setup step fails, client creation logs out the new session, closes its local resources and rethrows the original error, even if logout fails. A failed creation does not call `onCredentialsChanged` for that new session. Renewals during setup are delivered only after creation succeeds. Migration does not revoke the L2 credentials, so the application can retry with its unchanged saved object.

## Signing in and restoring sessions

A new login signs the server's ownership challenge. The SDK checks that the challenge is the expected `ClobAuth` attestation for the signer and the configured chain before asking the wallet to sign, and rejects any other payload with `UnexpectedResponseError`. `publicClient.login({ signer, wallet, verificationToken })` returns a bearer pair without creating a secure client. The wallet and the optional verification token belong to challenge creation.

Without `wallet`, `createSecureClient` uses the signer's Deposit Wallet. It first checks the earlier Deposit Wallet address, otherwise derives the current one, and deploys it if needed. Passing the signer address selects an EOA. Existing Proxy and Safe wallets stay bound to their account.

Restoring saved bearer credentials does not hand the existing session to the factory. If restoration or wallet setup fails, the client closes its local resources without logging out. Renewals that succeed during a failed restoration still reach the persistence callback, so the latest pair can be saved.

Saved credentials bound to a wallet keep that wallet. Passing a different `wallet` rejects with `UserInputError`. Saved credentials without a wallet, such as the pair from `publicClient.login({ signer })`, are bound to the requested wallet (or the default Deposit Wallet) through `/v1/auth/upgrade` before the client is returned. Binding needs no new signature and keeps the refresh token, and the new access token reaches `onCredentialsChanged`. A secure client always has an account wallet.

## Renewal

The SDK renews the access token 30 seconds before it expires. It schedules renewal from the lifetime the server returns with each token, so a device clock that runs fast or slow does not end the session. The timer, request recovery and socket reconnects share one renewal. Every adopted response replaces both tokens. `onCredentialsChanged` runs after adoption. Its synchronous exceptions and rejected promises are ignored, so handle storage failures inside the callback. A slow callback does not block requests.

Transport failures, rate limits and server errors during renewal keep the session. Requests continue with the current access token while it is valid, and the SDK retries renewal with backoff (up to 30 seconds between attempts, or longer when the server sends `Retry-After`). A rejected refresh token, such as `invalid_refresh_token`, or a renewal response for a different identity ends the session. After that, authenticated requests reject with that error and socket iterators end with it. Create a new client to continue.

An HTTP `401` is retried only for `expired_access_token`, once, with the same method, serialized body, query, cancellation and per-request timeout. A request whose token was already replaced uses the newer one. Other `401` responses and retry failures propagate. Mutations otherwise keep their no-replay policy. Cancelling one operation does not cancel a renewal shared with other operations.

## Sockets

Sockets receive only the access token. Each connection tracks the expiry of the token it last acknowledged, and a rejected renewal never extends it. Renewal keeps subscriptions. Reconnects use the current session token. Pending maker commands are rejected on disconnect and never replayed. Browser price-ticket flows and Perps authentication are separate.

## Logging out

```ts
const publicClient = await client.endAuthentication();
```

Logout sends a valid access token with no body. If the token expired, for example while a browser tab was suspended, the SDK renews it solely for revocation. An `expired_access_token` rejection gets one renewal and retry. Other logout failures are not replayed. A valid access token can revoke the session even after a failed renewal. Renewals made for logout are never adopted or passed to the persistence callback. Logout stops local renewal and socket work even when the remote logout fails, and a late renewal cannot revive the client.

## Endpoint configuration

Set `predictions.rest` to the gateway origin without `/v1`, because authentication paths already include `/v1/auth`. A configured proxy prefix is kept exactly. Login, migration, renewal, wallet binding and logout use this origin. Perps keeps its own endpoint and session.

Orders take their owner from the session's trading identity, never from the HTTP credentials.

## Release verification

Deterministic tests cover these contracts but do not prove production readiness. Before an external release, verify the deployed gateway issuer, audience and route coverage, browser access from other origins, builder identity and gasless quota continuity, and same-connection token renewal on every socket server. Browser ticket flows must keep working.

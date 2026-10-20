# Bearer session migration

`secureClient.credentials` supports both `{ key, secret, passphrase }` and `{ accessToken, refreshToken }`. Saved L2 credentials keep using HMAC authentication without implicit migration; narrow with `'key' in client.credentials` before reading mechanism-specific fields. New logins and restored bearer pairs use bearer authentication. Applications choose how to persist credentials; treat both tokens as secrets. The SDK does not persist them or log authentication payloads.

```ts
// Before: store the L2 key, secret and passphrase.
const saved = await loadCredentials();

// After: the same creation call accepts a saved L2 credential object or bearer pair.
const client = await createSecureClient({
  signer,
  credentials: saved,
  onCredentialsChanged: async (credentials) => {
    try { await saveCredentials(credentials); }
    catch (error) { reportStorageFailure(); } // Do not log credentials.
  },
});
await saveCredentials(client.credentials);
```

Migration is explicit through `publicClient.migrateCredentials`. L2 credentials are exchanged with an HMAC ownership proof. The L2 secret never leaves the SDK and migration asks for no new wallet signature. A rejected migration throws `RequestRejectedError`; it does not fall back to signing, call the persistence callback, or change your saved object. Direct consumers can call `publicClient.migrateCredentials({ credentials, signer: signerAddress, wallet, verificationToken })` and save the returned pair.

A bearer restoration refreshes once before returning to validate the saved refresh session, even if its access token is still fresh. An invalid or ended refresh session rejects creation. New logins sign the server's typed ownership challenge. `publicClient.login({ signer, wallet, verificationToken })` returns a bearer pair without creating a secure client. The wallet and optional verification token belong to challenge creation. The SDK never sends wallet information on login.

`createSecureClient({ signer, wallet })` keeps its existing wallet behavior. Omitting `wallet` first checks the legacy Deposit Wallet, otherwise derives the current Deposit Wallet, then checks/deploys it through the existing wallet workflow. Passing the signer address selects an EOA. Existing Proxy and Safe wallets stay bound to their account.

The SDK schedules renewal 30 seconds before access-token expiry. Timer, request recovery and socket reconnects share a single refresh. Every adopted response replaces both tokens. `onCredentialsChanged` runs after adoption; synchronous exceptions and asynchronous rejections are ignored. Handle persistence failures inside your callback. A slow callback does not block network state. Transient refresh failures receive at most three attempts with bounded backoff. A terminal failure stops the session and surfaces through authenticated requests and active socket iterators.

An HTTP `401` is retried only for `expired_access_token`, once, preserving method, serialized body, query, cancellation and per-request timeout. A request whose token is already superseded uses the newer pair. Other `401`s and retry failures propagate. Mutations otherwise retain their no-replay transport policy. Cancelling one operation does not cancel another operation's shared refresh.

Sockets receive only the access token. Each connection keeps its own acknowledged expiry; a rejected renewal never extends it. Renewal preserves subscriptions. Reconnect uses current session credentials. Pending maker trading commands are rejected on disconnect and never replayed. A maker with rejected initial authentication can retain public feeds, while protected commands are blocked. This does not grant external sessions access to requester sockets; external requesters may need REST. Browser price-ticket flows and Perps authentication remain separate.

```ts
const publicClient = await client.endAuthentication();
```

Logout sends a usable bearer access token with no body. If tab suspension let it expire, the SDK refreshes solely for revocation; an `expired_access_token` rejection receives one refresh/retry. Other logout failures are not replayed. A still-valid access token can revoke the session despite an earlier refresh failure. Logout-only refresh results are never adopted or sent to credential callbacks. It stops local refresh and socket work even when remote logout fails, and a late refresh cannot revive the client. Already issued access tokens can remain valid until expiry. Logout does not delete CLOB API keys.

Prediction HTTP calls use the configured gateway. Existing direct endpoint configuration and existing builder/relayer adapters remain available during migration. Builder authentication and gasless quota credentials are still distinct from trading signatures; orders continue to require their existing signatures. Existing builder and collateral-return routes retain their configured endpoints where gateway passthrough coverage is unavailable. Perps keeps its own endpoint and lifecycle.

# Release verification

Deterministic tests validate these contracts; they do not establish production readiness. Before external release, verify deployed gateway issuer/audience and route coverage, external-origin CORS/WAF access, builder identity and gasless quota continuity, and same-connection renewal support on all socket servers. Requester socket admission is first-party only. Browser ticket flows must remain intact. Do not retire direct upstreams or L2 credentials as part of this SDK migration.

## Endpoint configuration

Set `predictions.rest` to the gateway origin, without appending `/v1`: auth actions already include `/v1/auth`. A configured proxy prefix is preserved exactly. Changing only `predictions.rest` does not redirect the other endpoint configurations; configure direct services for the same environment when using L2 credentials or pre-login wallet discovery.

Bearer wallet initialization uses `/v1/wallets/deployed`, `/v1/wallets/execute-params`, `/v1/wallets/transactions`, and `/v1/wallets/transactions/{id}`. L2-authenticated and public direct-service workflows retain their original routes. Builder signing continues to cover the canonical upstream path. General market and trading action paths have a separate gateway mapping migration; these auth changes do not complete that migration.

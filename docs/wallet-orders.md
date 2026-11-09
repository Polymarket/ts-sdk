# Wallet-wide orders and session keys

Use an authenticated Deposit Wallet client to read orders across the wallet owner
and its non-revoked session signers. Expired signers' resting orders are included.

```ts
for await (const page of client.listWalletOpenOrders({
  assetId,
  sessionKeys: [sessionAddress],
})) {
  for (const order of page.items) {
    console.log(order.id, order.signerAddress, order.owner);
  }
}
```

`signerAddress` identifies the signer that placed the order. `makerAddress` is the
Deposit Wallet. `owner` contains the API-key identifier when disclosed, or `null`
when withheld. Prices and sizes are decimal strings. Timestamps are ISO strings.
An order without an expiration has no `expiresAt` property.

The optional filters are `market`, `assetId`, and up to 50 `sessionKeys`. A signer
outside the wallet matches no orders. Pages can be short or empty while another
page remains. Use the paginator, which follows continuation cursors until the
server reports completion. No caller-selected page size is available.

Only the wallet owner can cancel across the wallet:

```ts
const cancellation = await client.cancelWalletOrders({ orderIds: [orderId] });
console.log(cancellation.canceled, cancellation.notCanceled);

await client.cancelWalletOrders({ all: true });
```

Choose exactly one mode. Selected cancellation accepts 1 to 1,000 order hashes.
Partial failures are returned in `notCanceled`. A missing, foreign, or already
cancelled order is not treated as successfully cancelled. The SDK does not split
requests into batches or retry cancellation after a transport failure. Read the
wallet's orders before deciding whether to retry an uncertain cancellation.
Existing `listOpenOrders`, `cancelOrder`, `cancelOrders`, and `cancelAll` retain
their API-key-scoped behavior.

Availability depends on the environment's cancellation rollout. A disabled
endpoint can return a 404 rejection. The SDK preserves that failure and does not
fall back to a narrower cancellation endpoint.

## Session-key authentication

Session-key authorization and revocation require the Deposit Wallet owner's
signature and an `apiKey` authorizer that supports gasless transactions. Supported
choices are `relayerApiKey`, local `builderApiKey` signing, and
`remoteBuilderSigning`. Ordinary account credentials authenticate trading and
session-key listing; they do not authenticate session-key authorization or
revocation on their own.

Use the owner's EOA address with a relayer key:

```ts
const owner = await createSecureClient({
  signer: ownerSigner,
  wallet: depositWallet,
  apiKey: relayerApiKey({
    key: relayerKey,
    address: await ownerSigner.getAddress(),
  }),
});

const authorization = await owner.authorizeSessionKey({
  address: sessionAddress,
  scopes: [SessionKeyKnownScope.CLOB],
});
console.log(authorization.sessionKey, authorization.transaction);

await owner.revokeSessionKey({ address: sessionAddress });
```

The relayer key's `address` is the wallet owner's EOA, rather than the Deposit
Wallet or the session signer. The application generates and protects the session
private key. Authorization resolves after confirmation and active-key registry
readiness. Revocation resolves after registry removal makes the key unusable;
its transaction and order sweep may still be pending. Existing scope and expiry
defaults and return types stay the same.

For builder credentials, configure either authorizer at client creation:

```ts
// Node.js: builderApiKey is exported from @polymarket/client/node.
const localBuilderOwner = await createSecureClient({
  signer: ownerSigner,
  wallet: depositWallet,
  apiKey: builderApiKey(builderCredentials),
});

const remoteBuilderOwner = await createSecureClient({
  signer: ownerSigner,
  wallet: depositWallet,
  apiKey: remoteBuilderSigning({
    url: 'https://app.example.com/api/builder/sign',
  }),
});
```

The selected environment must admit the supplied credential type for session-key
registration. The SDK preserves authentication failures from older deployments;
it does not send an unauthenticated registration when `apiKey` is omitted.

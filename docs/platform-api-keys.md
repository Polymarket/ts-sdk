# Platform API Keys

Platform API Keys identify your application. Bearer credentials identify the signer's session. The server binds the application identity when issuing the challenge and preserves it on refresh. The SDK never accepts a caller-selected `client_id`.

## Server configuration

```ts
import { createSecureClient } from '@polymarket/client';
import { platformApiKey } from '@polymarket/client/node';

const client = await createSecureClient({
  signer,
  wallet,
  apiKey: platformApiKey(process.env.POLYMARKET_PLATFORM_API_KEY!),
  onCredentialsChanged: saveCredentials,
});
```

The local adapter is server-only. It sends `X-API-Key` to gateway operations, including challenge creation, login and L2 credential migration. Login still requires the signer's ownership signature. Refresh and logout go directly to the gateway using session credentials, without another key exchange. A conflicting login key raises the gateway's `RequestRejectedError`. Perps keeps its own endpoint and authentication.

## Browser configuration

```ts
import { createSecureClient, remotePlatformApiKey } from '@polymarket/client';

const client = await createSecureClient({
  signer,
  wallet,
  apiKey: remotePlatformApiKey({
    url: '/api/auth/challenge',
    credentials: 'same-origin',
    headers: () => ({ 'X-CSRF-Token': getCsrfToken() }),
  }),
  onCredentialsChanged: saveCredentials,
});
```

`url` is the complete endpoint, including any query string. The SDK calls it exactly once for challenge creation. Root-relative browser paths and absolute HTTP(S) URLs are supported. Configure application authentication or CSRF headers here; never configure a Platform API Key or SDK bearer credentials. The adapter rejects `X-API-Key` in browser-supplied headers.

The proxy receives only signer, optional wallet, nonce and verification-token challenge input. The signer stays with the browser. Signatures, login tokens, refresh and logout go directly to the gateway. No timer or credential store exists in the adapter; the normal client session owns refresh, callbacks, cancellation and socket renewal. Failed proxy requests are not automatically replayed.

### Backend challenge route

This illustrative server route assumes your application supplies `requireApplicationSession`, whose `canAuthenticateSigner` method checks the caller's permission for the requested signer. Keep that authorization check and CSRF protection appropriate to your application. Do not deploy an unauthenticated public key proxy.

```ts
export async function POST(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  const caller = await requireApplicationSession(request);
  if (!caller) return new Response(null, { status: 401, headers });

  const input = await request.json();
  if (!caller.canAuthenticateSigner(input.signer)) {
    return new Response(null, { status: 403, headers });
  }

  const response = await fetch(
    new URL('/v1/auth/challenge', process.env.POLYMARKET_GATEWAY_URL!),
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.POLYMARKET_PLATFORM_API_KEY!,
      },
      body: JSON.stringify({
        signer: input.signer,
        wallet: input.wallet,
        nonce: input.nonce,
        verification_token: input.verification_token,
      }),
    },
  );
  if (!response.ok) {
    return Response.json(
      { code: 'challenge_rejected', message: 'Challenge rejected' },
      { status: response.status, headers },
    );
  }
  const { challengeId, typedData, expiresAt } = await response.json();
  return Response.json({ challengeId, typedData, expiresAt }, { headers });
}
```

Return only the challenge. Keep the key out of response bodies, headers, browser configuration, storage, logs and traces. Log request IDs and outcomes instead. The example does not create or deploy a production proxy.

## Migrating builder and submission authorization

Use `platformApiKey` for application attribution and `remotePlatformApiKey` for a browser challenge proxy. The `apiKey` slot previously used for builder or submission authorization can now carry a platform adapter. Existing authorization adapters remain supported: `builderApiKey`, `relayerApiKey` and `remoteBuilderSigning` have not been retired or deprecated.

Some operations still require builder signatures or submission credentials. Preserve those explicitly through `legacyApiKey`:

```ts
import { builderApiKey, platformApiKey } from '@polymarket/client/node';

const apiKey = platformApiKey(process.env.POLYMARKET_PLATFORM_API_KEY!, {
  legacyApiKey: builderApiKey(await loadBuilderCredentials()),
});
const client = await createSecureClient({ signer, wallet, apiKey });
```

`legacyApiKey` also accepts `relayerApiKey(...)` where your integration still uses its submission credentials. The existing API supports one builder/submission authorization adapter at a time. The platform adapter keeps the key on gateway requests and delegates the existing builder/submission headers to the supplied adapter. Direct endpoints do not receive the Platform API Key.

A browser can retain its existing signing endpoint:

```ts
const apiKey = remotePlatformApiKey({
  url: '/api/auth/challenge',
  legacyApiKey: remoteBuilderSigning({ url: '/api/builder/sign' }),
});
```

The challenge endpoint never receives signatures or SDK tokens. The existing builder-signing endpoint retains its separate authorization and signing contract. A challenge-only remote adapter does not claim gasless submission support without a compatible builder/submission adapter. Newly derived wallets still use the existing check/deploy workflow, which requires working submission authorization when deployment is needed. Platform-based quota eligibility and builder identity continuity must be verified against the deployed backend before removing existing authorization configuration.

For saved bearer credentials, use the same `createSecureClient({ signer, credentials, apiKey })` workflow; refresh preserves the server-bound application identity. For platform-attributed L2 credential migration, call `publicClient.migrateCredentials` on your server with `platformApiKey`, then restore the resulting pair in the browser. A challenge-only remote adapter rejects direct L2 credential migration with `UserInputError` so it cannot silently drop application attribution or forward L2 ownership proofs to the challenge proxy. Migration itself needs no new signature.

First-party `verificationToken` handling is preserved. A Platform API Key does not give an external session first-party requester socket privileges; external requesters may require REST. Browser price tickets remain separate. See [bearer-session migration](authentication-migration.md) for credential persistence, refresh failure policy and cleanup.

## Release gates

Deterministic tests verify the SDK contract and module boundaries. Deployed key validation, external-origin CORS/edge access, all socket renewal implementations, builder identity and gasless quota continuity must be verified before external release. No SDK configuration change authorizes L2 key retirement or backend deployment.

## Credential administration

Trading credential administration uses the configured direct `clob.rest` endpoint, not the gateway. `createApiKey` and `deriveApiKey` take an explicit L1-signed request. Listing/deleting owner credentials and creating/listing builder credentials require a client restored with L2 key/secret/passphrase credentials; bearer-only clients reject these operations locally with `UserInputError`. No implicit derivation or migration occurs. The gateway has no bearer credential-administration routes.

`revokeBuilderApiKey` instead uses the configured builder signing adapter, including `legacyApiKey` when wrapped by a platform adapter. It requires no owner HMAC credentials. Platform keys and bearer tokens are not attached to direct credential-administration requests. Configure `clob.rest` for the same environment as your credentials; overriding `predictions.rest` alone does not change it.

Client credentials are discriminated by `type`: use `credentials.key` for the current bearer access token or L2 API-key identifier. The session trading identity supplies order payload ownership independently. Supported actions use Predictions; direct compatibility clients do not receive platform-key headers.

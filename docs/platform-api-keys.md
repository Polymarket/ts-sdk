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

The proxy receives a JSON body with only `signer` and optional `wallet`, `nonce` and `verificationToken`, and must return the challenge as JSON. The signer stays with the browser. Signatures, login tokens, refresh and logout go directly to the gateway. No timer or credential store exists in the adapter; the normal client session owns refresh, callbacks, cancellation and socket renewal. Failed proxy requests are not automatically replayed.

### Backend challenge route

This illustrative server route assumes your application supplies `requireApplicationSession`, whose `canAuthenticateSigner` method checks the caller's permission for the requested signer. Keep that authorization check and CSRF protection appropriate to your application. Do not deploy an unauthenticated public key proxy.

```ts
import { createPublicClient, UserInputError } from '@polymarket/client';
import {
  CreatePlatformChallengeError,
  createPlatformChallenge,
  platformApiKey,
} from '@polymarket/client/node';

const polymarket = createPublicClient({
  apiKey: platformApiKey(process.env.POLYMARKET_PLATFORM_API_KEY!),
});

export async function POST(request: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  const caller = await requireApplicationSession(request);
  if (!caller) return new Response(null, { status: 401, headers });

  const input = await request.json();
  if (!caller.canAuthenticateSigner(input.signer)) {
    return new Response(null, { status: 403, headers });
  }

  try {
    const challenge = await createPlatformChallenge(polymarket, input);
    return Response.json(challenge, { headers });
  } catch (error) {
    if (!CreatePlatformChallengeError.isError(error)) throw error;
    const status = error instanceof UserInputError ? 400 : 502;
    return Response.json(
      { code: 'challenge_rejected', message: 'Challenge rejected' },
      { status, headers },
    );
  }
}
```

`createPlatformChallenge` validates the input, sends the Platform API Key only to the gateway and returns only the challenge. Keep the key out of response bodies, headers, browser configuration, storage, logs and traces. Log request IDs and outcomes instead.

## Migrating builder and submission authorization

Use `platformApiKey` for application attribution and `remotePlatformApiKey` for a browser challenge proxy. The `apiKey` slot previously used for builder or submission authorization can now carry a platform adapter. Existing authorization adapters remain supported: `builderApiKey`, `relayerApiKey` and `remoteBuilderSigning` have not been retired or deprecated.

Some operations still require builder signatures or submission credentials. Pass those through `submissionApiKey`:

```ts
import { builderApiKey, platformApiKey } from '@polymarket/client/node';

const apiKey = platformApiKey(process.env.POLYMARKET_PLATFORM_API_KEY!, {
  submissionApiKey: builderApiKey(await loadBuilderCredentials()),
});
const client = await createSecureClient({ signer, wallet, apiKey });
```

`submissionApiKey` also accepts `relayerApiKey(...)` where your integration still uses its submission credentials. The existing API supports one builder/submission authorization adapter at a time. The platform adapter keeps the key on gateway requests and delegates the existing builder/submission headers to the supplied adapter. Direct endpoints do not receive the Platform API Key.

A browser can retain its existing signing endpoint:

```ts
const apiKey = remotePlatformApiKey({
  url: '/api/auth/challenge',
  submissionApiKey: remoteBuilderSigning({ url: '/api/builder/sign' }),
});
```

The challenge endpoint never receives signatures or SDK tokens. The existing builder-signing endpoint retains its separate authorization and signing contract. Gasless actions (wallet deployment, gasless transactions, collateral return and session-key revocation) accept any bearer session, with or without a Platform API Key, or a submission adapter. When a submission adapter is also configured, its builder or relayer headers take precedence for quota and attribution.

For saved bearer credentials, use the same `createSecureClient({ signer, credentials, apiKey })` workflow with the plain `{ accessToken, refreshToken }` pair; refresh preserves the server-bound application identity. Saved L2 credentials are automatically exchanged directly at `/v1/auth/migrate`, including when using `remotePlatformApiKey`. Migration bypasses the challenge proxy, keeps the L2 secret local, and needs no new wallet signature. The remote challenge adapter does not add application attribution to that exchange. When platform attribution is required, migrate on your server with `platformApiKey`, then restore the returned bearer pair in the browser; the gateway determines the resulting attribution.

First-party `verificationToken` handling is preserved. A Platform API Key does not give an external session first-party requester socket privileges; external requesters may require REST. Browser price tickets remain separate. See [bearer-session migration](authentication-migration.md) for credential persistence, refresh failure policy and cleanup.

## Release gates

Deterministic tests verify the SDK contract and module boundaries. Deployed key validation, external-origin CORS/edge access, all socket renewal implementations, builder identity and gasless quota continuity must be verified before external release. No SDK configuration change authorizes L2 key retirement or backend deployment.

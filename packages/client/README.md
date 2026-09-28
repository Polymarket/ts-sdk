# `@polymarket/client`

`@polymarket/client` is the official TypeScript client for building on Polymarket.

## Installation

```bash
pnpm add @polymarket/client
```

## Usage

```ts
import { createPublicClient } from '@polymarket/client';

const client = createPublicClient();

const result = client.listMarkets({
  closed: false,
  pageSize: 3,
});

for await (const page of result) {
  // page.items: Market[] 
}
```

## Authentication and identity

Create a secure client with your wallet-library signer. Existing valid trading
credentials can be passed as `credentials` to avoid another authentication signature.
Fresh credentials use the authentication exchange without automatic retries.

```ts
import { createSecureClient } from '@polymarket/client';

const client = await createSecureClient({ signer, platformApiKey });
const session = await client.openPredictionsSession();
const identity = await session.fetchIdentity();
await session.logout();
```

Opening an identity session asks for a separate wallet ownership signature. Tokens
stay privately in memory. Repeated opens reuse the active session; concurrent
opens and refreshes share one request. Identity reads refresh on demand near expiry.
A failed refresh is reported; another explicit read can try again. An expired
refresh lifetime requires opening a new session and signing again.

Logout blocks local identity reads immediately. If server logout fails, call
`session.logout()` again to retry. It does not revoke trading credentials, close
Perps sessions, or end the secure client's authentication. Previously issued
access tokens remain valid on the server until their expiry. Treat session logout
as an explicit part of your application's cleanup.

The optional `platformApiKey` identifies your application. It is separate from
builder or relayer authorization passed as `apiKey`. Use publishable keys in browser
applications and keep secret keys on the server. `client.fetchIdentity()` reads the
platform key identity; `session.fetchIdentity()` reads the signed wallet identity.

Discovery reads use a single attempt with a five-second response deadline, then
fall back only after connectivity failures or HTTP 502/503/504. Other HTTP errors
and invalid responses propagate. Each request to the API gateway includes
`POLYMARKET_CLIENT` with package and runtime versions, for example
`@polymarket/client@0.12.0:nodejs@24.0.0`. Detection is local, best effort, and uses
`unknown` when a version is unavailable.

For a custom environment, set `gateway.rest` and `gateway.identityIssuer` through
`forkEnvironmentConfig`. The issuer must exactly match the identity service's trusted
issuer configuration; it is not necessarily the gateway URL. Auth operations use a
single ten-second response deadline and never fall back to another service.

## License

MIT

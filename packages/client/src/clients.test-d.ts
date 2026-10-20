import type { BearerCredentials } from '@polymarket/bindings';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { AuthenticatedServiceClient } from './AuthenticatedServiceClient';
import {
  createPublicClient,
  createSecureClient,
  type PublicClient,
  type PublicClientOptions,
  type SecureClient,
  type SecureClientOptions,
} from './clients';
import { ServiceClient as RootServiceClient } from './index';
import type { ServiceClient } from './ServiceClient';
import type { Signer } from './types';

declare const publicClient: PublicClient;
declare const secureClient: SecureClient;
declare const secureOptions: SecureClientOptions;
declare const signer: Signer;

it('keeps retry budgets on reads rather than clients or mutations', () => {
  publicClient.listTrades(
    { pageSize: 100 },
    { retries: 0, signal: new AbortController().signal },
  );
  secureClient.listPositions(undefined, { retries: 5 });
  publicClient.fetchMidpoints([{ assetId: '1' }], { retries: 1 });
  publicClient.predictions.get('/read', { retries: 2 });
  expectTypeOf<PublicClientOptions>().not.toHaveProperty('retry');
  expectTypeOf<SecureClientOptions>().not.toHaveProperty('retry');
  // @ts-expect-error Client creation has no retry setting.
  createPublicClient({ retry: false });
  // @ts-expect-error Secure client creation has no retry setting.
  createSecureClient({ ...secureOptions, retry: false });
  // @ts-expect-error Clients have no retry state or getter.
  publicClient.retry;
  // @ts-expect-error Clients have no retry state or getter.
  secureClient.retry;
  // @ts-expect-error Mutation options cannot opt into optional read retries.
  publicClient.predictions.post('/mutation', { retries: 5 });
  // @ts-expect-error Mutation options cannot opt into optional read retries.
  publicClient.predictions.del('/mutation', { retries: 5 });
});

it('accepts plain bearer or L2 input and exposes bearer credentials', () => {
  createSecureClient({
    signer,
    credentials: { accessToken: 'a', refreshToken: 'r' },
  });
  createSecureClient({
    signer,
    credentials: { key: 'k', secret: 's', passphrase: 'p' },
  });
  const stored: object = { accessToken: 'a', refreshToken: 'r' };
  createSecureClient({ signer, credentials: stored });
  expectTypeOf(publicClient.login({ signer })).toEqualTypeOf<
    Promise<BearerCredentials>
  >();
  expectTypeOf(
    publicClient.migrateCredentials({
      signer: '0x0000000000000000000000000000000000000001',
      credentials: { key: 'k', secret: 's', passphrase: 'p' },
    }),
  ).toEqualTypeOf<Promise<BearerCredentials>>();
  expectTypeOf(secureClient.credentials).toEqualTypeOf<BearerCredentials>();
  createSecureClient({
    signer,
    onCredentialsChanged(credentials) {
      expectTypeOf(credentials).toEqualTypeOf<BearerCredentials>();
    },
  });
  createSecureClient({
    signer,
    async onCredentialsChanged(credentials) {
      expectTypeOf(credentials).toEqualTypeOf<BearerCredentials>();
    },
  });
  expectTypeOf(secureClient.credentials.accessToken).toEqualTypeOf<string>();
  expectTypeOf(secureClient.credentials.refreshToken).toEqualTypeOf<string>();
  expectTypeOf(secureClient.credentials).not.toHaveProperty('type');
});

describe('predictions service types', () => {
  it('exposes the same precise Promise service on public and secure clients', () => {
    const schema = z.object({ count: z.string().transform(Number) });
    expectTypeOf(publicClient.predictions).toEqualTypeOf<ServiceClient>();
    expectTypeOf(
      secureClient.predictions,
    ).toEqualTypeOf<AuthenticatedServiceClient>();
    expectTypeOf(
      publicClient.predictions.get('/reserved', { schema }),
    ).toEqualTypeOf<Promise<{ count: number }>>();
    expectTypeOf(
      publicClient.predictions.post('/reserved', { schema }),
    ).toEqualTypeOf<Promise<{ count: number }>>();
    expectTypeOf(
      publicClient.predictions.patch('/reserved', { schema }),
    ).toEqualTypeOf<Promise<{ count: number }>>();
    expectTypeOf(
      publicClient.predictions.del('/reserved', { schema }),
    ).toEqualTypeOf<Promise<{ count: number }>>();
    expectTypeOf(
      secureClient.predictions.get('/reserved', { schema }),
    ).toEqualTypeOf<Promise<{ count: number }>>();
    expectTypeOf(
      secureClient.predictions.post('/reserved', { schema }),
    ).toEqualTypeOf<Promise<{ count: number }>>();
    expectTypeOf(
      secureClient.predictions.patch('/reserved', { schema }),
    ).toEqualTypeOf<Promise<{ count: number }>>();
    expectTypeOf(
      secureClient.predictions.del('/reserved', { schema }),
    ).toEqualTypeOf<Promise<{ count: number }>>();
    expectTypeOf(publicClient.predictions.get('/reserved')).toEqualTypeOf<
      Promise<unknown>
    >();
    expectTypeOf(
      secureClient.predictions.post<{ count: number }>('/reserved'),
    ).toEqualTypeOf<Promise<{ count: number }>>();
  });

  it('retains binary, empty and raw service result types and existing getters', () => {
    expectTypeOf(
      publicClient.predictions.get('/reserved', { responseType: 'blob' }),
    ).toEqualTypeOf<Promise<Blob>>();
    expectTypeOf(
      secureClient.predictions.get('/reserved', {
        responseType: 'arrayBuffer',
      }),
    ).toEqualTypeOf<Promise<ArrayBuffer>>();
    expectTypeOf(
      publicClient.predictions.post('/reserved', { responseType: 'text' }),
    ).toEqualTypeOf<Promise<string>>();
    expectTypeOf(
      secureClient.predictions.patch('/reserved', { responseType: 'raw' }),
    ).toEqualTypeOf<Promise<Response>>();
    expectTypeOf(
      publicClient.predictions.del('/reserved', { responseType: 'empty' }),
    ).toEqualTypeOf<Promise<void>>();
    expectTypeOf(publicClient.clob).toEqualTypeOf<ServiceClient>();
    expectTypeOf(publicClient.gamma).toEqualTypeOf<ServiceClient>();
    expectTypeOf(publicClient.data).toEqualTypeOf<ServiceClient>();
    expectTypeOf(publicClient.relayer).toEqualTypeOf<ServiceClient>();
    expectTypeOf(secureClient.secureClob).toEqualTypeOf<ServiceClient>();
    expectTypeOf(secureClient.builderGateway).toEqualTypeOf<ServiceClient>();
  });

  it('exports the service type without its constructor from the root entry point', () => {
    expectTypeOf<RootServiceClient>().toEqualTypeOf<ServiceClient>();
    // @ts-expect-error The root entry point exports ServiceClient as a type only.
    new RootServiceClient({ root: 'https://example.com' });
  });
});

it('keeps platform secrets server-only and accepts the remote adapter on the normal client surface', async () => {
  const browserSafe = await import('./index');
  // biome-ignore lint/style/noRestrictedImports: Verify the public server-only factory type.
  const server = await import('./node');
  expectTypeOf(server.platformApiKey('pm_sk_synthetic')).toEqualTypeOf<
    import('./types').ApiKeyAuthorization
  >();
  const adapter = browserSafe.remotePlatformApiKey({
    url: '/api/auth/challenge',
  });
  createSecureClient({ signer: secureOptions.signer, apiKey: adapter });
  // @ts-expect-error Server-held Platform API Keys must not be exposed from the browser entrypoint.
  browserSafe.platformApiKey;
  browserSafe.remotePlatformApiKey({
    url: '/challenge',
    // @ts-expect-error Browser configuration has no Platform API Key secret field.
    key: 'pm_sk_synthetic',
  });
});

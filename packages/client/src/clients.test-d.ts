import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
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

declare const publicClient: PublicClient;
declare const secureClient: SecureClient;
declare const secureOptions: SecureClientOptions;

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

describe('predictions service types', () => {
  it('exposes the same precise Promise service on public and secure clients', () => {
    const schema = z.object({ count: z.string().transform(Number) });
    expectTypeOf(publicClient.predictions).toEqualTypeOf<ServiceClient>();
    expectTypeOf(secureClient.predictions).toEqualTypeOf<ServiceClient>();
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

it('exposes bearer credentials, credential migration and sync/async persistence on public client workflows', () => {
  expectTypeOf(secureClient.credentials).toEqualTypeOf<
    import('./clients').ClientCredentials
  >();
  expectTypeOf(
    publicClient.login({
      signer: secureOptions.signer,
      wallet: '0x0000000000000000000000000000000000000001',
    }),
  ).toEqualTypeOf<Promise<import('@polymarket/bindings').BearerCredentials>>();
  expectTypeOf(
    publicClient.migrateCredentials({
      signer: '0x0000000000000000000000000000000000000001',
      credentials: {
        key: 'saved-key',
        secret: 'saved-secret',
        passphrase: 'saved-passphrase',
      },
    }),
  ).toEqualTypeOf<Promise<import('@polymarket/bindings').BearerCredentials>>();
  createSecureClient({
    signer: secureOptions.signer,
    credentials: { accessToken: 'saved-access', refreshToken: 'saved-refresh' },
    onCredentialsChanged: (pair) => {
      expectTypeOf(pair.accessToken).toEqualTypeOf<string>();
    },
  });
  createSecureClient({
    signer: secureOptions.signer,
    onCredentialsChanged: async (pair) => {
      expectTypeOf(pair.refreshToken).toEqualTypeOf<string>();
    },
  });
  const credentials = secureClient.credentials;
  if ('key' in credentials) {
    expectTypeOf(credentials.secret).toEqualTypeOf<string>();
    expectTypeOf(credentials.passphrase).toEqualTypeOf<string>();
  } else {
    expectTypeOf(credentials.accessToken).toEqualTypeOf<string>();
    expectTypeOf(credentials.refreshToken).toEqualTypeOf<string>();
  }
});

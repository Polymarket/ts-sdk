import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { PublicClient, SecureClient } from './clients';
import type { ServiceClient } from './ServiceClient';

declare const publicClient: PublicClient;
declare const secureClient: SecureClient;

describe('reserved predictions service types', () => {
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
});

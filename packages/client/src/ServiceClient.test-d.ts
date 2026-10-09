import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { ServiceClient } from './ServiceClient';

declare const client: ServiceClient;

describe('service response types', () => {
  it('accepts an empty client configuration and retains every verb signature', () => {
    const empty = new ServiceClient({ retry: false });
    expectTypeOf(empty.get('/state')).toEqualTypeOf<Promise<unknown>>();
    expectTypeOf(empty.post('/state')).toEqualTypeOf<Promise<unknown>>();
    expectTypeOf(empty.patch('/state')).toEqualTypeOf<Promise<unknown>>();
    expectTypeOf(empty.del('/state')).toEqualTypeOf<Promise<unknown>>();
  });

  it('infers transformed schema outputs on every verb and leaves unchecked JSON unknown', () => {
    const schema = z.object({ count: z.string().transform(Number) });
    expectTypeOf(client.get('/state', { schema })).toEqualTypeOf<
      Promise<{ count: number }>
    >();
    expectTypeOf(client.post('/state', { schema })).toEqualTypeOf<
      Promise<{ count: number }>
    >();
    expectTypeOf(client.patch('/state', { schema })).toEqualTypeOf<
      Promise<{ count: number }>
    >();
    expectTypeOf(client.del('/state', { schema })).toEqualTypeOf<
      Promise<{ count: number }>
    >();
    expectTypeOf(client.get('/state')).toEqualTypeOf<Promise<unknown>>();
    expectTypeOf(client.post('/state')).toEqualTypeOf<Promise<unknown>>();
    expectTypeOf(client.patch('/state')).toEqualTypeOf<Promise<unknown>>();
    expectTypeOf(client.del('/state')).toEqualTypeOf<Promise<unknown>>();
    expectTypeOf(client.get<{ count: number }>('/state')).toEqualTypeOf<
      Promise<{ count: number }>
    >();
  });

  it('keeps each response mode precise and JSON schemas out of non-JSON modes', () => {
    expectTypeOf(client.get('/file', { responseType: 'blob' })).toEqualTypeOf<
      Promise<Blob>
    >();
    expectTypeOf(
      client.get('/file', { responseType: 'arrayBuffer' }),
    ).toEqualTypeOf<Promise<ArrayBuffer>>();
    expectTypeOf(client.post('/state', { responseType: 'text' })).toEqualTypeOf<
      Promise<string>
    >();
    expectTypeOf(client.patch('/state', { responseType: 'raw' })).toEqualTypeOf<
      Promise<Response>
    >();
    expectTypeOf(client.del('/state', { responseType: 'empty' })).toEqualTypeOf<
      Promise<void>
    >();
    // @ts-expect-error Schemas validate parsed JSON, not Blob responses.
    client.get('/file', { responseType: 'blob', schema: z.string() });
    // @ts-expect-error Raw responses keep body ownership with the caller.
    client.patch('/state', { responseType: 'raw', schema: z.string() });
    // @ts-expect-error Empty responses do not contain JSON to validate.
    client.del('/state', { responseType: 'empty', schema: z.string() });
  });
});

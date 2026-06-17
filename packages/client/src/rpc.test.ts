import { expectEvmAddress } from '@polymarket/types';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RequestRejectedError, UnexpectedResponseError } from './errors';
import { JsonRpcClient } from './rpc';

const root = 'http://localhost:4012';
const server = setupServer();

describe('JsonRpcClient', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('performs eth_call requests', async () => {
    const to = expectEvmAddress('0x0000000000000000000000000000000000000001');
    server.use(
      http.post(root, async ({ request }) => {
        await expect(request.json()).resolves.toMatchObject({
          method: 'eth_call',
          params: [{ to, data: '0x12345678' }, 'latest'],
        });

        return HttpResponse.json({
          jsonrpc: '2.0',
          id: 1,
          result: '0xabcdef',
        });
      }),
    );
    const client = new JsonRpcClient({ url: root });

    await expect(client.ethCall({ to, data: '0x12345678' })).resolves.toBe(
      '0xabcdef',
    );
  });

  it('performs batched eth_call requests', async () => {
    const to = expectEvmAddress('0x0000000000000000000000000000000000000001');
    server.use(
      http.post(root, async ({ request }) => {
        await expect(request.json()).resolves.toEqual([
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [{ to, data: '0x12345678' }, 'latest'],
          },
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'eth_call',
            params: [{ to, data: '0xabcdef12' }, 'latest'],
          },
        ]);

        return HttpResponse.json([
          { jsonrpc: '2.0', id: 2, result: '0xbbbb' },
          { jsonrpc: '2.0', id: 1, result: '0xaaaa' },
        ]);
      }),
    );
    const client = new JsonRpcClient({ url: root });

    await expect(
      client.ethCallBatch([
        { to, data: '0x12345678' },
        { to, data: '0xabcdef12' },
      ]),
    ).resolves.toEqual(['0xaaaa', '0xbbbb']);
  });

  it('recovers failed eth_call batches while preserving result order', async () => {
    const to = expectEvmAddress('0x0000000000000000000000000000000000000001');
    let requestCount = 0;

    server.use(
      http.post(root, async ({ request }) => {
        requestCount += 1;

        const body = (await request.json()) as
          | {
              id: number;
              params: [{ data: string }];
            }
          | unknown[];

        if (Array.isArray(body)) {
          return new HttpResponse(null, { status: 500 });
        }

        return HttpResponse.json({
          jsonrpc: '2.0',
          id: body.id,
          result: body.params[0].data,
        });
      }),
    );
    const client = new JsonRpcClient({ url: root });

    await expect(
      client.ethCallBatch([
        { to, data: '0x11111111' },
        { to, data: '0x22222222' },
        { to, data: '0x33333333' },
        { to, data: '0x44444444' },
      ]),
    ).resolves.toEqual([
      '0x11111111',
      '0x22222222',
      '0x33333333',
      '0x44444444',
    ]);
    expect(requestCount).toBe(7);
  });

  it('wraps JSON-RPC errors as rejected requests', async () => {
    const to = expectEvmAddress('0x0000000000000000000000000000000000000001');
    server.use(
      http.post(root, () =>
        HttpResponse.json({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32_000, message: 'execution reverted' },
        }),
      ),
    );
    const client = new JsonRpcClient({ url: root });

    await expect(client.ethCall({ to, data: '0x12345678' })).rejects.toEqual(
      expect.objectContaining({
        cause: { code: -32_000, message: 'execution reverted' },
        message: 'JSON-RPC eth_call failed: execution reverted',
        name: 'RequestRejectedError',
        status: 200,
      }),
    );
  });

  it('rejects malformed eth_call result data', async () => {
    const to = expectEvmAddress('0x0000000000000000000000000000000000000001');
    server.use(
      http.post(root, () =>
        HttpResponse.json({ jsonrpc: '2.0', id: 1, result: 'not-hex' }),
      ),
    );
    const client = new JsonRpcClient({ url: root });

    await expect(
      client.ethCall({ to, data: '0x12345678' }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('maps non-success HTTP responses to rejected requests', async () => {
    const to = expectEvmAddress('0x0000000000000000000000000000000000000001');
    server.use(http.post(root, () => new HttpResponse(null, { status: 502 })));
    const client = new JsonRpcClient({ url: root });

    await expect(
      client.ethCall({ to, data: '0x12345678' }),
    ).rejects.toBeInstanceOf(RequestRejectedError);
  });
});

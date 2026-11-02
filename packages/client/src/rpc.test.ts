import { expectEvmAddress } from '@polymarket/types';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  RequestAbortedError,
  RequestRejectedError,
  UnexpectedResponseError,
} from './errors';
import { JsonRpcClient } from './rpc';

const root = 'http://localhost:4012';
const server = setupServer();

describe('JsonRpcClient', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  afterEach(() => {
    server.resetHandlers();
    vi.useRealTimers();
  });

  afterAll(() => {
    server.close();
  });

  it.each([
    'single',
    'batch',
    'estimate',
  ] as const)('uses a 30-second default and explicit timeouts for %s RPC requests', async (mode) => {
    vi.useFakeTimers();
    const to = expectEvmAddress('0x0000000000000000000000000000000000000001');
    const request = { to, data: '0x1234' as const };
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30_100));
      return Response.json(
        mode !== 'batch'
          ? { jsonrpc: '2.0', id: 1, result: '0xaaaa' }
          : [
              { jsonrpc: '2.0', id: 1, result: '0xaaaa' },
              { jsonrpc: '2.0', id: 2, result: '0xbbbb' },
            ],
      );
    });
    const client = new JsonRpcClient({ url: root, fetch });
    function run(timeout?: number | false) {
      if (mode === 'estimate')
        return client.ethEstimateGas(request, { timeout });
      return mode === 'single'
        ? client.ethCall(request, { timeout })
        : client.ethCallBatch([request, request], { timeout });
    }
    const timedOut = expect(run(20)).rejects.toMatchObject({
      name: 'TransportError',
      cause: { name: 'TimeoutError' },
    });
    const disabled = run(false);
    const longer = run(60_000);
    const defaultRequest = run();
    let defaultSettled = false;
    void defaultRequest.then(
      () => {
        defaultSettled = true;
      },
      () => {
        defaultSettled = true;
      },
    );
    const defaultTimeout = expect(defaultRequest).rejects.toMatchObject({
      name: 'TransportError',
      cause: { name: 'TimeoutError' },
    });
    await vi.advanceTimersByTimeAsync(29_999);
    await timedOut;
    expect(defaultSettled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await defaultTimeout;
    expect(defaultSettled).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    const expected =
      mode === 'estimate'
        ? 0xaaaan
        : mode === 'single'
          ? '0xaaaa'
          : ['0xaaaa', '0xbbbb'];
    await expect(disabled).resolves.toEqual(expected);
    await expect(longer).resolves.toEqual(expected);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('retains a disabled timeout when a rejected batch splits into single calls', async () => {
    vi.useFakeTimers();
    const to = expectEvmAddress('0x0000000000000000000000000000000000000001');
    const request = { to, data: '0x1234' as const };
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const body = await new Request(input).json();
      await new Promise((resolve) => setTimeout(resolve, 30_100));
      return Array.isArray(body)
        ? new Response(null, { status: 500 })
        : Response.json({ jsonrpc: '2.0', id: 1, result: '0xaaaa' });
    });
    const client = new JsonRpcClient({ url: root, fetch });
    const result = client.ethCallBatch([request, request], { timeout: false });
    await vi.advanceTimersByTimeAsync(60_200);
    await expect(result).resolves.toEqual(['0xaaaa', '0xaaaa']);
    expect(fetch).toHaveBeenCalledTimes(3);
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

  it('performs eth_estimateGas requests', async () => {
    const from = expectEvmAddress('0x0000000000000000000000000000000000000001');
    const to = expectEvmAddress('0x0000000000000000000000000000000000000002');
    server.use(
      http.post(root, async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_estimateGas',
          params: [
            {
              data: '0x12345678',
              from,
              to,
            },
          ],
        });

        return HttpResponse.json({
          jsonrpc: '2.0',
          id: 1,
          result: '0x15650',
        });
      }),
    );
    const client = new JsonRpcClient({ url: root });

    await expect(
      client.ethEstimateGas({
        data: '0x12345678',
        from,
        to,
      }),
    ).resolves.toBe(87_632n);
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

  it('splits a failed batch even when retries are disabled', async () => {
    const to = expectEvmAddress('0x0000000000000000000000000000000000000001');
    let requestCount = 0;
    server.use(
      http.post(root, () => {
        requestCount += 1;
        return new HttpResponse(null, { status: 503 });
      }),
    );
    const client = new JsonRpcClient({ url: root });

    await expect(
      client.ethCallBatch([
        { to, data: '0x11111111' },
        { to, data: '0x22222222' },
      ]),
    ).rejects.toMatchObject({ name: 'RequestRejectedError', status: 503 });
    expect(requestCount).toBe(3);
  });

  it.each([
    false,
    true,
  ])('preserves cancellation while parsing a response (batch: %s)', async (batch) => {
    const to = expectEvmAddress('0x0000000000000000000000000000000000000001');
    const controller = new AbortController();
    const reason = new Error('Query replaced');
    const parsing = Promise.withResolvers<void>();
    const body = Promise.withResolvers<unknown>();
    const response = new Response();
    vi.spyOn(response, 'json').mockImplementation(() => {
      parsing.resolve();
      return body.promise;
    });
    const fetch = vi.fn(async () => response);
    const client = new JsonRpcClient({ url: root, fetch });
    const operation = batch
      ? client.ethCallBatch(
          [
            { to, data: '0x11111111' },
            { to, data: '0x22222222' },
          ],
          { signal: controller.signal },
        )
      : client.ethCall(
          { to, data: '0x11111111' },
          { signal: controller.signal },
        );
    const rejected = expect(operation).rejects.toMatchObject({
      name: 'RequestAbortedError',
      cause: reason,
    });

    await parsing.promise;
    controller.abort(reason);
    await rejected;
    await expect(operation).rejects.toBeInstanceOf(RequestAbortedError);
    expect(fetch).toHaveBeenCalledTimes(1);
    // Late body failure remains observed after the caller stops awaiting it.
    body.reject(new Error('Body stream closed'));
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

import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { z } from 'zod';
import { SendOrderHeartbeatError } from './actions/order-heartbeats';
import { createPublicClient } from './clients';
import { OrderHeartbeatMismatchError, RequestRejectedError } from './errors';
import { buildHmacSignature } from './hmac';
import { GatewayKnownErrorCode } from './index';
import { paginate } from './pagination';
import { ServiceClient, type ServiceRequest } from './ServiceClient';

const root = 'http://localhost:4011';
const server = setupServer();

describe('ServiceClient', () => {
  it.each([
    'get',
    'postRead',
    'getWorkflow',
    'post',
    'patch',
    'del',
  ] as const)('applies a per-request timeout to %s without changing other calls', async (method) => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30_100));
      return Response.json({ ok: true });
    });
    const client = new ServiceClient({ root, fetch });
    function request(timeout?: number | false): Promise<unknown> {
      switch (method) {
        case 'get':
          return client.get('/slow', { timeout, retries: 0 });
        case 'postRead':
          return client.postRead('/slow', { timeout, retries: 0 });
        case 'getWorkflow':
          return client.getWorkflow('/slow', { timeout });
        case 'post':
          return client.post('/slow', { timeout });
        case 'patch':
          return client.patch('/slow', { timeout });
        case 'del':
          return client.del('/slow', { timeout });
      }
    }
    const timedOut = expect(request(20)).rejects.toMatchObject({
      name: 'TransportError',
      cause: { name: 'TimeoutError' },
    });
    const disabled = request(false);
    const longer = request(60_000);
    const defaultRequest = request();
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
    await expect(disabled).resolves.toEqual({ ok: true });
    await expect(longer).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('keeps cancellation available when the timeout is disabled', async () => {
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const client = new ServiceClient({
      root,
      fetch: async () => {
        started.resolve();
        return new Promise<Response>(() => {});
      },
    });
    const pending = client.get('/slow', {
      timeout: false,
      signal: controller.signal,
    });
    await started.promise;
    controller.abort('disposed');
    await expect(pending).rejects.toMatchObject({
      name: 'RequestAbortedError',
      cause: 'disposed',
    });
  });

  it('signs the exact heartbeat JSON in a single request', async () => {
    const observed: Array<{
      path: string;
      body: string;
      signature: string | null;
    }> = [];
    server.use(
      http.post(`${root}/*`, async ({ request }) => {
        observed.push({
          path: new URL(request.url).pathname,
          body: await request.text(),
          signature: request.headers.get('POLY_SIGNATURE'),
        });
        return HttpResponse.json({ heartbeat_id: 'next-id' });
      }),
    );
    const client = new ServiceClient({
      root,
      resolveHeaders: async ({ method, path, body }) => ({
        POLY_SIGNATURE: await buildHmacSignature(
          'dGVzdA==',
          1,
          method,
          path,
          body,
        ),
      }),
    });
    await client.post('/v1/heartbeats', {
      json: { heartbeat_id: 'current-id' },
      retry: false,
    });
    expect(observed[0]).toEqual({
      path: '/v1/heartbeats',
      body: '{"heartbeat_id":"current-id"}',
      signature: await buildHmacSignature(
        'dGVzdA==',
        1,
        'POST',
        '/v1/heartbeats',
        '{"heartbeat_id":"current-id"}',
      ),
    });
    expect(observed).toHaveLength(1);
  });

  it.each([
    [root, 'expected-id'],
    [root, ''],
    [`${root}/prefix`, 'expected-id'],
    [`${root}/prefix`, ''],
  ])('preserves expected heartbeat ID at %s (%j) in one attempt', async (serviceRoot, heartbeatId) => {
    let requests = 0;
    server.use(
      http.post(`${serviceRoot}/v1/heartbeats`, () => {
        requests++;
        return HttpResponse.json(
          { error_msg: 'Invalid Heartbeat ID', heartbeat_id: heartbeatId },
          { status: 400 },
        );
      }),
    );
    const client = new ServiceClient({ root: serviceRoot });
    const result = await client
      .post('/v1/heartbeats', {
        json: { heartbeat_id: 'stale-id' },
        retry: false,
      })
      .catch((error: unknown) => error);
    expect(result).toBeInstanceOf(OrderHeartbeatMismatchError);
    expect(result).toBeInstanceOf(RequestRejectedError);
    expect(SendOrderHeartbeatError.isError(result)).toBe(true);
    expect(result).toMatchObject({
      name: 'OrderHeartbeatMismatchError',
      status: 400,
      heartbeatId,
    });
    expect(requests).toBe(1);
  });

  it.each([
    root,
    `${root}/prefix`,
  ])('keeps malformed heartbeat payload rejections as generic rejections at %s', async (serviceRoot) => {
    server.use(
      http.post(`${serviceRoot}/v1/heartbeats`, () =>
        HttpResponse.json({ error: 'Invalid payload' }, { status: 400 }),
      ),
    );
    const client = new ServiceClient({ root: serviceRoot });
    const result = await client
      .post('/v1/heartbeats', { retry: false })
      .catch((error: unknown) => error);
    expect(result).toBeInstanceOf(RequestRejectedError);
    expect(result).not.toBeInstanceOf(OrderHeartbeatMismatchError);
    expect(result).toHaveProperty('name', 'RequestRejectedError');
  });

  it.each([
    root,
    `${root}/prefix`,
  ])('does not reinterpret unrelated errors containing a heartbeat ID at %s', async (serviceRoot) => {
    server.use(
      http.post(`${serviceRoot}/other-route`, () =>
        HttpResponse.json(
          { error_msg: 'Invalid Heartbeat ID', heartbeat_id: 'expected-id' },
          { status: 400 },
        ),
      ),
    );
    const client = new ServiceClient({ root: serviceRoot });
    await expect(client.post('/other-route')).rejects.not.toBeInstanceOf(
      OrderHeartbeatMismatchError,
    );
  });

  describe('per-request read retry budgets', () => {
    it('gives each retry a fresh timeout and excludes retry waits', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const starts: number[] = [];
      const fetch = vi.fn<typeof globalThis.fetch>(async () => {
        starts.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        if (starts.length === 1) {
          return new Response(null, {
            status: 429,
            headers: { 'retry-after': '1' },
          });
        }
        if (starts.length === 2) throw new TypeError('connection reset');
        return Response.json({ ok: true });
      });
      const result = new ServiceClient({ root, fetch }).get('/read', {
        retries: 2,
      });
      await vi.runAllTimersAsync();
      await expect(result).resolves.toEqual({ ok: true });
      expect(starts).toEqual([0, 21_000, 41_600]);
      expect(Date.now()).toBe(61_600);
    });

    it('does not retry a timeout even with a remaining read retry budget', async () => {
      vi.useFakeTimers();
      const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(() => {}));
      const result = expect(
        new ServiceClient({ root, fetch }).get('/read', { retries: 5 }),
      ).rejects.toMatchObject({
        name: 'TransportError',
        cause: { name: 'TimeoutError' },
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await result;
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
      undefined,
      0,
      1,
      2,
      3,
      4,
      5,
    ])('shares retries=%s across alternating transport failures and rate limits', async (retries) => {
      vi.useFakeTimers();
      let attempts = 0;
      const fetch = vi.fn<typeof globalThis.fetch>(async () => {
        attempts++;
        if (attempts % 2 === 1) throw new TypeError('connection reset');
        return new Response(null, {
          status: 429,
          headers: { 'retry-after': '0' },
        });
      });
      const client = new ServiceClient({ root, fetch });
      const result = client
        .get('/read', { retries, timeout: false })
        .catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      expect(attempts).toBe(1 + (retries ?? 2));
      expect(await result).toMatchObject({
        name: attempts % 2 === 1 ? 'TransportError' : 'RateLimitError',
      });
    });

    it.each([
      'get',
      'postRead',
    ] as const)('recovers through one shared budget for %s reads', async (method) => {
      vi.useFakeTimers();
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(
          new Response(null, { status: 429, headers: { 'retry-after': '0' } }),
        )
        .mockRejectedValueOnce(new TypeError('connection reset'))
        .mockResolvedValueOnce(Response.json({ count: '42' }));
      const client = new ServiceClient({ root, fetch });
      const options = {
        retries: 2,
        schema: z.object({ count: z.string().transform(Number) }),
      };
      const result =
        method === 'get'
          ? client.get('/read', options)
          : client.postRead('/read', options);
      await vi.runAllTimersAsync();
      expect(await result).toEqual({ count: 42 });
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it.each([
      -1,
      6,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '2',
      null,
      false,
    ])('rejects invalid retries=%s before signing or dispatch', async (retries) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const resolveHeaders = vi.fn(async () => ({}));
      const client = new ServiceClient({ root, fetch, resolveHeaders });
      await expect(
        client.get('/read', { retries: retries as number }),
      ).rejects.toMatchObject({ name: 'UserInputError' });
      expect(fetch).not.toHaveBeenCalled();
      expect(resolveHeaders).not.toHaveBeenCalled();
    });

    it.each([
      undefined,
      '2',
      '6',
    ])('honors the server delay %s or surfaces long waits', async (retryAfter) => {
      vi.useFakeTimers();
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 429,
            headers:
              retryAfter === undefined ? {} : { 'retry-after': retryAfter },
          }),
        )
        .mockResolvedValueOnce(Response.json('served'));
      const client = new ServiceClient({ root, fetch });
      const result = client
        .get('/read', { timeout: false })
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      if (retryAfter === '6') {
        expect(await result).toMatchObject({
          name: 'RateLimitError',
          retryAfter: 6,
        });
        expect(vi.getTimerCount()).toBe(0);
      } else {
        const delay = Number(retryAfter ?? '1') * 1000;
        await vi.advanceTimersByTimeAsync(delay - 1);
        expect(fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(await result).toBe('served');
        expect(fetch).toHaveBeenCalledTimes(2);
      }
    });

    it('cancels a rate-limit wait without spending another attempt', async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () => new Response(null, { status: 429 }),
      );
      const client = new ServiceClient({ root, fetch });
      const result = client
        .get('/read', { signal: controller.signal, timeout: false })
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);
      controller.abort('query replaced');
      expect(await result).toMatchObject({
        name: 'RequestAbortedError',
        cause: 'query replaced',
      });
      await vi.runAllTimersAsync();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('gives concurrent requests independent budgets', async () => {
      vi.useFakeTimers();
      const attempts = new Map<string, number>();
      const client = new ServiceClient({
        root,
        fetch: async (input) => {
          const path = new URL(new Request(input).url).pathname;
          attempts.set(path, (attempts.get(path) ?? 0) + 1);
          return new Response(null, {
            status: 429,
            headers: { 'retry-after': '0' },
          });
        },
      });
      const results = Promise.all([
        client.get('/once', { retries: 0 }).catch((error: unknown) => error),
        client.get('/retry', { retries: 2 }).catch((error: unknown) => error),
      ]);
      await vi.runAllTimersAsync();
      expect(await results).toEqual([
        expect.objectContaining({ name: 'RateLimitError' }),
        expect.objectContaining({ name: 'RateLimitError' }),
      ]);
      expect(Object.fromEntries(attempts)).toEqual({ '/once': 1, '/retry': 3 });
    });

    it('starts a fresh budget for each pagination request and continuation', async () => {
      vi.useFakeTimers();
      let attempts = 0;
      const client = new ServiceClient({
        root,
        fetch: async (input) => {
          attempts++;
          if (attempts % 2 === 1) throw new TypeError('connection reset');
          const cursor = new URL(new Request(input).url).searchParams.get(
            'cursor',
          );
          return Response.json(
            cursor === null
              ? { items: ['first'], hasMore: true, nextCursor: 'next-page' }
              : { items: ['second'], hasMore: false },
          );
        },
      });
      const pages = paginate((cursor) =>
        client.get('/page', {
          params: new URLSearchParams(cursor === undefined ? {} : { cursor }),
          schema: z.object({
            items: z.array(z.string()),
            hasMore: z.boolean(),
            nextCursor: PaginationCursorSchema.optional(),
          }),
          retries: 1,
        }),
      );
      const first = pages.firstPage();
      await vi.runAllTimersAsync();
      const firstPage = await first;
      expect(firstPage.items).toEqual(['first']);
      const continuation = (async () => {
        const items: string[] = [];
        for await (const page of pages.from(firstPage.nextCursor))
          items.push(...page.items);
        return items;
      })();
      await vi.runAllTimersAsync();
      expect(await continuation).toEqual(['second']);
      expect(attempts).toBe(4);
    });
  });
  describe('workflow GET retry policy', () => {
    it('surfaces rate limits without replaying a GET command', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response(null, { status: 429, headers: { 'retry-after': '0' } }),
      );
      const client = new ServiceClient({ root, fetch });
      await expect(
        client.getWorkflow('/balance-allowance/update', {
          responseType: 'empty',
        }),
      ).rejects.toMatchObject({ name: 'RateLimitError', retryAfter: 0 });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('retains existing transport recovery for workflow GETs', async () => {
      vi.useFakeTimers();
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValueOnce(new TypeError('connection reset'))
        .mockRejectedValueOnce(new TypeError('connection reset'))
        .mockResolvedValueOnce(Response.json({ ok: true }));
      const client = new ServiceClient({ root, fetch });
      const result = client.getWorkflow('/workflow', {
        schema: z.object({ ok: z.boolean() }),
      });
      await vi.runAllTimersAsync();
      expect(await result).toEqual({ ok: true });
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });
  describe('gateway error and retry policy', () => {
    it.each([
      'json',
      'blob',
      'arrayBuffer',
      'text',
      'empty',
    ] as const)('preserves gateway diagnostics in %s mode without replaying a 502 cancel', async (responseType) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json(
          {
            code: 'cancel_outcome_unknown',
            message:
              'Cancellation may have taken effect. Check open orders before retrying.',
          },
          { status: 502 },
        ),
      );
      const client = createPublicClient({ fetch });
      await expect(
        client.predictions.del('/cancel-all', { responseType }),
      ).rejects.toMatchObject({
        name: 'RequestRejectedError',
        status: 502,
        code: 'cancel_outcome_unknown',
        message: expect.stringContaining('Check open orders before retrying.'),
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each([
      'post',
      'patch',
      'del',
    ] as const)('never replays a prediction %s after a dropped connection', async (method) => {
      vi.useFakeTimers();
      const failure = new TypeError('connection dropped after dispatch');
      const fetch = vi.fn<typeof globalThis.fetch>(async () => {
        throw failure;
      });
      const client = createPublicClient({ fetch });
      // A JavaScript caller's stray read control must not enable mutation replay.
      const options = { json: {}, retries: 5 };
      const result = client.predictions[method]('/mutation', options).catch(
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await result).toMatchObject({
        name: 'TransportError',
        cause: failure,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('retains safe GET transport retries and explicit retry opt-out', async () => {
      vi.useFakeTimers();
      const fetch = vi.fn<typeof globalThis.fetch>(async () => {
        throw new TypeError('connection dropped');
      });
      const client = createPublicClient({ fetch });
      const result = client.predictions
        .get('/ping')
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await result).toMatchObject({ name: 'TransportError' });
      expect(fetch).toHaveBeenCalledTimes(3);
      fetch.mockClear();
      await expect(
        client.predictions.get('/ping', { retries: 0 }),
      ).rejects.toMatchObject({ name: 'TransportError' });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each([
      null,
      [],
      'invalid',
      { code: 'invalid_query_param' },
      { code: 123, message: 'invalid query' },
      { code: 'invalid_query_param', message: { detail: 'invalid query' } },
      { error: { detail: 'invalid query' } },
      { error: 'invalid query', retry_after_seconds: -1 },
      { error: 'invalid query', retry_after_seconds: '5' },
    ])('handles JSON rejection values without transport errors: %j', async (body) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json(body, { status: 400 }),
      );
      const client = new ServiceClient({ root, fetch });
      await expect(client.get('/invalid')).rejects.toMatchObject({
        name: 'RequestRejectedError',
        status: 400,
        code: undefined,
        message: expect.stringContaining('unreadable response body'),
      });
    });

    it.each([
      GatewayKnownErrorCode.InvalidQueryParam,
      'future_gateway_code',
    ])('preserves native rejection code %s and its message', async (code) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({ code, message: 'Invalid page size' }, { status: 400 }),
      );
      const client = new ServiceClient({ root, fetch });
      await expect(client.get('/invalid')).rejects.toMatchObject({
        name: 'RequestRejectedError',
        status: 400,
        code,
        message: expect.stringContaining('Invalid page size'),
      });
    });

    it('preserves legacy error/code/retry hints and legacy message precedence', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json(
          {
            error: 'legacy error',
            message: 'other message',
            code: 'legacy_code',
            retry_after_seconds: 5,
          },
          { status: 422 },
        ),
      );
      const client = new ServiceClient({ root, fetch });
      await expect(client.get('/legacy')).rejects.toMatchObject({
        name: 'RequestRejectedError',
        code: 'legacy_code',
        retryAfter: 5,
        message: expect.stringContaining('legacy error'),
      });
    });

    it.each([
      {
        body: { error: 'upstream rejection', code: null },
        code: undefined,
        retryAfter: undefined,
      },
      {
        body: {
          error: 'upstream rejection',
          code: 'upstream_code',
          retry_after_seconds: null,
        },
        code: 'upstream_code',
        retryAfter: undefined,
      },
      {
        body: {
          error: 'upstream rejection',
          code: null,
          retry_after_seconds: 5,
        },
        code: undefined,
        retryAfter: 5,
      },
      {
        body: {
          error: 'upstream rejection',
          message: 'other message',
          code: 'upstream_code',
          retry_after_seconds: null,
        },
        code: 'upstream_code',
        retryAfter: undefined,
      },
      {
        body: {
          error: 'upstream rejection',
          message: 'other message',
          code: null,
          retry_after_seconds: 0,
        },
        code: undefined,
        retryAfter: 0,
      },
      {
        body: {
          error: 'upstream rejection',
          message: 'other message',
          code: null,
          retry_after_seconds: null,
        },
        code: undefined,
        retryAfter: undefined,
      },
    ])('retains upstream diagnostics with nullable hints: $body', async ({
      body,
      code,
      retryAfter,
    }) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json(body, { status: 422 }),
      );
      const client = new ServiceClient({ root, fetch });
      await expect(client.get('/nullable')).rejects.toMatchObject({
        name: 'RequestRejectedError',
        status: 422,
        message: expect.stringContaining('upstream rejection'),
        code,
        retryAfter,
      });
    });

    it.each([
      { hint: 5, retryAfter: 5 },
      { hint: 0, retryAfter: 0 },
      { hint: null, retryAfter: undefined },
      { hint: undefined, retryAfter: undefined },
    ])('retains native retry hint $hint', async ({ hint, retryAfter }) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json(
          {
            code: GatewayKnownErrorCode.InvalidQueryParam,
            message: 'Invalid page size',
            retry_after_seconds: hint,
          },
          { status: 400 },
        ),
      );
      const client = new ServiceClient({ root, fetch });
      await expect(client.get('/native-hint')).rejects.toMatchObject({
        name: 'RequestRejectedError',
        status: 400,
        message: expect.stringContaining('Invalid page size'),
        code: GatewayKnownErrorCode.InvalidQueryParam,
        retryAfter,
      });
    });

    it('leaves ambiguous raw responses inspectable without mutation replay', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json(
          { code: 'cancel_outcome_unknown', message: 'Check before retrying' },
          { status: 502 },
        ),
      );
      const client = createPublicClient({ fetch });
      const response = await client.predictions.del('/cancel-all', {
        responseType: 'raw',
      });
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        code: 'cancel_outcome_unknown',
        message: 'Check before retrying',
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
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

  it('never dispatches a request whose signal is already cancelled', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = new ServiceClient({ root, fetch });
    const controller = new AbortController();
    const reason = { query: 'replaced' };
    controller.abort(reason);

    await expect(
      client.get('/cancelled', {
        signal: controller.signal,
        responseType: 'raw',
      }),
    ).rejects.toMatchObject({ name: 'RequestAbortedError', cause: reason });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards cancellation to an in-flight request without cancelling another request', async () => {
    const dispatched = Promise.withResolvers<AbortSignal>();
    const controller = new AbortController();
    const reason = new Error('query superseded');
    const fetch = vi.fn<typeof globalThis.fetch>((input) => {
      const request = input as Request;
      if (new URL(request.url).pathname === '/cancelled') {
        dispatched.resolve(request.signal);
        return new Promise<Response>((_, reject) => {
          request.signal.addEventListener(
            'abort',
            () => reject(request.signal.reason),
            { once: true },
          );
        });
      }
      return Promise.resolve(Response.json({ ok: true }));
    });
    const client = new ServiceClient({ root, fetch });
    const cancelled = client.get('/cancelled', {
      signal: controller.signal,
      responseType: 'raw',
    });
    const unaffected = client.get('/unaffected', { responseType: 'raw' });
    const requestSignal = await dispatched.promise;
    controller.abort(reason);

    await expect(cancelled).rejects.toMatchObject({
      name: 'RequestAbortedError',
      cause: reason,
    });
    await expect(unaffected).resolves.toBeInstanceOf(Response);
    expect(requestSignal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  describe('promise response lifecycle', () => {
    it.each([
      'get',
      'post',
      'patch',
      'del',
    ] as const)('rejects %s on an empty client before resolving headers or fetching', async (method) => {
      const fetch = vi.fn(globalThis.fetch);
      const resolveHeaders = vi.fn(async () => ({}));
      const client = new ServiceClient({ fetch, resolveHeaders });
      const result =
        method === 'get'
          ? client.get('/unused')
          : client[method]('/unused', {});
      await expect(result).rejects.toMatchObject({
        name: 'UserInputError',
        message: 'This service client has no configured endpoint',
      });
      expect(resolveHeaders).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('preserves already-aborted signal priority on an empty client', async () => {
      const fetch = vi.fn(globalThis.fetch);
      const resolveHeaders = vi.fn(async () => ({}));
      const client = new ServiceClient({ fetch, resolveHeaders });
      const controller = new AbortController();
      const reason = { query: 'superseded before endpoint configuration' };
      controller.abort(reason);
      await expect(
        client.get('/unused', { signal: controller.signal }),
      ).rejects.toMatchObject({
        name: 'RequestAbortedError',
        cause: reason,
      });
      expect(resolveHeaders).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
      'resolves',
      'rejects',
    ] as const)('cancels pending transport and observes a late fetch that %s', async (outcome) => {
      const controller = new AbortController();
      const reason = { query: 'superseded during transport' };
      const dispatched = Promise.withResolvers<void>();
      const transport = Promise.withResolvers<Response>();
      let requestSignal: AbortSignal | null | undefined;
      const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = input instanceof Request ? input.signal : init?.signal;
        dispatched.resolve();
        return transport.promise;
      });
      const transform = vi.fn((value: string) => value.length);
      const client = new ServiceClient({ root, fetch });
      const pending = client.get('/pending', {
        signal: controller.signal,
        schema: z.string().transform(transform),
      });
      const rejection = expect(pending).rejects.toMatchObject({
        name: 'RequestAbortedError',
        cause: reason,
      });
      await dispatched.promise;
      controller.abort(reason);
      await rejection;
      expect(requestSignal?.aborted).toBe(true);
      expect(requestSignal?.reason).toBe(reason);
      if (outcome === 'resolves')
        transport.resolve(HttpResponse.json('late value'));
      else transport.reject(new Error('late network failure'));
      await transport.promise.catch(() => undefined);
      await Promise.resolve();
      expect(fetch).toHaveBeenCalledOnce();
      expect(transform).not.toHaveBeenCalled();
    });

    it('cancels a transport retry backoff without any subsequent dispatch', async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const reason = new Error('retry no longer wanted');
      let requestSignal: AbortSignal | null | undefined;
      const fetch = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          requestSignal =
            input instanceof Request ? input.signal : init?.signal;
          throw new TypeError('connection reset');
        },
      );
      const client = new ServiceClient({ root, fetch });
      const pending = client.get('/backoff', {
        signal: controller.signal,
        timeout: false,
      });
      const rejection = expect(pending).rejects.toMatchObject({
        name: 'RequestAbortedError',
        cause: reason,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledOnce();
      // With request timeout disabled, the pending timer is the retry backoff.
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(100);
      expect(fetch).toHaveBeenCalledOnce();
      controller.abort(reason);
      await rejection;
      expect(requestSignal?.aborted).toBe(true);
      expect(requestSignal?.reason).toBe(reason);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(fetch).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('isolates cancellation between concurrent body consumers on one client', async () => {
      const cancelledController = new AbortController();
      const unaffectedController = new AbortController();
      const reason = new Error('first body no longer needed');
      const cancelledReading = Promise.withResolvers<void>();
      const unaffectedReading = Promise.withResolvers<void>();
      const bodies = new Map<
        string,
        ReadableStreamDefaultController<Uint8Array>
      >();
      const signals = new Map<string, AbortSignal | null | undefined>();
      const encoder = new TextEncoder();
      const fetch = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = input instanceof Request ? input.url : String(input);
          const name = url.endsWith('/cancelled') ? 'cancelled' : 'unaffected';
          const signal = input instanceof Request ? input.signal : init?.signal;
          signals.set(name, signal);
          let supplied = false;
          return new Response(
            new ReadableStream<Uint8Array>(
              {
                start(stream) {
                  bodies.set(name, stream);
                  signal?.addEventListener(
                    'abort',
                    () => stream.error(signal.reason),
                    { once: true },
                  );
                },
                pull(stream) {
                  if (supplied) return;
                  supplied = true;
                  (name === 'cancelled'
                    ? cancelledReading
                    : unaffectedReading
                  ).resolve();
                  stream.enqueue(encoder.encode('{"value":'));
                },
              },
              { highWaterMark: 0 },
            ),
          );
        },
      );
      const client = new ServiceClient({ root, fetch });
      const schema = z.object({ value: z.number() });
      const cancelled = client.get('/cancelled', {
        schema,
        signal: cancelledController.signal,
      });
      const unaffected = client.get('/unaffected', {
        schema,
        signal: unaffectedController.signal,
      });
      const rejection = expect(cancelled).rejects.toMatchObject({
        name: 'RequestAbortedError',
        cause: reason,
      });
      await Promise.all([cancelledReading.promise, unaffectedReading.promise]);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(signals.get('cancelled')).not.toBe(signals.get('unaffected'));
      cancelledController.abort(reason);
      await rejection;
      expect(signals.get('cancelled')?.aborted).toBe(true);
      expect(signals.get('cancelled')?.reason).toBe(reason);
      expect(unaffectedController.signal.aborted).toBe(false);
      expect(signals.get('unaffected')?.aborted).toBe(false);
      const remainingBody = bodies.get('unaffected');
      if (remainingBody === undefined)
        throw new Error('Expected the unaffected response body');
      remainingBody.enqueue(encoder.encode('7}'));
      remainingBody.close();
      await expect(unaffected).resolves.toEqual({ value: 7 });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('rejects invalid response modes and non-JSON schema combinations before dispatch', async () => {
      const fetch = vi.fn(globalThis.fetch);
      const resolveHeaders = vi.fn(async () => ({}));
      const client = new ServiceClient({ root, fetch, resolveHeaders });
      for (const options of [
        { responseType: 'unsupported' },
        { responseType: 'blob', schema: z.string() },
        { responseType: 'raw', schema: z.string() },
      ]) {
        await expect(
          client.get('/unused', options as never),
        ).rejects.toMatchObject({ name: 'UserInputError' });
      }
      const controller = new AbortController();
      controller.abort('abort wins');
      await expect(
        client.get('/unused', {
          signal: controller.signal,
          responseType: 'unsupported',
        } as never),
      ).rejects.toMatchObject({
        name: 'RequestAbortedError',
        cause: 'abort wins',
      });
      expect(resolveHeaders).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('maps thrown schema transforms to response errors, never transport errors', async () => {
      server.use(
        http.get(`${root}/throwing-schema`, () => HttpResponse.json('value')),
      );
      const cause = new Error('transform failed');
      const client = new ServiceClient({ root });
      await expect(
        client.get('/throwing-schema', {
          schema: z.string().transform(() => {
            throw cause;
          }),
        }),
      ).rejects.toMatchObject({ name: 'UnexpectedResponseError', cause });
    });

    it('checks cancellation after parsing and before schema transformation', async () => {
      const controller = new AbortController();
      const reason = new Error('cancelled before validation');
      const response = HttpResponse.json('value');
      vi.spyOn(response, 'json').mockImplementation(async () => {
        controller.abort(reason);
        return 'value';
      });
      const transform = vi.fn((value: string) => value.length);
      const client = new ServiceClient({ root, fetch: async () => response });
      await expect(
        client.get('/schema', {
          signal: controller.signal,
          schema: z.string().transform(transform),
        }),
      ).rejects.toMatchObject({ name: 'RequestAbortedError', cause: reason });
      expect(transform).not.toHaveBeenCalled();
    });

    it('signs the exact serialized bytes sent through custom fetch', async () => {
      const resolveHeaders = vi.fn(async (request: ServiceRequest) => ({
        'x-signed-body': request.body ?? '',
      }));
      const fetch = vi.fn(async (input: RequestInfo | URL) => {
        const request = input as Request;
        expect(await request.text()).toBe('{"count":42}');
        expect(request.headers.get('x-signed-body')).toBe('{"count":42}');
        expect(request.headers.get('content-type')).toBe('application/json');
        return HttpResponse.json({ ok: true });
      });
      const client = new ServiceClient({ root, fetch, resolveHeaders });
      await expect(
        client.post('/bytes', { json: { count: 42, absent: undefined } }),
      ).resolves.toEqual({ ok: true });
      expect(resolveHeaders).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/bytes',
          body: '{"count":42}',
        }),
      );
    });

    it('leaves raw response body consumption connected to the operation signal', async () => {
      const controller = new AbortController();
      const reason = new Error('raw reader cancelled');
      let requestSignal: AbortSignal | null | undefined;
      const client = new ServiceClient({
        root,
        fetch: async (input, init) => {
          requestSignal =
            input instanceof Request ? input.signal : init?.signal;
          return new Response(
            new ReadableStream({
              start(stream) {
                requestSignal?.addEventListener(
                  'abort',
                  () => stream.error(reason),
                  { once: true },
                );
              },
            }),
          );
        },
      });
      const raw = await client.get('/raw', {
        responseType: 'raw',
        signal: controller.signal,
      });
      controller.abort(reason);
      expect(requestSignal?.aborted).toBe(true);
      await expect(raw.text()).rejects.toBe(reason);
    });

    it.each([
      'get',
      'post',
      'patch',
      'del',
    ] as const)('parses and transforms JSON through %s', async (method) => {
      server.use(
        http.all(`${root}/transform`, () => HttpResponse.json({ count: '42' })),
      );
      const client = new ServiceClient({ root });
      const schema = z.object({ count: z.string().transform(Number) });
      const result =
        method === 'get'
          ? client.get('/transform', { schema })
          : client[method]('/transform', { schema });
      await expect(result).resolves.toEqual({
        count: 42,
      });
      await expect(client.get('/transform')).resolves.toEqual({ count: '42' });
    });

    it('owns binary, text, empty and raw response consumption', async () => {
      server.use(
        http.get(`${root}/bytes`, () => HttpResponse.text('download')),
        http.delete(
          `${root}/empty`,
          () => new HttpResponse(null, { status: 204 }),
        ),
      );
      const client = new ServiceClient({ root });
      const blob = await client.get('/bytes', { responseType: 'blob' });
      expect(await blob.text()).toBe('download');
      const bytes = await client.get('/bytes', { responseType: 'arrayBuffer' });
      expect(new TextDecoder().decode(bytes)).toBe('download');
      await expect(
        client.get('/bytes', { responseType: 'text' }),
      ).resolves.toBe('download');
      await expect(
        client.del('/empty', { responseType: 'empty' }),
      ).resolves.toBeUndefined();
      await expect(
        client.get('/bytes', { responseType: 'empty' }),
      ).resolves.toBeUndefined();
      const raw = await client.get('/bytes', { responseType: 'raw' });
      expect(raw.bodyUsed).toBe(false);
      expect(await raw.text()).toBe('download');
    });

    it('resolves rejected and rate-limited raw responses for caller inspection', async () => {
      server.use(
        http.post(`${root}/rejected`, () =>
          HttpResponse.json({ error: 'invalid_market' }, { status: 422 }),
        ),
        http.get(
          `${root}/limited`,
          () =>
            new HttpResponse('slow down', {
              status: 429,
              headers: { 'retry-after': '3' },
            }),
        ),
      );
      const client = new ServiceClient({ root });
      const rejected = await client.post('/rejected', {
        json: {},
        responseType: 'raw',
      });
      expect(rejected.status).toBe(422);
      expect(await rejected.json()).toEqual({ error: 'invalid_market' });
      const limited = await client.get('/limited', { responseType: 'raw' });
      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).toBe('3');
      expect(await limited.text()).toBe('slow down');
      await expect(
        client.post('/rejected', { json: {} }),
      ).rejects.toMatchObject({ name: 'RequestRejectedError', status: 422 });
    });

    it('preserves JSON and schema failures as response errors with context', async () => {
      server.use(
        http.get(`${root}/invalid-json`, () => HttpResponse.text('not JSON')),
        http.get(`${root}/invalid-shape`, () =>
          HttpResponse.json({ count: 'forty two' }),
        ),
      );
      const client = new ServiceClient({ root });
      await expect(client.get('/invalid-json')).rejects.toMatchObject({
        name: 'UnexpectedResponseError',
        message: `Received non-JSON response from ${root}/invalid-json`,
      });
      await expect(
        client.get('/invalid-shape', {
          schema: z.object({ count: z.number() }),
        }),
      ).rejects.toMatchObject({
        name: 'UnexpectedResponseError',
        cause: expect.any(z.ZodError),
      });
    });

    it('rejects an already aborted operation before authorization or dispatch', async () => {
      const resolveHeaders = vi.fn(async () => ({}));
      const fetch = vi.fn(globalThis.fetch);
      const client = new ServiceClient({ root, fetch, resolveHeaders });
      const controller = new AbortController();
      controller.abort('already replaced');
      await expect(
        client.get('/unused', { signal: controller.signal }),
      ).rejects.toMatchObject({
        name: 'RequestAbortedError',
        cause: 'already replaced',
      });
      expect(resolveHeaders).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
      'json',
      'text',
    ] as const)('preserves cancellation while reading %s error bodies', async (format) => {
      let started: () => void = () => {};
      const reading = new Promise<void>((resolve) => {
        started = resolve;
      });
      const controller = new AbortController();
      const reason = new Error('error body cancelled');
      let supplied = false;
      const client = new ServiceClient({
        root,
        fetch: async () =>
          new Response(
            new ReadableStream(
              {
                start(stream) {
                  controller.signal.addEventListener(
                    'abort',
                    () => stream.error(reason),
                    { once: true },
                  );
                },
                pull(stream) {
                  if (supplied) return;
                  supplied = true;
                  started();
                  stream.enqueue(new TextEncoder().encode('partial'));
                },
              },
              { highWaterMark: 0 },
            ),
            {
              status: 400,
              headers: {
                'content-type':
                  format === 'json' ? 'application/json' : 'text/plain',
              },
            },
          ),
      });
      const pending = client.get('/error-body', { signal: controller.signal });
      await reading;
      controller.abort(reason);
      await expect(pending).rejects.toMatchObject({
        name: 'RequestAbortedError',
        cause: reason,
      });
    });
  });

  it.each([
    [0, 1],
    [undefined, 3],
  ])('uses retries=%s for transport failures (%i attempts)', async (retries, attempts) => {
    let requests = 0;
    server.use(
      http.get(`${root}/connection-reset`, () => {
        requests += 1;
        return HttpResponse.error();
      }),
    );
    const client = new ServiceClient({ root });

    await expect(
      client.get('/connection-reset', { retries }),
    ).rejects.toMatchObject({
      name: 'TransportError',
    });
    expect(requests).toBe(attempts);
  });

  it.each([
    'resolves',
    'rejects',
  ] as const)('stops waiting for authorization headers on abort and never dispatches when signing later %s', async (outcome) => {
    let markStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const headers = Promise.withResolvers<HeadersInit>();
    const fetch = vi.fn(globalThis.fetch);
    const client = new ServiceClient({
      fetch,
      root,
      resolveHeaders: () => {
        markStarted();
        return headers.promise;
      },
    });
    const controller = new AbortController();
    const pending = client.get('/headers', { signal: controller.signal });
    await started;
    controller.abort('query cancelled while signing');

    await expect(pending).rejects.toMatchObject({
      name: 'RequestAbortedError',
      cause: 'query cancelled while signing',
    });
    if (outcome === 'resolves') {
      headers.resolve({ Authorization: 'late signature' });
    } else {
      headers.reject(new Error('late signing failure'));
    }
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    'json',
    'blob',
    'arrayBuffer',
    'text',
    'empty',
  ] as const)('preserves cancellation during %s body consumption', async (format) => {
    const controller = new AbortController();
    const reason = new Error('body read cancelled');
    const reading = Promise.withResolvers<void>();
    let supplied = false;
    const response = new Response(
      new ReadableStream(
        {
          pull(stream) {
            if (supplied) return;
            supplied = true;
            reading.resolve();
            stream.enqueue(new TextEncoder().encode('"partial'));
            controller.signal.addEventListener(
              'abort',
              () => stream.error(reason),
              { once: true },
            );
          },
        },
        { highWaterMark: 0 },
      ),
    );
    const options = { signal: controller.signal };
    const client = new ServiceClient({ root, fetch: async () => response });
    const pending =
      format === 'json'
        ? client.get('/body', { ...options, schema: z.string() })
        : client.get('/body', { ...options, responseType: format });
    await reading.promise;
    controller.abort(reason);

    await expect(pending).rejects.toMatchObject({
      name: 'RequestAbortedError',
      cause: reason,
    });
  });

  it('uses JSON error fields as rejected request messages', async () => {
    server.use(
      http.get(`${root}/json-error`, () =>
        HttpResponse.json({ error: 'structured failure' }, { status: 400 }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.get('/json-error')).rejects.toMatchObject({
      message: `structured failure (${root}/json-error)`,
      name: 'RequestRejectedError',
      status: 400,
    });
  });

  it('supports a single DELETE attempt when acknowledgement is lost', async () => {
    let requests = 0;
    server.use(
      http.delete(`${root}/single-attempt`, () => {
        requests++;
        return HttpResponse.error();
      }),
    );
    const client = new ServiceClient({ root });
    await expect(
      client.del('/single-attempt', { retry: false }),
    ).rejects.toMatchObject({ name: 'TransportError' });
    expect(requests).toBe(1);
  });

  it('exposes JSON error codes on rejected requests', async () => {
    server.use(
      http.get(`${root}/json-error-code`, () =>
        HttpResponse.json(
          { error: 'invalid acceptance', code: 'INVALID_ACCEPTANCE' },
          { status: 400 },
        ),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.get('/json-error-code')).rejects.toMatchObject({
      code: 'INVALID_ACCEPTANCE',
      message: `invalid acceptance (${root}/json-error-code)`,
      name: 'RequestRejectedError',
      status: 400,
    });
  });

  it('uses stable non-400 JSON error identifiers as fallback codes', async () => {
    server.use(
      http.get(`${root}/json-error-identifier`, () =>
        HttpResponse.json(
          { error: 'signer_does_not_match_account' },
          { status: 422 },
        ),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.get('/json-error-identifier')).rejects.toMatchObject({
      code: 'signer_does_not_match_account',
      message: `signer_does_not_match_account (${root}/json-error-identifier)`,
      name: 'RequestRejectedError',
      status: 422,
    });
  });

  it('does not promote 400 validation details into fallback codes', async () => {
    server.use(
      http.get(`${root}/json-400-error-identifier`, () =>
        HttpResponse.json({ error: 'invalid_request' }, { status: 400 }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(
      client.get('/json-400-error-identifier'),
    ).rejects.toMatchObject({
      code: undefined,
      name: 'RequestRejectedError',
      status: 400,
    });
  });

  it('does not retry POST requests after a server error', async () => {
    let requests = 0;
    server.use(
      http.post(`${root}/single-attempt`, () => {
        requests += 1;
        return HttpResponse.json({ error: 'internal_error' }, { status: 500 });
      }),
    );
    const client = new ServiceClient({ root });

    await expect(client.post('/single-attempt')).rejects.toMatchObject({
      code: 'internal_error',
      name: 'RequestRejectedError',
      status: 500,
    });
    expect(requests).toBe(1);
  });

  it('keeps explicit JSON error codes authoritative', async () => {
    server.use(
      http.get(`${root}/json-explicit-error-code`, () =>
        HttpResponse.json(
          {
            error: 'signer_does_not_match_account',
            code: 'EXPLICIT_CODE',
          },
          { status: 422 },
        ),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.get('/json-explicit-error-code')).rejects.toMatchObject(
      {
        code: 'EXPLICIT_CODE',
        name: 'RequestRejectedError',
        status: 422,
      },
    );
  });

  it('prefers JSON error fields over Cloudflare response detection', async () => {
    server.use(
      http.get(`${root}/cloudflare-json-error`, () =>
        HttpResponse.json(
          { error: 'structured cloudflare failure' },
          { headers: { server: 'cloudflare' }, status: 400 },
        ),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.get('/cloudflare-json-error')).rejects.toMatchObject({
      message: `structured cloudflare failure (${root}/cloudflare-json-error)`,
      name: 'RequestRejectedError',
      status: 400,
    });
  });

  it('uses plain text response bodies as rejected request messages', async () => {
    server.use(
      http.get(
        `${root}/text-error`,
        () =>
          new HttpResponse('plain failure', {
            headers: { 'content-type': 'text/plain' },
            status: 400,
          }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.get('/text-error')).rejects.toMatchObject({
      message: `plain failure (${root}/text-error)`,
      name: 'RequestRejectedError',
      status: 400,
    });
  });

  it('prefers plain text response bodies over Cloudflare response detection', async () => {
    server.use(
      http.get(
        `${root}/cloudflare-text-error`,
        () =>
          new HttpResponse('plain cloudflare failure', {
            headers: { 'content-type': 'text/plain', server: 'cloudflare' },
            status: 400,
          }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.get('/cloudflare-text-error')).rejects.toMatchObject({
      message: `plain cloudflare failure (${root}/cloudflare-text-error)`,
      name: 'RequestRejectedError',
      status: 400,
    });
  });

  it('identifies Cloudflare-blocked responses without reading the body', async () => {
    server.use(
      http.get(
        `${root}/html-error`,
        () =>
          new HttpResponse('<!doctype html><html>Cloudflare error</html>', {
            headers: {
              'content-type': 'text/html; charset=utf-8',
              server: 'cloudflare',
            },
            status: 502,
          }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.get('/html-error')).rejects.toMatchObject({
      message: `Request to ${root}/html-error was blocked by Cloudflare with status 502`,
      name: 'RequestRejectedError',
      status: 502,
    });
  });

  it('sends configured headers with requests', async () => {
    server.use(
      http.get(`${root}/headers`, ({ request }) => {
        expect(request.headers.get('CF-Access-Client-Id')).toBe('client-id');
        expect(request.headers.get('CF-Access-Client-Secret')).toBe(
          'client-secret',
        );

        return HttpResponse.json({ ok: true });
      }),
    );
    const client = new ServiceClient({
      headers: {
        'CF-Access-Client-Id': 'client-id',
        'CF-Access-Client-Secret': 'client-secret',
      },
      root,
    });

    await expect(client.get('/headers')).resolves.toEqual({ ok: true });
  });

  it('identifies unreadable HTML errors when the server is unknown', async () => {
    server.use(
      http.get(
        `${root}/generic-html-error`,
        () =>
          new HttpResponse('<!doctype html><html>Gateway error</html>', {
            headers: { 'content-type': 'text/html; charset=utf-8' },
            status: 502,
          }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.get('/generic-html-error')).rejects.toMatchObject({
      message: `Request to ${root}/generic-html-error failed with status 502 and an unexpected HTML response body`,
      name: 'RequestRejectedError',
      status: 502,
    });
  });

  it('exposes Retry-After header values on rejected requests', async () => {
    server.use(
      http.get(
        `${root}/retry-after-error`,
        () =>
          new HttpResponse(null, {
            headers: { 'retry-after': '17' },
            status: 503,
          }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.get('/retry-after-error')).rejects.toMatchObject({
      name: 'RequestRejectedError',
      retryAfter: 17,
      status: 503,
    });
  });

  it('exposes Retry-After header values on rate limited requests', async () => {
    server.use(
      http.get(
        `${root}/retry-after-rate-limit`,
        () =>
          new HttpResponse(null, {
            headers: { 'retry-after': '3' },
            status: 429,
          }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(
      client.get('/retry-after-rate-limit', { retries: 0 }),
    ).rejects.toMatchObject({
      name: 'RateLimitError',
      retryAfter: 3,
    });
  });

  it('leaves retryAfter undefined when the Retry-After header is missing', async () => {
    server.use(
      http.get(`${root}/no-retry-after`, () =>
        HttpResponse.json({ error: 'failure' }, { status: 503 }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(
      client.get('/no-retry-after', { retries: 0 }),
    ).rejects.toMatchObject({
      name: 'RequestRejectedError',
      restriction: undefined,
      retryAfter: undefined,
      status: 503,
    });
  });

  describe('HTTP-date Retry-After values', () => {
    // 2026-09-10T06:02:00Z is 119.6 s after this clock, so a correct
    // conversion reports 120 whole seconds, never 119.
    const now = new Date('2026-09-10T06:00:00.400Z');
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    function rejectedWith(header: string, status = 503, body?: object) {
      server.use(
        http.get(`${root}/retry-after-date`, () =>
          body === undefined
            ? new HttpResponse(null, {
                headers: { 'retry-after': header },
                status,
              })
            : HttpResponse.json(body, {
                headers: { 'retry-after': header },
                status,
              }),
        ),
      );
      return expect(
        new ServiceClient({ root }).get('/retry-after-date', { retries: 0 }),
      ).rejects;
    }

    it.each([
      ['IMF-fixdate', 'Thu, 10 Sep 2026 06:02:00 GMT'],
      ['RFC 850', 'Thursday, 10-Sep-26 06:02:00 GMT'],
      ['asctime', 'Thu Sep 10 06:02:00 2026'],
    ])('converts a %s header to whole seconds from now', async (_, header) => {
      await rejectedWith(header).toMatchObject({
        name: 'RequestRejectedError',
        retryAfter: 120,
        status: 503,
      });
    });

    it('applies the same conversion on rate limited requests', async () => {
      await rejectedWith('Thu, 10 Sep 2026 06:02:00 GMT', 429).toMatchObject({
        name: 'RateLimitError',
        retryAfter: 120,
      });
    });

    it('clamps a past date to zero', async () => {
      await rejectedWith('Thu, 10 Sep 2026 05:00:00 GMT').toMatchObject({
        retryAfter: 0,
      });
    });

    it('reads a two-digit year more than fifty years ahead as the past century', async () => {
      await rejectedWith('Thursday, 10-Sep-77 06:02:00 GMT').toMatchObject({
        retryAfter: 0,
      });
    });

    it('prefers a valid date header over the body retry delay', async () => {
      await rejectedWith('Thu, 10 Sep 2026 06:02:00 GMT', 503, {
        code: 'post_only_mode',
        error: 'Post-only mode is enabled',
        retry_after_seconds: 79,
      }).toMatchObject({ code: 'post_only_mode', retryAfter: 120 });
    });

    it.each([
      ['garbage', 'not-a-date'],
      ['an impossible calendar day', 'Thu, 31 Feb 2026 06:02:00 GMT'],
      ['a leap second', 'Thu, 10 Sep 2026 23:59:60 GMT'],
      ['a bare date', '10 Sep 2026'],
      ['two headers', '120, Thu, 10 Sep 2026 06:02:00 GMT'],
    ])('falls back to the body delay for %s', async (_, header) => {
      await rejectedWith(header, 503, {
        code: 'post_only_mode',
        error: 'Post-only mode is enabled',
        retry_after_seconds: 79,
      }).toMatchObject({ retryAfter: 79 });
    });
  });

  it('exposes Poly-RateLimit header state on rate limited requests', async () => {
    server.use(
      http.post(
        `${root}/rate-limited-order`,
        () =>
          new HttpResponse(null, {
            headers: {
              'Poly-RateLimit-Remaining': '-2',
              'Poly-RateLimit-Reset': '1784913054',
              'Poly-RateLimit-Tier': 'standard',
              'retry-after': '3',
            },
            status: 429,
          }),
      ),
    );
    const updates: unknown[] = [];
    const client = new ServiceClient({
      onRateLimitUpdate: (update) => updates.push(update),
      root,
    });

    await expect(
      client.post('/rate-limited-order', { rateLimitBucket: 'order' }),
    ).rejects.toMatchObject({
      name: 'RateLimitError',
      rateLimit: {
        bucket: 'order',
        remaining: -2,
        reset: 1784913054,
        tier: 'standard',
        warning: false,
      },
      retryAfter: 3,
    });
    expect(updates).toEqual([
      {
        bucket: 'order',
        remaining: -2,
        reset: 1784913054,
        tier: 'standard',
        warning: false,
      },
    ]);
  });

  it('notifies the rate-limit listener when responses report rate-limit state', async () => {
    server.use(
      http.post(`${root}/order`, () =>
        HttpResponse.json(
          { ok: true },
          {
            headers: {
              'Poly-RateLimit-Remaining': '59',
              'Poly-RateLimit-Reset': '1784913054',
              'Poly-RateLimit-Tier': 'standard',
              'Poly-RateLimit-Warning': 'true',
            },
          },
        ),
      ),
    );
    const updates: unknown[] = [];
    const client = new ServiceClient({
      onRateLimitUpdate: (update) => updates.push(update),
      root,
    });

    await expect(
      client.post('/order', { rateLimitBucket: 'order' }),
    ).resolves.toEqual({ ok: true });
    expect(updates).toEqual([
      {
        bucket: 'order',
        remaining: 59,
        reset: 1784913054,
        tier: 'standard',
        warning: true,
      },
    ]);
  });

  it('uses request metadata to identify the cancellation bucket', async () => {
    server.use(
      http.delete(`${root}/order`, () =>
        HttpResponse.json(
          { ok: true },
          {
            headers: {
              'Poly-RateLimit-Remaining': '2999',
              'Poly-RateLimit-Reset': '1784913054',
              'Poly-RateLimit-Tier': 'standard',
            },
          },
        ),
      ),
    );
    const updates: unknown[] = [];
    const client = new ServiceClient({
      onRateLimitUpdate: (update) => updates.push(update),
      root,
    });

    await expect(
      client.del('/order', { rateLimitBucket: 'cancel' }),
    ).resolves.toEqual({ ok: true });
    expect(updates).toEqual([
      {
        bucket: 'cancel',
        remaining: 2999,
        reset: 1784913054,
        tier: 'standard',
        warning: false,
      },
    ]);
  });

  it('does not infer a rate-limit bucket from request routes', async () => {
    server.use(
      http.post(`${root}/order`, () =>
        HttpResponse.json(
          { ok: true },
          { headers: { 'Poly-RateLimit-Remaining': '10' } },
        ),
      ),
    );
    const updates: unknown[] = [];
    const client = new ServiceClient({
      onRateLimitUpdate: (update) => updates.push(update),
      root,
    });

    await expect(client.post('/order')).resolves.toEqual({ ok: true });
    expect(updates).toEqual([
      {
        remaining: 10,
        reset: undefined,
        tier: undefined,
        warning: false,
      },
    ]);
  });

  it('ignores non-integer rate-limit header values', async () => {
    server.use(
      http.post(`${root}/order`, () =>
        HttpResponse.json(
          { ok: true },
          {
            headers: {
              'Poly-RateLimit-Remaining': '1e3',
              'Poly-RateLimit-Reset': '1.5',
              'Poly-RateLimit-Tier': 'standard',
            },
          },
        ),
      ),
    );
    const updates: unknown[] = [];
    const client = new ServiceClient({
      onRateLimitUpdate: (update) => updates.push(update),
      root,
    });

    await expect(
      client.post('/order', { rateLimitBucket: 'order' }),
    ).resolves.toEqual({ ok: true });
    expect(updates).toEqual([
      {
        bucket: 'order',
        remaining: undefined,
        reset: undefined,
        tier: 'standard',
        warning: false,
      },
    ]);
  });

  it('does not notify the rate-limit listener without rate-limit headers', async () => {
    server.use(http.get(`${root}/uncovered`, () => HttpResponse.json({})));
    const updates: unknown[] = [];
    const client = new ServiceClient({
      onRateLimitUpdate: (update) => updates.push(update),
      root,
    });

    await expect(client.get('/uncovered')).resolves.toEqual({});
    expect(updates).toEqual([]);
  });

  it('ignores synchronous rate-limit listener errors', async () => {
    server.use(
      http.post(`${root}/order`, () =>
        HttpResponse.json(
          { ok: true },
          { headers: { 'Poly-RateLimit-Remaining': '10' } },
        ),
      ),
    );
    const client = new ServiceClient({
      onRateLimitUpdate: () => {
        throw new Error('listener failure');
      },
      root,
    });

    await expect(client.post('/order')).resolves.toEqual({ ok: true });
  });

  it('ignores asynchronous rate-limit listener errors', async () => {
    server.use(
      http.post(`${root}/order`, () =>
        HttpResponse.json(
          { ok: true },
          { headers: { 'Poly-RateLimit-Remaining': '10' } },
        ),
      ),
    );
    const client = new ServiceClient({
      onRateLimitUpdate: async () => {
        await Promise.resolve();
        throw new Error('async listener failure');
      },
      root,
    });

    await expect(client.post('/order')).resolves.toEqual({ ok: true });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  it('does not apply service-specific policy to rejected responses', async () => {
    server.use(
      http.post(
        `${root}/restarting`,
        () => new HttpResponse(null, { status: 425 }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.post('/restarting')).rejects.toMatchObject({
      name: 'RequestRejectedError',
      restriction: undefined,
      status: 425,
    });
  });

  it('falls back to the body retry delay on rejected requests', async () => {
    server.use(
      http.post(`${root}/post-only`, () =>
        HttpResponse.json(
          {
            code: 'post_only_mode',
            error:
              'post-only mode: only post-only orders and cancels are allowed',
            retry_after_seconds: 79,
          },
          { status: 503 },
        ),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.post('/post-only')).rejects.toMatchObject({
      code: 'post_only_mode',
      message: `post-only mode: only post-only orders and cancels are allowed (${root}/post-only)`,
      name: 'RequestRejectedError',
      retryAfter: 79,
      status: 503,
    });
  });

  it('prefers the Retry-After header over the body retry delay', async () => {
    server.use(
      http.post(`${root}/post-only-header`, () =>
        HttpResponse.json(
          {
            code: 'post_only_mode',
            error:
              'post-only mode: only post-only orders and cancels are allowed',
            retry_after_seconds: 79,
          },
          { headers: { 'retry-after': '80' }, status: 503 },
        ),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.post('/post-only-header')).rejects.toMatchObject({
      code: 'post_only_mode',
      name: 'RequestRejectedError',
      retryAfter: 80,
      status: 503,
    });
  });

  it('falls back to an unreadable-body message for unknown content types', async () => {
    server.use(
      http.get(
        `${root}/binary-error`,
        () =>
          new HttpResponse(new Uint8Array([0, 1, 2, 3]), {
            headers: { 'content-type': 'application/octet-stream' },
            status: 500,
          }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(client.get('/binary-error')).rejects.toMatchObject({
      message: `Request to ${root}/binary-error failed with status 500 and unreadable response body`,
      name: 'RequestRejectedError',
      status: 500,
    });
  });
});

import { PaginationCursorSchema } from '@polymarket/bindings';

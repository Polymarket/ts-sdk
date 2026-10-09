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
import { ServiceClient, type ServiceRequest } from './ServiceClient';

const root = 'http://localhost:4011';
const server = setupServer();

describe('ServiceClient', () => {
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
      await expect(client[method]('/unused', {})).rejects.toMatchObject({
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
      await expect(client[method]('/transform', { schema })).resolves.toEqual({
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
      const client = new ServiceClient({ root, retry: false });
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
        retry: false,
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
    [false, 1],
    [undefined, 3],
  ])('uses retry=%s for transport failures (%i attempts)', async (retry, attempts) => {
    let requests = 0;
    server.use(
      http.get(`${root}/connection-reset`, () => {
        requests += 1;
        return HttpResponse.error();
      }),
    );
    const client = new ServiceClient({ retry, root });

    await expect(client.get('/connection-reset')).rejects.toMatchObject({
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

    await expect(client.get('/retry-after-rate-limit')).rejects.toMatchObject({
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

    await expect(client.get('/no-retry-after')).rejects.toMatchObject({
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
      return expect(new ServiceClient({ root }).get('/retry-after-date'))
        .rejects;
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

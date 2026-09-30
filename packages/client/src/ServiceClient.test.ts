import { unwrap } from '@polymarket/types';
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
import { z } from 'zod';
import { shouldFallbackToGamma } from './gateway-fallback';
import { validateWith } from './response';
import { ServiceClient } from './ServiceClient';

const root = 'http://localhost:4011';
const server = setupServer();

describe('ServiceClient', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    server.close();
  });

  it('uses JSON error fields as rejected request messages', async () => {
    server.use(
      http.get(`${root}/json-error`, () =>
        HttpResponse.json({ error: 'structured failure' }, { status: 400 }),
      ),
    );
    const client = new ServiceClient({ root });

    await expect(unwrap(client.get('/json-error'))).rejects.toMatchObject({
      message: `structured failure (${root}/json-error)`,
      name: 'RequestRejectedError',
      status: 400,
    });
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

    await expect(unwrap(client.get('/json-error-code'))).rejects.toMatchObject({
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

    await expect(
      unwrap(client.get('/json-error-identifier')),
    ).rejects.toMatchObject({
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
      unwrap(client.get('/json-400-error-identifier')),
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

    await expect(unwrap(client.post('/single-attempt'))).rejects.toMatchObject({
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

    await expect(
      unwrap(client.get('/json-explicit-error-code')),
    ).rejects.toMatchObject({
      code: 'EXPLICIT_CODE',
      name: 'RequestRejectedError',
      status: 422,
    });
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

    await expect(
      unwrap(client.get('/cloudflare-json-error')),
    ).rejects.toMatchObject({
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

    await expect(unwrap(client.get('/text-error'))).rejects.toMatchObject({
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

    await expect(
      unwrap(client.get('/cloudflare-text-error')),
    ).rejects.toMatchObject({
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

    await expect(unwrap(client.get('/html-error'))).rejects.toMatchObject({
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

    await expect(unwrap(client.get('/headers'))).resolves.toBeInstanceOf(
      Response,
    );
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

    await expect(
      unwrap(client.get('/generic-html-error')),
    ).rejects.toMatchObject({
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

    await expect(
      unwrap(client.get('/retry-after-error')),
    ).rejects.toMatchObject({
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
      unwrap(client.get('/retry-after-rate-limit')),
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

    await expect(unwrap(client.get('/no-retry-after'))).rejects.toMatchObject({
      name: 'RequestRejectedError',
      restriction: undefined,
      retryAfter: undefined,
      status: 503,
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
      unwrap(client.post('/rate-limited-order', { rateLimitBucket: 'order' })),
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
      unwrap(client.post('/order', { rateLimitBucket: 'order' })),
    ).resolves.toBeInstanceOf(Response);
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
      unwrap(client.del('/order', { rateLimitBucket: 'cancel' })),
    ).resolves.toBeInstanceOf(Response);
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

    await expect(unwrap(client.post('/order'))).resolves.toBeInstanceOf(
      Response,
    );
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
      unwrap(client.post('/order', { rateLimitBucket: 'order' })),
    ).resolves.toBeInstanceOf(Response);
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

    await expect(unwrap(client.get('/uncovered'))).resolves.toBeInstanceOf(
      Response,
    );
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

    await expect(unwrap(client.post('/order'))).resolves.toBeInstanceOf(
      Response,
    );
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

    await expect(unwrap(client.post('/order'))).resolves.toBeInstanceOf(
      Response,
    );
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

    await expect(unwrap(client.post('/restarting'))).rejects.toMatchObject({
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

    await expect(unwrap(client.post('/post-only'))).rejects.toMatchObject({
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

    await expect(
      unwrap(client.post('/post-only-header')),
    ).rejects.toMatchObject({
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

    await expect(unwrap(client.get('/binary-error'))).rejects.toMatchObject({
      message: `Request to ${root}/binary-error failed with status 500 and unreadable response body`,
      name: 'RequestRejectedError',
      status: 500,
    });
  });
});

describe('gateway transport boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies the request timeout override through body completion and clears it', async () => {
    const responseBody = new ReadableStream({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode('{"value":"ready"}'));
          controller.close();
        }, 30);
      },
    });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(responseBody));
    const client = new ServiceClient({
      root,
      singleAttempt: true,
      responseDeadlineMs: 10,
    });
    const response = await unwrap(client.get('/delayed-body', { timeout: 60 }));
    await expect(response.json()).resolves.toEqual({ value: 'ready' });
    expect(responseBody.locked).toBe(false);
    await new Promise<void>((resolve) => setTimeout(resolve, 70));
    const request = fetch.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    expect((request as Request).signal.aborted).toBe(false);
  });

  it.each([
    'null',
    '{broken',
  ])('preserves HTTP status when an error body is not an error object: %s', async (body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const client = new ServiceClient({
      root,
      singleAttempt: true,
      responseDeadlineMs: 100,
    });
    const response = await client.get('/invalid-error');
    expect(response.isErr()).toBe(true);
    if (!response.isErr()) return;
    expect(response.error).toMatchObject({
      name: 'RequestRejectedError',
      status: 500,
    });
    expect(shouldFallbackToGamma(response.error)).toBe(false);
  });

  it('rejects invalid deadline configuration before any network attempt', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const client = new ServiceClient({
      root,
      singleAttempt: true,
      responseDeadlineMs: Number.NaN,
    });
    const response = await client.get('/invalid-deadline');
    expect(response.isErr()).toBe(true);
    if (!response.isErr()) return;
    expect(shouldFallbackToGamma(response.error)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    400, 401, 403, 404, 429, 500, 501, 502, 503, 504,
  ])('makes one attempt for HTTP %s and preserves fallback eligibility', async (status) => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json(
          { code: 'UPSTREAM_ERROR', message: 'Upstream unavailable' },
          { status, headers: { 'retry-after': '7' } },
        ),
      );
    const client = new ServiceClient({
      root,
      singleAttempt: true,
      responseDeadlineMs: 100,
    });
    const response = await client.get('/gateway-error');
    expect(response.isErr()).toBe(true);
    if (!response.isErr()) return;
    expect(shouldFallbackToGamma(response.error)).toBe(
      [502, 503, 504].includes(status),
    );
    expect(response.error).toMatchObject({
      name: status === 429 ? 'RateLimitError' : 'RequestRejectedError',
      retryAfter: 7,
      ...(status !== 429 && { code: 'UPSTREAM_ERROR', status }),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('classifies a failed network attempt as unavailable', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('Failed to fetch'));
    const client = new ServiceClient({
      root,
      singleAttempt: true,
      responseDeadlineMs: 100,
    });
    const response = await client.get('/network-error');
    expect(response.isErr()).toBe(true);
    if (!response.isErr()) return;
    expect(shouldFallbackToGamma(response.error)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('bounds a request stalled before response headers and aborts it', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => new Promise<Response>(() => {}));
    const client = new ServiceClient({
      root,
      singleAttempt: true,
      responseDeadlineMs: 20,
    });
    const response = await client.get('/header-stall');
    expect(response.isErr()).toBe(true);
    if (!response.isErr()) return;
    expect(shouldFallbackToGamma(response.error)).toBe(true);
    const request = fetch.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    expect((request as Request).signal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    200, 500, 503,
  ])('bounds a stalled HTTP %s body without losing known status policy', async (status) => {
    const cancel = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new ReadableStream({ cancel }), {
        status,
        headers: { 'content-type': 'application/json', 'retry-after': '9' },
      }),
    );
    const client = new ServiceClient({
      root,
      singleAttempt: true,
      responseDeadlineMs: 20,
    });
    const response = await client.get('/body-stall');
    expect(response.isErr()).toBe(true);
    if (!response.isErr()) return;
    expect(shouldFallbackToGamma(response.error)).toBe(status !== 500);
    expect(response.error).toMatchObject(
      status === 200
        ? { name: 'TransportError' }
        : { name: 'RequestRejectedError', status, retryAfter: 9 },
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    200, 500, 503,
  ])('classifies an interrupted HTTP %s stream without losing status policy', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"incomplete":'));
            controller.error(new TypeError('terminated'));
          },
        }),
        { status },
      ),
    );
    const client = new ServiceClient({
      root,
      singleAttempt: true,
      responseDeadlineMs: 100,
    });
    const response = await client.get('/stream-error');
    expect(response.isErr()).toBe(true);
    if (!response.isErr()) return;
    expect(shouldFallbackToGamma(response.error)).toBe(status !== 500);
  });

  it.each([
    '{broken',
    '{"value":42}',
  ])('keeps complete invalid payloads out of fallback: %s', async (body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));
    const client = new ServiceClient({
      root,
      singleAttempt: true,
      responseDeadlineMs: 100,
    });
    const response = await client
      .get('/invalid-payload')
      .andThen(validateWith(z.object({ value: z.string() })));
    expect(response.isErr()).toBe(true);
    if (!response.isErr()) return;
    expect(response.error.name).toBe('UnexpectedResponseError');
    expect(shouldFallbackToGamma(response.error)).toBe(false);
  });

  it('does not treat header construction errors as network failures', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const client = new ServiceClient({
      root,
      singleAttempt: true,
      responseDeadlineMs: 100,
      resolveHeaders: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const response = await client.get('/bad-headers');
    expect(response.isErr()).toBe(true);
    if (!response.isErr()) return;
    expect(shouldFallbackToGamma(response.error)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not treat an unsupported protocol as network failure', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const client = new ServiceClient({
      root: 'ftp://localhost',
      singleAttempt: true,
      responseDeadlineMs: 100,
    });
    const response = await client.get('/configuration-error');
    expect(response.isErr()).toBe(true);
    if (!response.isErr()) return;
    expect(shouldFallbackToGamma(response.error)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not treat explicit cancellation as network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError'),
    );
    const client = new ServiceClient({
      root,
      singleAttempt: true,
      responseDeadlineMs: 100,
    });
    const response = await client.get('/cancelled');
    expect(response.isErr()).toBe(true);
    if (!response.isErr()) return;
    expect(shouldFallbackToGamma(response.error)).toBe(false);
  });
});

import { unwrap } from '@polymarket/types';
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
import { OrderHeartbeatMismatchError } from './errors';
import { buildHmacSignature } from './hmac';
import { ServiceClient } from './ServiceClient';

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

  it('signs the exact heartbeat JSON and keeps the legacy request body empty', async () => {
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
        return HttpResponse.json(
          new URL(request.url).pathname === '/v1/heartbeats'
            ? { heartbeat_id: 'next-id' }
            : { status: 'ok' },
        );
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
    await unwrap(
      client.post('/v1/heartbeats', {
        json: { heartbeat_id: 'current-id' },
        retry: false,
      }),
    );
    await unwrap(client.post('/heartbeats', { retry: false }));
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
    expect(observed[1]).toEqual({
      path: '/heartbeats',
      body: '',
      signature: await buildHmacSignature('dGVzdA==', 1, 'POST', '/heartbeats'),
    });
  });

  it('preserves the expected order heartbeat ID and performs one attempt', async () => {
    let requests = 0;
    server.use(
      http.post(`${root}/v1/heartbeats`, () => {
        requests++;
        return HttpResponse.json(
          { error_msg: 'Invalid Heartbeat ID', heartbeat_id: 'expected-id' },
          { status: 400 },
        );
      }),
    );
    const client = new ServiceClient({ root });
    const result = await client.post('/v1/heartbeats', {
      json: { heartbeat_id: 'stale-id' },
      retry: false,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(OrderHeartbeatMismatchError);
      expect(result.error).toMatchObject({
        status: 400,
        heartbeatId: 'expected-id',
      });
    }
    expect(requests).toBe(1);
  });

  it('does not reinterpret unrelated errors containing a heartbeat ID', async () => {
    server.use(
      http.post(`${root}/other-route`, () =>
        HttpResponse.json(
          { error_msg: 'Invalid Heartbeat ID', heartbeat_id: 'expected-id' },
          { status: 400 },
        ),
      ),
    );
    const client = new ServiceClient({ root });
    const result = await client.post('/other-route');
    if (result.isErr())
      expect(result.error).not.toBeInstanceOf(OrderHeartbeatMismatchError);
    else throw new Error('Expected rejection');
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
      unwrap(client.del('/single-attempt', { retry: false })),
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
        unwrap(new ServiceClient({ root }).get('/retry-after-date')),
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

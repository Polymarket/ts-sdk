import { afterEach, expect, it, vi } from 'vitest';
import { AuthenticatedServiceClient } from './AuthenticatedServiceClient';

const root = 'https://offline.invalid/prefix';
afterEach(() => vi.useRealTimers());

it('re-resolves combined headers once and preserves the exact request on replay', async () => {
  const params = new URLSearchParams({ original: 'value' });
  const json = { original: 'value' };
  let token = 'before';
  const seen: Request[] = [];
  const refreshToken = vi.fn(async () => {
    token = 'after';
    params.set('original', 'changed');
    json.original = 'changed';
    return true;
  });
  const service = new AuthenticatedServiceClient({
    root,
    headers: { 'x-config': 'configured' },
    resolveHeaders: async (request) => {
      expect(request.path).toBe('/private');
      expect(request.json).toEqual({ original: 'value' });
      return { authorization: `Bearer ${token}`, 'x-api-key': 'application' };
    },
    refreshToken,
    fetch: async (input, init) => {
      seen.push(new Request(input, init));
      return seen.length === 1
        ? Response.json({ code: 'expired_access_token' }, { status: 401 })
        : Response.json('accepted');
    },
  });
  await expect(service.post(`/private?${params}`, { json })).resolves.toBe(
    'accepted',
  );
  expect(refreshToken).toHaveBeenCalledTimes(1);
  expect(seen.map((request) => request.headers.get('authorization'))).toEqual([
    'Bearer before',
    'Bearer after',
  ]);
  for (const request of seen) {
    expect(request.url).toBe(`${root}/private?original=value`);
    expect(await request.json()).toEqual({ original: 'value' });
    expect(request.headers.get('x-config')).toBe('configured');
    expect(request.headers.get('x-api-key')).toBe('application');
  }
});

it.each([
  false,
  true,
])('bounds recovery when refresh returns %s and preserves the rejected response', async (accepted) => {
  const refreshToken = vi.fn(async () => accepted);
  const fetch = vi.fn(async () =>
    Response.json(
      { code: 'expired_access_token', message: 'rejected' },
      { status: 401 },
    ),
  );
  const service = new AuthenticatedServiceClient({ root, fetch, refreshToken });
  await expect(service.get('/private')).rejects.toMatchObject({
    status: 401,
    code: 'expired_access_token',
  });
  expect(refreshToken).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(accepted ? 2 : 1);
});

it.each([
  'headers',
  'refresh',
])('cancels a stalled %s callback without dispatching a late replay', async (stage) => {
  const entered = Promise.withResolvers<void>();
  const stalled = Promise.withResolvers<void>();
  const controller = new AbortController();
  const waitAt = async (callback: string) => {
    if (stage === callback) {
      entered.resolve();
      await stalled.promise;
    }
  };
  const fetch = vi.fn(async () =>
    Response.json({ code: 'expired_access_token' }, { status: 401 }),
  );
  const service = new AuthenticatedServiceClient({
    root,
    fetch,
    resolveHeaders: async () => {
      await waitAt('headers');
      return {};
    },
    refreshToken: async () => {
      await waitAt('refresh');
      return true;
    },
  });
  const rejected = expect(
    service.get('/private', { signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'RequestAbortedError' });
  await entered.promise;
  controller.abort();
  await rejected;
  stalled.resolve();
  await Promise.resolve();
  expect(fetch).toHaveBeenCalledTimes(stage === 'headers' ? 0 : 1);
});

it('does not recursively recover a refresh request through the same transport', async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL) =>
    Response.json(
      {
        code: new Request(input).url.endsWith('/v1/auth/refresh')
          ? 'invalid_refresh_token'
          : 'expired_access_token',
        message: 'Refresh rejected',
      },
      { status: 401 },
    ),
  );
  const refreshToken = vi.fn(async () => {
    await service.post('/v1/auth/refresh', {
      json: { refresh_token: 'synthetic' },
    });
    return true;
  });
  const service = new AuthenticatedServiceClient({ root, fetch, refreshToken });
  await expect(service.get('/private')).rejects.toMatchObject({
    status: 401,
    code: 'invalid_refresh_token',
  });
  expect(refreshToken).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('excludes header and refresh waits from the per-attempt HTTP timeout', async () => {
  vi.useFakeTimers();
  const headers = Promise.withResolvers<HeadersInit>();
  const refreshed = Promise.withResolvers<boolean>();
  const fetch = vi.fn(async () =>
    fetch.mock.calls.length === 1
      ? Response.json({ code: 'expired_access_token' }, { status: 401 })
      : Response.json('accepted'),
  );
  const service = new AuthenticatedServiceClient({
    root,
    fetch,
    resolveHeaders: () => headers.promise,
    refreshToken: () => refreshed.promise,
  });
  const pending = service.get('/private', { timeout: 50 });
  await vi.advanceTimersByTimeAsync(1_000);
  expect(fetch).not.toHaveBeenCalled();
  headers.resolve({});
  await vi.advanceTimersByTimeAsync(1_000);
  expect(fetch).toHaveBeenCalledTimes(1);
  refreshed.resolve(true);
  await expect(pending).resolves.toBe('accepted');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it('applies the HTTP timeout to the replay attempt and removes its timer', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async () =>
    fetch.mock.calls.length === 1
      ? Response.json({ code: 'expired_access_token' }, { status: 401 })
      : new Promise<Response>(() => {}),
  );
  const service = new AuthenticatedServiceClient({
    root,
    fetch,
    refreshToken: async () => true,
  });
  const rejected = expect(
    service.get('/private', { timeout: 50 }),
  ).rejects.toMatchObject({
    name: 'TransportError',
    cause: { name: 'TimeoutError' },
  });
  await vi.advanceTimersByTimeAsync(50);
  await rejected;
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves serialized JSON bytes without rounding numbers on dispatch or replay', async () => {
  const rawJSON: (value: string) => unknown = Reflect.get(JSON, 'rawJSON');
  const json = { nonce: rawJSON('9007199254740993') };
  const expected = JSON.stringify(json);
  const bodies: string[] = [];
  const service = new AuthenticatedServiceClient({
    root,
    resolveHeaders: async (request) => {
      expect(request.body).toBe(expected);
      return {};
    },
    refreshToken: async () => true,
    fetch: async (input) => {
      bodies.push(await new Request(input).text());
      return bodies.length === 1
        ? Response.json({ code: 'expired_access_token' }, { status: 401 })
        : Response.json(true);
    },
  });
  await service.post('/private', { json });
  expect(bodies).toEqual([expected, expected]);
});

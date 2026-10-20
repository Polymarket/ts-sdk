import { expect, it, vi } from 'vitest';
import { ServiceClient } from './ServiceClient';

const root = 'https://mock.invalid';

it('lets the owning class supply authentication and refresh policy', async () => {
  const original = { accessToken: 'original-opaque-token' };
  const updated = { accessToken: 'updated-opaque-token' };
  let accepted = original;
  const refreshToken = vi.fn(async (previous: string) => {
    expect(previous).toBe(original.accessToken);
    accepted = updated;
  });
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = new Request(input, init);
    if (
      request.headers.get('authorization') === `Bearer ${original.accessToken}`
    )
      return Response.json({ code: 'expired_access_token' }, { status: 401 });
    expect(request.headers.get('authorization')).toBe(
      `Bearer ${updated.accessToken}`,
    );
    return Response.json('accepted');
  });
  const service = new ServiceClient({
    root,
    fetch,
    authentication: { credentials: async () => accepted, refreshToken },
  });
  await expect(service.get('/private')).resolves.toBe('accepted');
  expect(refreshToken).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([
  'credentials',
  'refresh',
])('cancels while a class %s callback ignores its signal', async (stage) => {
  const pending = Promise.withResolvers<void>();
  const abort = new AbortController();
  const entered = Promise.withResolvers<void>();
  const service = new ServiceClient({
    root,
    fetch: async () =>
      Response.json({ code: 'expired_access_token' }, { status: 401 }),
    authentication: {
      credentials: async () => {
        if (stage === 'credentials') {
          entered.resolve();
          await pending.promise;
        }
        return { accessToken: 'original-opaque-token' };
      },
      refreshToken: async () => {
        entered.resolve();
        await pending.promise;
      },
    },
  });
  const request = service.get('/private', { signal: abort.signal });
  const rejected = expect(request).rejects.toMatchObject({
    name: 'RequestAbortedError',
  });
  await entered.promise;
  abort.abort();
  await rejected;
  pending.resolve();
});

it.each([
  'invalid_token',
  'expired_access_token',
])('bounds recovery for %s', async (code) => {
  const refreshToken = vi.fn(async () => {});
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ code }, { status: 401 }),
  );
  const service = new ServiceClient({
    root,
    fetch,
    authentication: {
      credentials: async () => ({ accessToken: 'opaque' }),
      refreshToken,
    },
  });
  await expect(service.get('/private')).rejects.toMatchObject({
    name: 'RequestRejectedError',
    status: 401,
  });
  expect(refreshToken).toHaveBeenCalledTimes(
    code === 'expired_access_token' ? 1 : 0,
  );
  expect(fetch).toHaveBeenCalledTimes(code === 'expired_access_token' ? 2 : 1);
});

it('leaves unauthenticated requests under their existing policy', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ code: 'expired_access_token' }, { status: 401 }),
  );
  const service = new ServiceClient({ root, fetch });
  await expect(service.get('/public')).rejects.toMatchObject({ status: 401 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('snapshots the query and serialized body across authentication recovery', async () => {
  const params = new URLSearchParams({ original: 'value' });
  const body = { original: 'value' };
  const seen: Request[] = [];
  let token = 'original';
  const service = new ServiceClient({
    root,
    headers: { 'x-config': 'configured' },
    fetch: async (input, init) => {
      const request = new Request(input, init);
      seen.push(request);
      return seen.length % 2 === 1
        ? Response.json({ code: 'expired_access_token' }, { status: 401 })
        : Response.json('accepted');
    },
    authentication: {
      credentials: async () => ({ accessToken: token }),
      refreshToken: async () => {
        token = 'updated';
        params.set('original', 'mutated');
        body.original = 'mutated';
      },
    },
  });
  await expect(
    service.get('/private', {
      params,
      headers: { 'x-request': 'request' },
      retries: 0,
      timeout: false,
    }),
  ).resolves.toBe('accepted');
  for (const request of seen) {
    expect(new URL(request.url).searchParams.get('original')).toBe('value');
    expect(request.headers.get('x-config')).toBe('configured');
    expect(request.headers.get('x-request')).toBe('request');
  }
  body.original = 'value';
  await expect(
    service.post('/private', { json: body, retry: false, timeout: false }),
  ).resolves.toBe('accepted');
  for (const request of seen.slice(2)) {
    expect(request.method).toBe('POST');
    expect(await request.json()).toEqual({ original: 'value' });
  }
});

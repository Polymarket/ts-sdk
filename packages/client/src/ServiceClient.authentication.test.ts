import { ApiKeySchema, type BearerCredentials } from '@polymarket/bindings';
import { expect, it, vi } from 'vitest';
import type { ClientCredentials } from './credentials';
import { type ServiceAuthentication, ServiceClient } from './ServiceClient';

const root = 'https://mock.invalid';

it('lets the owning class supply authentication and refresh policy', async () => {
  const original = {
    accessToken: 'original-opaque-token',
    refreshToken: 'original-refresh',
  };
  const updated = {
    accessToken: 'updated-opaque-token',
    refreshToken: 'updated-refresh',
  };
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
    authentication: bearerPolicy({
      credentials: async () => accepted,
      refreshToken,
    }),
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
    authentication: bearerPolicy({
      credentials: async () => {
        if (stage === 'credentials') {
          entered.resolve();
          await pending.promise;
        }
        return {
          accessToken: 'original-opaque-token',
          refreshToken: 'original-refresh',
        };
      },
      refreshToken: async () => {
        entered.resolve();
        await pending.promise;
      },
    }),
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
    authentication: bearerPolicy({
      credentials: async () => ({
        accessToken: 'opaque',
        refreshToken: 'opaque-refresh',
      }),
      refreshToken,
    }),
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
    authentication: bearerPolicy({
      credentials: async () => ({
        accessToken: token,
        refreshToken: 'opaque-refresh',
      }),
      refreshToken: async () => {
        token = 'updated';
        params.set('original', 'mutated');
        body.original = 'mutated';
      },
    }),
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

function bearerPolicy(policy: {
  credentials: (signal?: AbortSignal) => Promise<BearerCredentials>;
  refreshToken: (previous: string, signal?: AbortSignal) => Promise<void>;
}): ServiceAuthentication {
  return {
    credentials: policy.credentials,
    headers: (credentials) =>
      'accessToken' in credentials
        ? new Headers({ Authorization: `Bearer ${credentials.accessToken}` })
        : new Headers(),
    refreshToken: async (credentials, response, signal) => {
      const failure = await response.json();
      if (
        !('accessToken' in credentials) ||
        failure.code !== 'expired_access_token'
      )
        return false;
      await policy.refreshToken(credentials.accessToken, signal);
      return true;
    },
  };
}

it('lets a class authenticate with the existing legacy credential shape without bearer conversion', async () => {
  const credentials = {
    key: ApiKeySchema.parse('00000000-0000-0000-0000-000000000001'),
    secret: 'legacy-secret',
    passphrase: 'legacy-passphrase',
  };
  const refreshToken = vi.fn(async () => false);
  const service = new ServiceClient({
    root,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      expect(request.headers.get('authorization')).toBeNull();
      expect(request.headers.get('poly_api_key')).toBe(credentials.key);
      expect(request.headers.has('poly_secret')).toBe(false);
      return Response.json(
        {
          code: 'invalid_credentials',
          message: 'Legacy credentials rejected.',
        },
        { status: 401 },
      );
    },
    authentication: {
      credentials: async () => credentials,
      headers: (accepted, request) => {
        expect(request.path).toBe('/legacy');
        expect(accepted).toEqual(credentials);
        return 'key' in accepted
          ? new Headers({ POLY_API_KEY: accepted.key })
          : new Headers();
      },
      refreshToken: async (previous, response) => {
        expect(previous).toEqual(credentials);
        expect(await response.json()).toMatchObject({
          code: 'invalid_credentials',
        });
        return refreshToken();
      },
    },
  });
  // A policy may inspect its response copy without consuming transport's body.
  await expect(service.get('/legacy')).rejects.toMatchObject({
    status: 401,
    code: 'invalid_credentials',
  });
  expect(refreshToken).toHaveBeenCalledTimes(1);
});

it.each([
  undefined,
  null,
  { accessToken: 'opaque' },
  { accessToken: '', refreshToken: 'opaque-refresh' },
  { key: '00000000-0000-0000-0000-000000000001', secret: 'secret' },
  { key: 42, secret: 'secret', passphrase: 'passphrase' },
  {
    key: '00000000-0000-0000-0000-000000000001',
    secret: 'secret',
    passphrase: 'passphrase',
    accessToken: 'opaque',
    refreshToken: 'opaque-refresh',
  },
  { accessToken: 'opaque', refreshToken: 'opaque-refresh', key: undefined },
])('rejects malformed or mixed credentials before callbacks or dispatch: %j', async (input) => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const headers = vi.fn(() => ({}));
  const refreshToken = vi.fn(async () => false);
  const service = new ServiceClient({
    root,
    fetch,
    authentication: {
      credentials: async () => input as unknown as ClientCredentials,
      headers,
      refreshToken,
    },
  });
  await expect(service.get('/private')).rejects.toMatchObject({
    name: 'UserInputError',
  });
  expect(headers).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(refreshToken).not.toHaveBeenCalled();
});

it('accepts harmless token response metadata without exposing it as credentials', async () => {
  const headers = vi.fn(() => ({}));
  const service = new ServiceClient({
    root,
    fetch: async () => Response.json('accepted'),
    authentication: {
      credentials: async () => ({
        accessToken: 'opaque',
        refreshToken: 'opaque-refresh',
        tokenType: 'Bearer',
        expiresIn: 900,
      }),
      headers,
      refreshToken: async () => false,
    },
  });
  await service.get('/private');
  expect(headers.mock.calls[0]).toEqual([
    { accessToken: 'opaque', refreshToken: 'opaque-refresh' },
    expect.objectContaining({ path: '/private' }),
  ]);
});

it('cancels while a class header callback ignores its signal', async () => {
  const entered = Promise.withResolvers<void>();
  const pending = Promise.withResolvers<HeadersInit>();
  const abort = new AbortController();
  const service = new ServiceClient({
    root,
    authentication: {
      credentials: async () => ({
        accessToken: 'opaque',
        refreshToken: 'opaque-refresh',
      }),
      headers: () => {
        entered.resolve();
        return pending.promise;
      },
      refreshToken: async () => false,
    },
  });
  const request = service.get('/private', { signal: abort.signal });
  const rejected = expect(request).rejects.toMatchObject({
    name: 'RequestAbortedError',
  });
  await entered.promise;
  abort.abort();
  await rejected;
  pending.resolve({});
});

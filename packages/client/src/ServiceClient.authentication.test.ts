import { ApiKeySchema, type BearerCredentials } from '@polymarket/bindings';
import { expect, it, vi } from 'vitest';
import type { ClientCredentials } from './credentials';
import { type ServiceAuthentication, ServiceClient } from './ServiceClient';

const root = 'https://mock.invalid';

it.each([
  'credentials',
  'headers',
  'refresh',
])('cancels while a class %s callback ignores its signal', async (stage) => {
  const pending = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const abort = new AbortController();
  const waitAt = async (callback: string) => {
    if (stage === callback) {
      entered.resolve();
      await pending.promise;
    }
  };
  const service = new ServiceClient({
    root,
    fetch: async () => Response.json({}, { status: 401 }),
    authentication: {
      credentials: async () => {
        await waitAt('credentials');
        return { accessToken: 'opaque', refreshToken: 'opaque-refresh' };
      },
      headers: async () => {
        await waitAt('headers');
        return {};
      },
      refreshToken: async () => {
        await waitAt('refresh');
        return true;
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
      refreshToken: async (previous) => {
        expect(previous).toBe(token);
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
  expect(seen.map((request) => request.headers.get('authorization'))).toEqual([
    'Bearer original',
    'Bearer updated',
  ]);
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

it('lets a class authenticate with the existing L2 credential shape without bearer conversion', async () => {
  const credentials = {
    key: ApiKeySchema.parse('00000000-0000-0000-0000-000000000001'),
    secret: 'l2-secret',
    passphrase: 'l2-passphrase',
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
          message: 'L2 credentials rejected.',
        },
        { status: 401 },
      );
    },
    authentication: {
      credentials: async () => credentials,
      headers: (accepted, request) => {
        expect(request.path).toBe('/l2');
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
  await expect(service.get('/l2')).rejects.toMatchObject({
    status: 401,
    code: 'invalid_credentials',
  });
  expect(refreshToken).toHaveBeenCalledTimes(1);
});

it.each([
  undefined,
  { accessToken: 'opaque' },
  { key: '00000000-0000-0000-0000-000000000001', secret: 'secret' },
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

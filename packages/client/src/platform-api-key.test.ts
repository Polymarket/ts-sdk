// Login, renewal, logout, builder signing, gasless gating and the challenge
// proxy are covered live in tests/integration/authorization.test.ts. These
// cases cover adapter rules and proxy failures a live backend cannot produce.
import { inspect } from 'node:util';
import { expectEvmAddress } from '@polymarket/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { relayerApiKey, remotePlatformApiKey } from './authorization';
// biome-ignore lint/style/noRestrictedImports: This test exercises the server-only public adapter boundary.
import { platformApiKey } from './node';
import type { ApiKeyAuthorization, ApiKeyAuthorizationOptions } from './types';

const signer = expectEvmAddress('0x0000000000000000000000000000000000000001');
const key = 'pm_sk_synthetic-server-only';

afterEach(() => {
  vi.useRealTimers();
});

describe('platform adapters', () => {
  it('forwards submission authorization and takes gasless support from it alone', async () => {
    const relayer = relayerApiKey({
      key: 'synthetic-relayer',
      address: signer,
    });
    const direct = platformApiKey(key, { submissionApiKey: relayer });
    const remote = remotePlatformApiKey({ url: '/challenge' });

    expect(
      new Headers(
        await direct.authorize({ method: 'POST', path: '/submit' }),
      ).get('relayer_api_key'),
    ).toBe('synthetic-relayer');
    expect(direct.supportGasless).toBe(true);
    expect(platformApiKey(key).supportGasless).toBe(false);
    expect(remote.supportGasless).toBe(false);
    expect(inspect(direct, { depth: 10 })).not.toContain(key);
  });

  it('rejects a platform adapter nested as submission authorization', () => {
    expect(() =>
      platformApiKey(key, {
        submissionApiKey: platformApiKey('pm_sk_other-synthetic'),
      }),
    ).toThrow(/builder or submission/i);
    expect(() =>
      remotePlatformApiKey({
        url: '/challenge',
        submissionApiKey: remotePlatformApiKey({ url: '/other' }),
      }),
    ).toThrow(/builder or submission/i);
  });
});

describe('challenge proxy', () => {
  function createChallenge(
    adapter: ApiKeyAuthorization,
    options: ApiKeyAuthorizationOptions,
  ) {
    if (adapter.createChallenge === undefined)
      throw new Error('Missing challenge hook');
    return adapter.createChallenge({ signer }, options);
  }

  it('refuses a platform key in browser proxy headers before dispatch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const error = await createChallenge(
      remotePlatformApiKey({
        url: '/challenge',
        headers: { 'X-API-Key': key },
      }),
      { fetch },
    ).catch((failure: unknown) => failure);

    expect(error).toMatchObject({ name: 'UserInputError' });
    expect(inspect(error, { depth: 10 })).not.toContain(key);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'RequestRejectedError'],
    [503, 'RequestRejectedError'],
    ['transport', 'TransportError'],
  ] as const)('keeps reflected secrets out of a %s proxy failure', async (status, name) => {
    const message = `${key} synthetic-access-token`;
    const error = await createChallenge(
      remotePlatformApiKey({ url: '/challenge' }),
      {
        fetch: async () => {
          if (status === 'transport') throw new Error(message);
          return Response.json(
            { code: 'invalid_api_key', message },
            { status },
          );
        },
      },
    ).catch((failure: unknown) => failure);

    expect(error).toMatchObject({ name });
    expect(inspect(error, { depth: 10 })).not.toContain(key);
    expect(inspect(error, { depth: 10 })).not.toContain('synthetic-access');
  });

  it.each([
    [429, { 'retry-after': '7' }, {}, 'RateLimitError', 7],
    [503, {}, { retry_after_seconds: 30 }, 'RequestRejectedError', 30],
    [
      503,
      { 'retry-after': '5' },
      { retry_after_seconds: 30 },
      'RequestRejectedError',
      5,
    ],
  ] as const)('keeps the retry delay of a %s proxy answer', async (status, headers, hint, name, retryAfter) => {
    const error = await createChallenge(
      remotePlatformApiKey({ url: '/challenge' }),
      {
        fetch: async () =>
          Response.json(
            { code: 'busy', message: 'busy', ...hint },
            { status, headers },
          ),
      },
    ).catch((failure: unknown) => failure);

    expect(error).toMatchObject({ name, retryAfter });
  });

  it('cancels header resolution without dispatching a late challenge', async () => {
    const controller = new AbortController();
    const headers = Promise.withResolvers<HeadersInit>();
    const fetch = vi.fn<typeof globalThis.fetch>();
    const pending = createChallenge(
      remotePlatformApiKey({
        url: '/challenge',
        headers: () => headers.promise,
      }),
      { fetch, signal: controller.signal },
    );

    controller.abort();
    await expect(pending).rejects.toMatchObject({
      name: 'RequestAbortedError',
    });
    headers.resolve({ 'x-app-auth': 'late-app-session' });
    await headers.promise;
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bounds a stalled proxy request and clears its timer', async () => {
    vi.useFakeTimers();
    const adapter = remotePlatformApiKey({ url: '/challenge' });
    const rejected = expect(
      createChallenge(adapter, {
        fetch: () => new Promise<Response>(() => undefined),
      }),
    ).rejects.toMatchObject({ name: 'TransportError' });

    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});

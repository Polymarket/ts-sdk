import { describe, expect, it, vi } from 'vitest';
import { remoteBuilderSigning } from './authorization';
import { RequestAbortedError } from './errors';

describe('remoteBuilderSigning cancellation', () => {
  it('cancels pending remote signer headers before dispatching HTTP', async () => {
    const controller = new AbortController();
    const reason = new Error('Query replaced');
    const headers = Promise.withResolvers<HeadersInit>();
    const resolveHeaders = vi.fn(() => headers.promise);
    const fetch = vi.fn(globalThis.fetch);
    const authorization = remoteBuilderSigning({
      url: 'http://localhost:4010/api/builder/sign',
      headers: resolveHeaders,
    });
    const operation = authorization.authorize(
      { method: 'GET', path: '/builder/trades' },
      { fetch, signal: controller.signal },
    );
    const rejected = expect(operation).rejects.toMatchObject({
      name: 'RequestAbortedError',
      cause: reason,
    });

    expect(resolveHeaders).toHaveBeenCalledOnce();
    controller.abort(reason);
    await rejected;
    await expect(operation).rejects.toBeInstanceOf(RequestAbortedError);
    headers.resolve({ authorization: 'late token' });
    await headers.promise;
    expect(fetch).not.toHaveBeenCalled();
  });
});

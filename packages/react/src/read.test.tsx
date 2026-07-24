import type { BaseClient } from '@polymarket/client';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createConfig } from './config';
import { PolymarketProvider } from './context';
import { usePublicClientAction } from './read';
import type { Skip } from './skip';
import { skip } from './skip';

const config = createConfig();

function wrapper({ children }: { children: ReactNode }) {
  return <PolymarketProvider config={config}>{children}</PolymarketProvider>;
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type TestRequest = { id: string };

describe('usePublicClientAction', () => {
  it('loads data for the request', async () => {
    const action = vi.fn(
      async (_client: BaseClient, request: TestRequest) => `data:${request.id}`,
    );

    const { result } = renderHook(
      () => usePublicClientAction(action, { id: '1' }),
      {
        wrapper,
      },
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.data).toBe('data:1'));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeUndefined();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('surfaces action errors on `error`', async () => {
    const failure = new Error('nope');

    async function action(
      _client: BaseClient,
      _request: TestRequest,
    ): Promise<string> {
      throw failure;
    }

    const { result } = renderHook(
      () => usePublicClientAction(action, { id: '1' }),
      {
        wrapper,
      },
    );

    await waitFor(() => expect(result.current.error).toBe(failure));

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('does not refetch when an equivalent request is passed with a new identity', async () => {
    const action = vi.fn(
      async (_client: BaseClient, request: TestRequest) => `data:${request.id}`,
    );

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePublicClientAction(action, { id }),
      { wrapper, initialProps: { id: '1' } },
    );

    await waitFor(() => expect(result.current.data).toBe('data:1'));

    rerender({ id: '1' });
    await waitFor(() => expect(result.current.data).toBe('data:1'));

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('refetches when the request changes and discards stale responses', async () => {
    const deferreds = new Map<string, Deferred<string>>();

    async function action(
      _client: BaseClient,
      request: TestRequest,
    ): Promise<string> {
      const deferred = createDeferred<string>();
      deferreds.set(request.id, deferred);
      return deferred.promise;
    }

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePublicClientAction(action, { id }),
      { wrapper, initialProps: { id: '1' } },
    );

    await waitFor(() => expect(deferreds.has('1')).toBe(true));

    rerender({ id: '2' });
    await waitFor(() => expect(deferreds.has('2')).toBe(true));

    // The fresh request resolves first.
    await act(async () => {
      deferreds.get('2')?.resolve('data:2');
    });
    await waitFor(() => expect(result.current.data).toBe('data:2'));

    // The stale request resolves late and must be discarded.
    await act(async () => {
      deferreds.get('1')?.resolve('data:1');
    });

    expect(result.current.data).toBe('data:2');
  });

  it('pauses with `skip` and resumes when a request is provided', async () => {
    const action = vi.fn(
      async (_client: BaseClient, request: TestRequest) => `data:${request.id}`,
    );

    const { result, rerender } = renderHook(
      ({ request }: { request: TestRequest | Skip }) =>
        usePublicClientAction(action, request),
      { wrapper, initialProps: { request: skip as TestRequest | Skip } },
    );

    expect(result.current.isPaused).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(action).not.toHaveBeenCalled();

    rerender({ request: { id: '1' } });

    await waitFor(() => expect(result.current.data).toBe('data:1'));
    expect(result.current.isPaused).toBe(false);

    rerender({ request: skip });

    await waitFor(() => expect(result.current.isPaused).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('refetches on demand, keeping current data until the refetch settles', async () => {
    let value = 'first';

    const action = vi.fn(
      async (_client: BaseClient, _request: TestRequest) => value,
    );

    const { result } = renderHook(
      () => usePublicClientAction(action, { id: '1' }),
      {
        wrapper,
      },
    );

    await waitFor(() => expect(result.current.data).toBe('first'));

    value = 'second';

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toBe('second');
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('is a no-op to refetch while paused', async () => {
    const action = vi.fn(
      async (_client: BaseClient, _request: TestRequest) => 'data',
    );

    const { result } = renderHook(() => usePublicClientAction(action, skip), {
      wrapper,
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.isPaused).toBe(true);
    expect(action).not.toHaveBeenCalled();
  });

  it('fails clearly outside of a PolymarketProvider', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    async function action(
      _client: BaseClient,
      _request: TestRequest,
    ): Promise<string> {
      return 'data';
    }

    expect(() =>
      renderHook(() => usePublicClientAction(action, { id: '1' })),
    ).toThrow('`PolymarketProvider` is missing');

    consoleError.mockRestore();
  });
});

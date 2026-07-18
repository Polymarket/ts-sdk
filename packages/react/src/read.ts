import type { BaseClient } from '@polymarket/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePolymarketClient } from './context';
import { createRequestKey } from './request-key';
import type { Skip } from './skip';
import { skip } from './skip';

/**
 * A standalone client action performing a one-shot read.
 */
export type ClientAction<TRequest, TData> = (
  client: BaseClient,
  request: TRequest,
) => Promise<TData>;

/**
 * Result shape shared by all one-shot read hooks.
 */
export type ReadResult<TData, TError> = {
  /** Data for the current request, or `undefined` until available. */
  data: TData | undefined;
  /** Error from the last fetch, or `undefined`. */
  error: TError | undefined;
  /** True while the first fetch for the current request is in flight. */
  isLoading: boolean;
  /** True while the hook is paused with `skip`. */
  isPaused: boolean;
  /** Refetches the current request, keeping current data until it settles. */
  refetch: () => Promise<void>;
};

type ReadState<TData, TError> =
  | { status: 'paused'; data: undefined; error: undefined }
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'success'; data: TData; error: undefined }
  | { status: 'error'; data: undefined; error: TError };

const pausedState = {
  status: 'paused',
  data: undefined,
  error: undefined,
} satisfies ReadState<never, never>;

const loadingState = {
  status: 'loading',
  data: undefined,
  error: undefined,
} satisfies ReadState<never, never>;

/**
 * Binds a one-shot read action to the provider client as React state.
 *
 * @remarks
 * This is the low-level primitive behind the dedicated read hooks and the
 * escape hatch for client actions without one. It refetches when the request
 * changes, discards stale in-flight responses, and never updates state after
 * unmount. Errors thrown by the action surface on `error` instead of being
 * rethrown. Pass {@link skip} instead of a request to pause fetching.
 *
 * @throws {@link MissingProviderError}
 * Thrown when used outside of a `PolymarketProvider`.
 *
 * @example
 * ```ts
 * const { data: tags, isLoading } = useClientAction(fetchMarketTags, {
 *   id: '12345',
 * });
 * ```
 */
export function useClientAction<TRequest, TData, TError = unknown>(
  action: ClientAction<TRequest, TData>,
  request: TRequest | Skip,
): ReadResult<TData, TError> {
  const client = usePolymarketClient();
  const requestKey = request === skip ? undefined : createRequestKey(request);

  const actionRef = useRef(action);
  actionRef.current = action;
  const requestRef = useRef(request);
  requestRef.current = request;

  const generationRef = useRef(0);
  const [state, setState] = useState<ReadState<TData, TError>>(
    request === skip ? pausedState : loadingState,
  );

  const runFetch = useCallback(
    async (mode: 'initial' | 'refetch') => {
      const current = requestRef.current;

      if (current === skip) {
        return;
      }

      const generation = ++generationRef.current;

      if (mode === 'initial') {
        setState(loadingState);
      }

      try {
        const data = await actionRef.current(client, current);

        if (generationRef.current === generation) {
          setState({ status: 'success', data, error: undefined });
        }
      } catch (error) {
        if (generationRef.current === generation) {
          setState({
            status: 'error',
            data: undefined,
            error: error as TError,
          });
        }
      }
    },
    [client],
  );

  useEffect(() => {
    if (requestKey === undefined) {
      generationRef.current += 1;
      setState(pausedState);
      return;
    }

    void runFetch('initial');

    return () => {
      generationRef.current += 1;
    };
  }, [requestKey, runFetch]);

  const refetch = useCallback(() => runFetch('refetch'), [runFetch]);

  return {
    data: state.data,
    error: state.error,
    isLoading: state.status === 'loading',
    isPaused: state.status === 'paused',
    refetch,
  };
}

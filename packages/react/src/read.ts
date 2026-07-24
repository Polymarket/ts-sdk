import type { BaseClient, BaseSecureClient } from '@polymarket/client';
import { RequestRejectedError } from '@polymarket/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePolymarketContext } from './context';
import { createRequestKey } from './request-key';
import type { Skip } from './skip';
import { skip } from './skip';

/**
 * A standalone client action performing a one-shot read.
 *
 * @internal
 */
export type PublicClientAction<TRequest, TData> = (
  client: BaseClient,
  request: TRequest,
) => Promise<TData>;

/**
 * A standalone client action performing a one-shot authenticated read.
 *
 * @internal
 */
export type SecureClientAction<TRequest, TData> = (
  client: BaseSecureClient,
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
  /** True while the hook is paused with `skip` or awaiting authentication. */
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
 * Shared one-shot read state machine. Pauses while the client is unavailable
 * or the request is `skip`, refetches on request or client change, discards
 * stale in-flight responses, and never updates state after unmount.
 */
function useReadState<TClient, TRequest, TData, TError>(
  client: TClient | undefined,
  action: (client: TClient, request: TRequest) => Promise<TData>,
  request: TRequest | Skip,
  onError?: (error: unknown) => void,
): ReadResult<TData, TError> {
  const paused = request === skip || client === undefined;
  const requestKey = request === skip ? undefined : createRequestKey(request);

  const actionRef = useRef(action);
  actionRef.current = action;
  const requestRef = useRef(request);
  requestRef.current = request;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const generationRef = useRef(0);
  const [state, setState] = useState<ReadState<TData, TError>>(
    paused ? pausedState : loadingState,
  );

  const runFetch = useCallback(
    async (mode: 'initial' | 'refetch') => {
      const current = requestRef.current;

      if (current === skip || client === undefined) {
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
          onErrorRef.current?.(error);
        }
      }
    },
    [client],
  );

  useEffect(() => {
    if (requestKey === undefined || client === undefined) {
      generationRef.current += 1;
      setState(pausedState);
      return;
    }

    void runFetch('initial');

    return () => {
      generationRef.current += 1;
    };
  }, [requestKey, client, runFetch]);

  const refetch = useCallback(() => runFetch('refetch'), [runFetch]);

  return {
    data: state.data,
    error: state.error,
    isLoading: state.status === 'loading',
    isPaused: state.status === 'paused',
    refetch,
  };
}

/**
 * Binds a one-shot read action to the provider client as React state.
 *
 * @remarks
 * This is the low-level primitive behind the dedicated read hooks. It
 * refetches when the request changes, discards stale in-flight responses,
 * and never updates state after unmount. Errors thrown by the action surface
 * on `error` instead of being rethrown. Pass {@link skip} instead of a
 * request to pause fetching.
 *
 * @internal
 *
 * @example
 * ```ts
 * const { data: tags, isLoading } = usePublicClientAction(fetchMarketTags, {
 *   id: '12345',
 * });
 * ```
 */
export function usePublicClientAction<TRequest, TData, TError = unknown>(
  action: PublicClientAction<TRequest, TData>,
  request: TRequest | Skip,
): ReadResult<TData, TError> {
  const { publicClient } = usePolymarketContext();

  return useReadState(publicClient, action, request);
}

/**
 * Binds a one-shot authenticated read action to the session client as React
 * state.
 *
 * @remarks
 * This is the secure sibling of {@link usePublicClientAction}. It pauses
 * until a session is active, and a request rejected as unauthorized ends the
 * session, transitioning the provider back to `'unauthenticated'`.
 *
 * @internal
 */
export function useSecureClientAction<TRequest, TData, TError = unknown>(
  action: SecureClientAction<TRequest, TData>,
  request: TRequest | Skip,
): ReadResult<TData, TError> {
  const { secureClient, clearSession } = usePolymarketContext();

  const onError = useCallback(
    (error: unknown) => {
      if (isSessionRevocation(error)) {
        clearSession(error);
      }
    },
    [clearSession],
  );

  return useReadState(secureClient, action, request, onError);
}

/** @internal */
export function isSessionRevocation(error: unknown): boolean {
  return error instanceof RequestRejectedError && error.status === 401;
}

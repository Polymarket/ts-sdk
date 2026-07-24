import type {
  BaseClient,
  BaseSecureClient,
  Paginated,
  PaginationCursor,
} from '@polymarket/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePolymarketContext } from './context';
import { isSessionRevocation } from './read';
import { createRequestKey } from './request-key';
import type { Skip } from './skip';
import { skip } from './skip';

/**
 * A standalone client action returning SDK pagination.
 *
 * @internal
 */
export type PublicPaginatedClientAction<TRequest, TItem> = (
  client: BaseClient,
  request: TRequest,
) => Paginated<TItem[]>;

/**
 * A standalone client action returning authenticated SDK pagination.
 *
 * @internal
 */
export type SecurePaginatedClientAction<TRequest, TItem> = (
  client: BaseSecureClient,
  request: TRequest,
) => Paginated<TItem[]>;

/**
 * Result shape shared by all paginated read hooks.
 */
export type PaginatedReadResult<TItem, TError> = {
  /** Accumulated items across all fetched pages, or `undefined` until available. */
  data: TItem[] | undefined;
  /** Error from the last page fetch, or `undefined`. */
  error: TError | undefined;
  /** True while the first page for the current request is in flight. */
  isLoading: boolean;
  /** True while the hook is paused with `skip` or awaiting authentication. */
  isPaused: boolean;
  /** True when more pages can be fetched. */
  hasNextPage: boolean;
  /** True while a next page fetch is in flight. */
  isFetchingNextPage: boolean;
  /** Fetches the next page and appends its items to `data`. */
  fetchNextPage: () => Promise<void>;
  /** Resets to the first page of the current request. */
  refetch: () => Promise<void>;
};

type PaginatedState<TItem, TError> = {
  status: 'paused' | 'loading' | 'success' | 'error';
  items: TItem[] | undefined;
  error: TError | undefined;
  nextCursor: PaginationCursor | undefined;
  isFetchingNextPage: boolean;
};

const pausedState = {
  status: 'paused',
  items: undefined,
  error: undefined,
  nextCursor: undefined,
  isFetchingNextPage: false,
} satisfies PaginatedState<never, never>;

const loadingState = {
  status: 'loading',
  items: undefined,
  error: undefined,
  nextCursor: undefined,
  isFetchingNextPage: false,
} satisfies PaginatedState<never, never>;

/**
 * Shared infinite-scroll state machine over `Paginated<T>` actions. Pauses
 * while the client is unavailable or the request is `skip`, resets on request
 * or client change, discards stale in-flight responses, and never updates
 * state after unmount.
 */
function usePaginatedState<TClient, TRequest, TItem, TError>(
  client: TClient | undefined,
  action: (client: TClient, request: TRequest) => Paginated<TItem[]>,
  request: TRequest | Skip,
  onError?: (error: unknown) => void,
): PaginatedReadResult<TItem, TError> {
  const paused = request === skip || client === undefined;
  const requestKey = request === skip ? undefined : createRequestKey(request);

  const actionRef = useRef(action);
  actionRef.current = action;
  const requestRef = useRef(request);
  requestRef.current = request;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const generationRef = useRef(0);
  const [state, setState] = useState<PaginatedState<TItem, TError>>(
    paused ? pausedState : loadingState,
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadFirstPage = useCallback(async () => {
    const current = requestRef.current;

    if (current === skip || client === undefined) {
      return;
    }

    const generation = ++generationRef.current;
    setState(loadingState);

    try {
      const page = await actionRef.current(client, current).firstPage();

      if (generationRef.current === generation) {
        setState({
          status: 'success',
          items: page.items,
          error: undefined,
          nextCursor: page.hasMore ? page.nextCursor : undefined,
          isFetchingNextPage: false,
        });
      }
    } catch (error) {
      if (generationRef.current === generation) {
        setState({
          status: 'error',
          items: undefined,
          error: error as TError,
          nextCursor: undefined,
          isFetchingNextPage: false,
        });
        onErrorRef.current?.(error);
      }
    }
  }, [client]);

  useEffect(() => {
    if (requestKey === undefined || client === undefined) {
      generationRef.current += 1;
      setState(pausedState);
      return;
    }

    void loadFirstPage();

    return () => {
      generationRef.current += 1;
    };
  }, [requestKey, client, loadFirstPage]);

  const fetchNextPage = useCallback(async () => {
    const current = stateRef.current;
    const currentRequest = requestRef.current;

    if (
      currentRequest === skip ||
      client === undefined ||
      current.status !== 'success' ||
      current.nextCursor === undefined ||
      current.isFetchingNextPage
    ) {
      return;
    }

    const generation = generationRef.current;
    setState((previous) => ({ ...previous, isFetchingNextPage: true }));

    try {
      const page = await actionRef
        .current(client, currentRequest)
        .from(current.nextCursor)
        .firstPage();

      if (generationRef.current === generation) {
        setState((previous) => ({
          status: 'success',
          items: [...(previous.items ?? []), ...page.items],
          error: undefined,
          nextCursor: page.hasMore ? page.nextCursor : undefined,
          isFetchingNextPage: false,
        }));
      }
    } catch (error) {
      if (generationRef.current === generation) {
        setState((previous) => ({
          ...previous,
          error: error as TError,
          isFetchingNextPage: false,
        }));
        onErrorRef.current?.(error);
      }
    }
  }, [client]);

  return {
    data: state.items,
    error: state.error,
    isLoading: state.status === 'loading',
    isPaused: state.status === 'paused',
    hasNextPage: state.nextCursor !== undefined,
    isFetchingNextPage: state.isFetchingNextPage,
    fetchNextPage,
    refetch: loadFirstPage,
  };
}

/**
 * Binds a paginated read action to the provider client as infinite-scroll
 * React state.
 *
 * @remarks
 * This is the low-level primitive behind the dedicated paginated hooks.
 * `data` is the flattened accumulation of all fetched pages; page boundaries
 * and cursors stay internal. Errors thrown by the action surface on `error`
 * instead of being rethrown; a failed next page fetch keeps the items
 * accumulated so far. Pass {@link skip} instead of a request to pause
 * fetching.
 *
 * @internal
 */
export function usePublicPaginatedAction<TRequest, TItem, TError = unknown>(
  action: PublicPaginatedClientAction<TRequest, TItem>,
  request: TRequest | Skip,
): PaginatedReadResult<TItem, TError> {
  const { publicClient } = usePolymarketContext();

  return usePaginatedState(publicClient, action, request);
}

/**
 * Binds an authenticated paginated read action to the session client as
 * infinite-scroll React state.
 *
 * @remarks
 * This is the secure sibling of {@link usePublicPaginatedAction}. It pauses
 * until a session is active, and a request rejected as unauthorized ends the
 * session, transitioning the provider back to `'unauthenticated'`.
 *
 * @internal
 */
export function useSecurePaginatedAction<TRequest, TItem, TError = unknown>(
  action: SecurePaginatedClientAction<TRequest, TItem>,
  request: TRequest | Skip,
): PaginatedReadResult<TItem, TError> {
  const { secureClient, clearSession } = usePolymarketContext();

  const onError = useCallback(
    (error: unknown) => {
      if (isSessionRevocation(error)) {
        clearSession(error);
      }
    },
    [clearSession],
  );

  return usePaginatedState(secureClient, action, request, onError);
}

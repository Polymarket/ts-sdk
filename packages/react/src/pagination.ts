import type {
  BaseClient,
  Paginated,
  PaginationCursor,
} from '@polymarket/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePolymarketClient } from './context';
import { createRequestKey } from './request-key';
import type { Skip } from './skip';
import { skip } from './skip';

/**
 * A standalone client action returning SDK pagination.
 */
export type PaginatedClientAction<TRequest, TItem> = (
  client: BaseClient,
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
  /** True while the hook is paused with `skip`. */
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
 * Binds a paginated read action to the provider client as infinite-scroll
 * React state.
 *
 * @remarks
 * This is the low-level primitive behind the dedicated paginated hooks and
 * the escape hatch for paginated client actions without one. `data` is the
 * flattened accumulation of all fetched pages; page boundaries and cursors
 * stay internal. It resets when the request changes, discards stale in-flight
 * responses, and never updates state after unmount. Errors thrown by the
 * action surface on `error` instead of being rethrown; a failed next page
 * fetch keeps the items accumulated so far. Pass {@link skip} instead of a
 * request to pause fetching.
 *
 * @throws {@link MissingProviderError}
 * Thrown when used outside of a `PolymarketProvider`.
 *
 * @example
 * ```ts
 * const { data: holders, fetchNextPage, hasNextPage } = usePaginatedAction(
 *   listMarketHolders,
 *   { conditionId },
 * );
 * ```
 */
export function usePaginatedAction<TRequest, TItem, TError = unknown>(
  action: PaginatedClientAction<TRequest, TItem>,
  request: TRequest | Skip,
): PaginatedReadResult<TItem, TError> {
  const client = usePolymarketClient();
  const requestKey = request === skip ? undefined : createRequestKey(request);

  const actionRef = useRef(action);
  actionRef.current = action;
  const requestRef = useRef(request);
  requestRef.current = request;

  const generationRef = useRef(0);
  const [state, setState] = useState<PaginatedState<TItem, TError>>(
    request === skip ? pausedState : loadingState,
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadFirstPage = useCallback(async () => {
    const current = requestRef.current;

    if (current === skip) {
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
      }
    }
  }, [client]);

  useEffect(() => {
    if (requestKey === undefined) {
      generationRef.current += 1;
      setState(pausedState);
      return;
    }

    void loadFirstPage();

    return () => {
      generationRef.current += 1;
    };
  }, [requestKey, loadFirstPage]);

  const fetchNextPage = useCallback(async () => {
    const current = stateRef.current;
    const currentRequest = requestRef.current;

    if (
      currentRequest === skip ||
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

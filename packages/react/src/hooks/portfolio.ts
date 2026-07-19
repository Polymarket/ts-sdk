import type {
  Activity,
  ClosedPosition,
  Position,
  Value,
} from '@polymarket/client';
import type {
  FetchPortfolioValueError,
  FetchPortfolioValueRequest,
  ListActivityError,
  ListActivityRequest,
  ListClosedPositionsError,
  ListClosedPositionsRequest,
  ListPositionsError,
  ListPositionsRequest,
} from '@polymarket/client/actions';
import {
  fetchPortfolioValue,
  listActivity,
  listClosedPositions,
  listPositions,
} from '@polymarket/client/actions';
import { usePolymarketContext } from '../context';
import type { PaginatedReadResult } from '../pagination';
import { usePublicPaginatedAction } from '../pagination';
import type { ReadResult } from '../read';
import { usePublicClientAction } from '../read';
import type { Skip } from '../skip';
import { skip } from '../skip';

/**
 * Resolves the target address of a per-address read, defaulting to the
 * session wallet. Resolves to `skip` (paused) while no address is available.
 *
 * @internal
 */
function useSessionUserRequest<TRequest extends { user?: string }>(
  request: TRequest | Skip,
): (TRequest & { user: string }) | Skip {
  const { auth } = usePolymarketContext();

  if (request === skip) {
    return skip;
  }

  const user = request.user ?? auth.session?.wallet;

  return user === undefined ? skip : { ...request, user };
}

export type UsePositionsRequest = Omit<ListPositionsRequest, 'user'> & {
  /**
   * Address to read positions for.
   *
   * @defaultValue The session wallet.
   */
  user?: string;
};

/**
 * Lists a user's open positions as infinite-scroll state.
 *
 * @remarks
 * Without an explicit `user`, reads the session wallet's positions and pauses
 * while unauthenticated. With an explicit `user`, works without a session —
 * position data is public per address. `data` accumulates positions across
 * all fetched pages. Errors surface on `error` as {@link ListPositionsError}.
 *
 * @example
 * ```tsx
 * const { data: positions, isPaused } = usePositions();
 *
 * const { data: theirPositions } = usePositions({ user: profileAddress });
 * ```
 */
export function usePositions(
  request: UsePositionsRequest | Skip = {},
): PaginatedReadResult<Position, ListPositionsError> {
  return usePublicPaginatedAction<
    ListPositionsRequest,
    Position,
    ListPositionsError
  >(listPositions, useSessionUserRequest(request));
}

export type UseClosedPositionsRequest = Omit<
  ListClosedPositionsRequest,
  'user'
> & {
  /**
   * Address to read closed positions for.
   *
   * @defaultValue The session wallet.
   */
  user?: string;
};

/**
 * Lists a user's closed positions as infinite-scroll state.
 *
 * @remarks
 * Without an explicit `user`, reads the session wallet's closed positions and
 * pauses while unauthenticated. With an explicit `user`, works without a
 * session. `data` accumulates positions across all fetched pages. Errors
 * surface on `error` as {@link ListClosedPositionsError}.
 *
 * @example
 * ```tsx
 * const { data: closedPositions, fetchNextPage, hasNextPage } =
 *   useClosedPositions();
 * ```
 */
export function useClosedPositions(
  request: UseClosedPositionsRequest | Skip = {},
): PaginatedReadResult<ClosedPosition, ListClosedPositionsError> {
  return usePublicPaginatedAction<
    ListClosedPositionsRequest,
    ClosedPosition,
    ListClosedPositionsError
  >(listClosedPositions, useSessionUserRequest(request));
}

export type UsePortfolioValueRequest = Omit<
  FetchPortfolioValueRequest,
  'user'
> & {
  /**
   * Address to read the portfolio value for.
   *
   * @defaultValue The session wallet.
   */
  user?: string;
};

/**
 * Fetches a user's current portfolio value.
 *
 * @remarks
 * Without an explicit `user`, reads the session wallet's portfolio value and
 * pauses while unauthenticated. With an explicit `user`, works without a
 * session. Errors surface on `error` as {@link FetchPortfolioValueError}.
 *
 * @example
 * ```tsx
 * const { data: value, isLoading } = usePortfolioValue();
 * ```
 */
export function usePortfolioValue(
  request: UsePortfolioValueRequest | Skip = {},
): ReadResult<Value[], FetchPortfolioValueError> {
  return usePublicClientAction<
    FetchPortfolioValueRequest,
    Value[],
    FetchPortfolioValueError
  >(fetchPortfolioValue, useSessionUserRequest(request));
}

export type UseActivityRequest = Omit<ListActivityRequest, 'user'> & {
  /**
   * Address to read activity for.
   *
   * @defaultValue The session wallet.
   */
  user?: string;
};

/**
 * Lists a user's on-chain activity (trades, splits, merges, redemptions) as
 * infinite-scroll state.
 *
 * @remarks
 * Without an explicit `user`, reads the session wallet's activity and pauses
 * while unauthenticated. With an explicit `user`, works without a session.
 * `data` accumulates entries across all fetched pages. Errors surface on
 * `error` as {@link ListActivityError}.
 *
 * @example
 * ```tsx
 * const { data: activity, fetchNextPage, hasNextPage } = useActivity();
 * ```
 */
export function useActivity(
  request: UseActivityRequest | Skip = {},
): PaginatedReadResult<Activity, ListActivityError> {
  return usePublicPaginatedAction<
    ListActivityRequest,
    Activity,
    ListActivityError
  >(listActivity, useSessionUserRequest(request));
}

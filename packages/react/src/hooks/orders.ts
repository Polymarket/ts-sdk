import type { OpenOrder } from '@polymarket/client';
import type {
  FetchOrderError,
  FetchOrderRequest,
  ListOpenOrdersError,
  ListOpenOrdersRequest,
} from '@polymarket/client/actions';
import { fetchOrder, listOpenOrders } from '@polymarket/client/actions';
import type { PaginatedReadResult } from '../pagination';
import { useSecurePaginatedAction } from '../pagination';
import type { ReadResult } from '../read';
import { useSecureClientAction } from '../read';
import type { Skip } from '../skip';

/**
 * Lists the session account's open orders as infinite-scroll state.
 *
 * @remarks
 * Pauses until a session is active. `data` accumulates orders across all
 * fetched pages; call `fetchNextPage` to load more while `hasNextPage` is
 * true. Errors surface on `error` as {@link ListOpenOrdersError}. Pass `skip`
 * instead of the request to pause fetching.
 *
 * @example
 * ```tsx
 * const { data: orders, isPaused } = useOpenOrders();
 * ```
 */
export function useOpenOrders(
  request: ListOpenOrdersRequest | Skip = {},
): PaginatedReadResult<OpenOrder, ListOpenOrdersError> {
  return useSecurePaginatedAction<
    ListOpenOrdersRequest,
    OpenOrder,
    ListOpenOrdersError
  >(listOpenOrders, request);
}

/**
 * Fetches one of the session account's orders by ID.
 *
 * @remarks
 * Pauses until a session is active. Errors surface on `error` as
 * {@link FetchOrderError}. Pass `skip` instead of the request to pause
 * fetching, such as while no order is selected.
 *
 * @example
 * ```tsx
 * const { data: order } = useOrder(orderId ? { orderId } : skip);
 * ```
 */
export function useOrder(
  request: FetchOrderRequest | Skip,
): ReadResult<OpenOrder, FetchOrderError> {
  return useSecureClientAction<FetchOrderRequest, OpenOrder, FetchOrderError>(
    fetchOrder,
    request,
  );
}

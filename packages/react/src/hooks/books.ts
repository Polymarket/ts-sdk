import type { OrderBook } from '@polymarket/client';
import type {
  FetchOrderBookError,
  FetchOrderBookRequest,
} from '@polymarket/client/actions';
import { fetchOrderBook } from '@polymarket/client/actions';
import type { ReadResult } from '../read';
import { usePublicClientAction } from '../read';
import type { Skip } from '../skip';

/**
 * Fetches the current order book for a token.
 *
 * @remarks
 * Errors surface on `error` as {@link FetchOrderBookError}. Pass `skip`
 * instead of the request to pause fetching, such as while the token is not
 * selected yet.
 *
 * @example
 * ```tsx
 * const { data: book, isPaused } = useOrderBook(
 *   tokenId ? { tokenId } : skip,
 * );
 * ```
 */
export function useOrderBook(
  request: FetchOrderBookRequest | Skip,
): ReadResult<OrderBook, FetchOrderBookError> {
  return usePublicClientAction<
    FetchOrderBookRequest,
    OrderBook,
    FetchOrderBookError
  >(fetchOrderBook, request);
}

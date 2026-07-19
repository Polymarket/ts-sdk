import type { OrderBook } from '@polymarket/client';
import type {
  EstimateMarketPriceError,
  EstimateMarketPriceRequest,
  FetchOrderBookError,
  FetchOrderBookRequest,
} from '@polymarket/client/actions';
import {
  estimateMarketPrice,
  fetchOrderBook,
} from '@polymarket/client/actions';
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

/**
 * Estimates the price level a market order would cross at current book depth.
 *
 * @remarks
 * The execution preview for market-order forms: pair it with the
 * `minPrice`/`maxPrice` slippage bounds of `usePlaceMarketOrder`. For BUY
 * orders `amount` is collateral to spend; for SELL orders `shares` is shares
 * to sell. The estimate reflects the book at fetch time and goes stale as the
 * book moves; call `refetch` to refresh it. Errors surface on `error` as
 * {@link EstimateMarketPriceError}, including insufficient book depth for
 * full-fill (FOK) estimates. Pass `skip` instead of the request to pause,
 * such as while the amount input is empty.
 *
 * @example
 * ```tsx
 * const { data: estimatedPrice } = useEstimatedMarketPrice(
 *   amount > 0 ? { tokenId, side: OrderSide.BUY, amount } : skip,
 * );
 * ```
 */
export function useEstimatedMarketPrice(
  request: EstimateMarketPriceRequest | Skip,
): ReadResult<number, EstimateMarketPriceError> {
  return usePublicClientAction<
    EstimateMarketPriceRequest,
    number,
    EstimateMarketPriceError
  >(estimateMarketPrice, request);
}

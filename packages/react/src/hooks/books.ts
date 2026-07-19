import type {
  DecimalString,
  LastTradePrice,
  OrderBook,
  PriceHistoryPoint,
} from '@polymarket/client';
import type {
  EstimateMarketPriceError,
  EstimateMarketPriceRequest,
  FetchLastTradePriceError,
  FetchLastTradePriceRequest,
  FetchMidpointError,
  FetchMidpointRequest,
  FetchOrderBookError,
  FetchOrderBookRequest,
  FetchPriceHistoryError,
  FetchPriceHistoryRequest,
} from '@polymarket/client/actions';
import {
  estimateMarketPrice,
  fetchLastTradePrice,
  fetchMidpoint,
  fetchOrderBook,
  fetchPriceHistory,
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

/**
 * Fetches a token's price history for charting.
 *
 * @remarks
 * Errors surface on `error` as {@link FetchPriceHistoryError}. Pass `skip`
 * instead of the request to pause fetching.
 *
 * @example
 * ```tsx
 * const { data: history } = usePriceHistory({
 *   tokenId,
 *   interval: PriceHistoryInterval.ONE_DAY,
 * });
 * ```
 */
export function usePriceHistory(
  request: FetchPriceHistoryRequest | Skip,
): ReadResult<PriceHistoryPoint[], FetchPriceHistoryError> {
  return usePublicClientAction<
    FetchPriceHistoryRequest,
    PriceHistoryPoint[],
    FetchPriceHistoryError
  >(fetchPriceHistory, request);
}

/**
 * Fetches the midpoint between a token's best bid and best ask.
 *
 * @remarks
 * Errors surface on `error` as {@link FetchMidpointError}. Pass `skip`
 * instead of the request to pause fetching.
 *
 * @example
 * ```tsx
 * const { data: midpoint } = useMidpoint({ tokenId });
 * ```
 */
export function useMidpoint(
  request: FetchMidpointRequest | Skip,
): ReadResult<DecimalString, FetchMidpointError> {
  return usePublicClientAction<
    FetchMidpointRequest,
    DecimalString,
    FetchMidpointError
  >(fetchMidpoint, request);
}

/**
 * Fetches a token's last trade price.
 *
 * @remarks
 * Errors surface on `error` as {@link FetchLastTradePriceError}. Pass `skip`
 * instead of the request to pause fetching.
 *
 * @example
 * ```tsx
 * const { data: lastTrade } = useLastTradePrice({ tokenId });
 * ```
 */
export function useLastTradePrice(
  request: FetchLastTradePriceRequest | Skip,
): ReadResult<LastTradePrice, FetchLastTradePriceError> {
  return usePublicClientAction<
    FetchLastTradePriceRequest,
    LastTradePrice,
    FetchLastTradePriceError
  >(fetchLastTradePrice, request);
}

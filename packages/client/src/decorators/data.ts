import type { DecimalString } from '@polymarket/bindings';
import type {
  LastTradePrice,
  LastTradePriceForAsset,
  Midpoints,
  OrderBook,
  PriceHistoryPoint,
  Prices,
  Spreads,
} from '@polymarket/bindings/clob';
import type {
  LiveVolume,
  MetaHolder,
  OpenInterest,
  Trade,
} from '@polymarket/bindings/data';
import {
  type EstimateMarketPriceRequest,
  estimateMarketPrice,
  type FetchEventLiveVolumeRequest,
  type FetchLastTradePriceRequest,
  type FetchLastTradePricesRequest,
  type FetchMidpointRequest,
  type FetchMidpointsRequest,
  type FetchOrderBookRequest,
  type FetchOrderBooksRequest,
  type FetchPriceHistoryRequest,
  type FetchPriceRequest,
  type FetchPricesRequest,
  type FetchSpreadRequest,
  type FetchSpreadsRequest,
  fetchEventLiveVolume,
  fetchLastTradePrice,
  fetchLastTradePrices,
  fetchMidpoint,
  fetchMidpoints,
  fetchOrderBook,
  fetchOrderBooks,
  fetchPrice,
  fetchPriceHistory,
  fetchPrices,
  fetchSpread,
  fetchSpreads,
  type ListMarketHoldersRequest,
  type ListOpenInterestRequest,
  type ListTradesRequest,
  listMarketHolders,
  listOpenInterest,
  listTrades,
} from '../actions';
import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '../clients';
import type { Paginated } from '../pagination';

export type DataActions = {
  /**
   * Fetches live volume for an event.
   *
   * @throws {@link FetchEventLiveVolumeError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const volume = await client.fetchEventLiveVolume({ id: '123' });
   * ```
   */
  fetchEventLiveVolume(
    request: FetchEventLiveVolumeRequest,
  ): Promise<LiveVolume[]>;
  /**
   * Fetches the midpoint price for an exchange asset as a decimal string.
   *
   * @throws {@link FetchMidpointError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const midpoint = await client.fetchMidpoint({ assetId: '0x0122…0000' });
   * ```
   */
  fetchMidpoint(request: FetchMidpointRequest): Promise<DecimalString>;
  /**
   * Fetches midpoint prices for multiple exchange assets as an asset ID keyed lookup.
   *
   * @throws {@link FetchMidpointsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const midpoints = await client.fetchMidpoints([{ assetId: '0x0122…0000' }]);
   * ```
   */
  fetchMidpoints(request: FetchMidpointsRequest): Promise<Midpoints>;
  /**
   * Fetches the current quoted price for an exchange asset and side as a decimal string.
   *
   * @throws {@link FetchPriceError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const price = await client.fetchPrice({ assetId: '0x0122…0000', side: OrderSide.BUY });
   * ```
   */
  fetchPrice(request: FetchPriceRequest): Promise<DecimalString>;
  /**
   * Fetches quoted prices for multiple exchange assets as an asset ID keyed lookup.
   *
   * @throws {@link FetchPricesError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const prices = await client.fetchPrices([{ assetId: '0x0122…0000', side: OrderSide.BUY }]);
   * ```
   */
  fetchPrices(request: FetchPricesRequest): Promise<Prices>;
  /**
   * Fetches the current order book for an exchange asset.
   *
   * @throws {@link FetchOrderBookError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const book = await client.fetchOrderBook({ assetId: '0x0122…0000' });
   * ```
   */
  fetchOrderBook(request: FetchOrderBookRequest): Promise<OrderBook>;
  /**
   * Fetches order books for multiple exchange assets.
   *
   * @throws {@link FetchOrderBooksError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const books = await client.fetchOrderBooks([{ assetId: '0x0122…0000' }]);
   * ```
   */
  fetchOrderBooks(request: FetchOrderBooksRequest): Promise<OrderBook[]>;
  /**
   * Fetches the spread for an exchange asset as a decimal string.
   *
   * @throws {@link FetchSpreadError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const spread = await client.fetchSpread({ assetId: '0x0122…0000' });
   * ```
   */
  fetchSpread(request: FetchSpreadRequest): Promise<DecimalString>;
  /**
   * Fetches spreads for multiple exchange assets as an asset ID keyed lookup.
   *
   * @throws {@link FetchSpreadsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const spreads = await client.fetchSpreads([{ assetId: '0x0122…0000' }]);
   * ```
   */
  fetchSpreads(request: FetchSpreadsRequest): Promise<Spreads>;
  /**
   * Fetches the last traded price for an exchange asset.
   *
   * Returns `null` when the asset has not traded.
   *
   * @throws {@link FetchLastTradePriceError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const trade = await client.fetchLastTradePrice({ assetId: '0x0122…0000' });
   *
   * // trade === LastTradePrice | null
   * ```
   */
  fetchLastTradePrice(
    request: FetchLastTradePriceRequest,
  ): Promise<LastTradePrice | null>;
  /**
   * Fetches last traded prices for multiple exchange assets.
   *
   * Assets without trades are omitted from the response. Match returned rows by
   * `assetId`; the array is not positionally aligned with the request.
   *
   * @throws {@link FetchLastTradePricesError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const trades = await client.fetchLastTradePrices([{ assetId: '0x0122…0000' }]);
   * const trade = trades.find((candidate) => candidate.assetId === '0x0122…0000');
   * ```
   */
  fetchLastTradePrices(
    request: FetchLastTradePricesRequest,
  ): Promise<LastTradePriceForAsset[]>;
  /**
   * Fetches historical price points for an exchange asset.
   *
   * @throws {@link FetchPriceHistoryError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const history = await client.fetchPriceHistory({ assetId: '0x0122…0000', interval: '1d' });
   * ```
   */
  fetchPriceHistory(
    request: FetchPriceHistoryRequest,
  ): Promise<PriceHistoryPoint[]>;
  /**
   * Estimates the price level a market order would cross at current book depth.
   *
   * For BUY orders, `amount` is the amount of collateral to spend. For SELL
   * orders, `shares` is the number of shares to sell.
   *
   * @throws {@link EstimateMarketPriceError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const price = await client.estimateMarketPrice({
   *   assetId: '0x0122…0000',
   *   side: OrderSide.BUY,
   *   amount: 10,
   * });
   * ```
   */
  estimateMarketPrice(request: EstimateMarketPriceRequest): Promise<number>;
  /**
   * Lists open interest for one or more markets.
   *
   * @throws {@link ListOpenInterestError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const openInterest = await client.listOpenInterest({
   *   market: ['0xe546672750517f62c45a5a00067481981e62b9c20fa8220203232c9dc8fd2093'],
   * });
   * ```
   */
  listOpenInterest(request?: ListOpenInterestRequest): Promise<OpenInterest[]>;
  /**
   * Lists the top holders for one or more markets.
   *
   * @throws {@link ListMarketHoldersError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const holders = await client.listMarketHolders({
   *   market: ['0xe546672750517f62c45a5a00067481981e62b9c20fa8220203232c9dc8fd2093'],
   *   limit: 5,
   * });
   * ```
   */
  listMarketHolders(request: ListMarketHoldersRequest): Promise<MetaHolder[]>;
  /**
   * Lists trades for a wallet, market, or event.
   *
   * @throws {@link ListTradesError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listTrades({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   *   pageSize: 10,
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: Trade[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listTrades({
   *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
   *   pageSize: 10,
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: Trade[]
   * }
   * ```
   */
  listTrades(request?: ListTradesRequest): Paginated<Trade[]>;
};

export function dataActions(client: BasePublicClient): DataActions;
export function dataActions(client: BaseSecureClient): DataActions;
export function dataActions(client: BaseClient): DataActions {
  return {
    fetchEventLiveVolume: fetchEventLiveVolume.bind(null, client),
    fetchMidpoint: fetchMidpoint.bind(null, client),
    fetchMidpoints: fetchMidpoints.bind(null, client),
    fetchPrice: fetchPrice.bind(null, client),
    fetchPrices: fetchPrices.bind(null, client),
    fetchOrderBook: fetchOrderBook.bind(null, client),
    fetchOrderBooks: fetchOrderBooks.bind(null, client),
    fetchSpread: fetchSpread.bind(null, client),
    fetchSpreads: fetchSpreads.bind(null, client),
    fetchLastTradePrice: fetchLastTradePrice.bind(null, client),
    fetchLastTradePrices: fetchLastTradePrices.bind(null, client),
    fetchPriceHistory: fetchPriceHistory.bind(null, client),
    estimateMarketPrice: estimateMarketPrice.bind(null, client),
    listOpenInterest: listOpenInterest.bind(null, client),
    listMarketHolders: listMarketHolders.bind(null, client),
    listTrades: listTrades.bind(null, client),
  };
}

// Error unions and runtime `isError` guards for every action bound above.
// Surfaced at the root entry point through `export * from './decorators'`.
// Keep this list in sync with the methods on DataActions.
export {
  EstimateMarketPriceError,
  FetchEventLiveVolumeError,
  FetchLastTradePriceError,
  FetchLastTradePricesError,
  FetchMidpointError,
  FetchMidpointsError,
  FetchOrderBookError,
  FetchOrderBooksError,
  FetchPriceError,
  FetchPriceHistoryError,
  FetchPricesError,
  FetchSpreadError,
  FetchSpreadsError,
  ListMarketHoldersError,
  ListOpenInterestError,
  ListTradesError,
} from '../actions';

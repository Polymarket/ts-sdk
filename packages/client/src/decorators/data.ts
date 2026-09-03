import type { DecimalString } from '@polymarket/bindings';
import type {
  LastTradePrice,
  LastTradePriceForAsset,
  Midpoints,
  OrderBook,
  Prices,
  Spreads,
} from '@polymarket/bindings/clob';
import type {
  LiveVolume,
  MetaHolder,
  OpenInterest,
  PriceHistoryPoint,
  Resolution,
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
  type FetchOpenInterestRequest,
  type FetchOrderBookRequest,
  type FetchOrderBooksRequest,
  type FetchPriceRequest,
  type FetchPricesRequest,
  type FetchResolutionsRequest,
  type FetchSpreadRequest,
  type FetchSpreadsRequest,
  fetchEventLiveVolume,
  fetchLastTradePrice,
  fetchLastTradePrices,
  fetchMidpoint,
  fetchMidpoints,
  fetchOpenInterest,
  fetchOrderBook,
  fetchOrderBooks,
  fetchPrice,
  fetchPrices,
  fetchResolutions,
  fetchSpread,
  fetchSpreads,
  type ListMarketHoldersRequest,
  type ListPriceHistoryRequest,
  type ListTradesRequest,
  listMarketHolders,
  listPriceHistory,
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
   * Fetches cumulative taker volume for one or more events.
   *
   * Results contain one row per market, ordered by taker volume descending, and
   * a total across all returned markets. Volume is measured in shares. Event
   * IDs must be positive 32-bit integers. Transient rate limits are retried
   * automatically.
   *
   * @throws {@link FetchEventLiveVolumeError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const volume = await client.fetchEventLiveVolume({
   *   eventIds: ['160707'],
   * });
   * ```
   */
  fetchEventLiveVolume(
    request: FetchEventLiveVolumeRequest,
  ): Promise<LiveVolume>;
  /**
   * Fetches resolution lifecycle rows by question, condition, or event.
   *
   * Provide exactly one selector. Condition and event lookups accept at most
   * 20 distinct IDs and return one row per matching condition. Missing
   * resolutions return an empty array. A 31-byte protocol v2 market condition
   * ID is right-padded to its canonical 32-byte form. A 31-byte combo condition
   * ID is rejected.
   *
   * @throws {@link FetchResolutionsError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const resolutions = await client.fetchResolutions({
   *   eventIds: ['903193'],
   * });
   * ```
   */
  fetchResolutions(request: FetchResolutionsRequest): Promise<Resolution[]>;
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
   * Lists historical price observations for an exchange asset.
   *
   * Select exactly one time form: a relative `interval`, an explicit `start`
   * with optional `end`, or the latest observation at or before an `asOf`
   * instant. Time inputs accept Unix epoch seconds or `Date` values. Prices are
   * decimal strings and returned timestamps are Unix epoch milliseconds. Series
   * pages are ordered oldest first; an `asOf` request returns at most one item.
   * Series page sizes default to and are capped at 10,000 points. Transient rate
   * limits are retried automatically.
   *
   * @throws {@link ListPriceHistoryError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const history = client.listPriceHistory({
   *   assetId: '17023124228269928849020611259015948850061676830917875073785033885105715180702',
   *   interval: PriceHistoryInterval.OneDay,
   *   bucketSeconds: 3600,
   * });
   *
   * for await (const page of history) {
   *   // page.items: PriceHistoryPoint[]
   * }
   * ```
   */
  listPriceHistory(
    request: ListPriceHistoryRequest,
  ): Paginated<PriceHistoryPoint[]>;
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
   * Fetches priced gross open interest for selected markets or globally.
   *
   * `conditionIds` accepts up to 20 distinct market condition IDs. Omit it for
   * the global aggregate, whose `conditionId` is `null`. A requested servable
   * market with no holdings has a zero value; an absent row means the market
   * is not servable. Values are in USDC. Transient rate limits are retried
   * automatically.
   *
   * @throws {@link FetchOpenInterestError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const openInterest = await client.fetchOpenInterest({
   *   conditionIds: ['0xe546672750517f62c45a5a00067481981e62b9c20fa8220203232c9dc8fd2093'],
   * });
   * ```
   */
  fetchOpenInterest(
    request?: FetchOpenInterestRequest,
  ): Promise<OpenInterest[]>;
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
   * Lists trades for a wallet, market, or event — or the global recent-trades
   * feed when no filter is given.
   *
   * Only the taker side of each match is returned by default
   * (`takerOnly: false` includes maker rows), and a dust filter of 0.01
   * shares applies unless `filterType`/`filterAmount` say otherwise (either
   * may be sent alone). `conditionId` accepts at most 20 distinct ids. `pageSize`
   * defaults to 100 (max 1000). `start`/`end` are Unix seconds. Transient
   * rate limits are retried automatically.
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
    fetchResolutions: fetchResolutions.bind(null, client),
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
    listPriceHistory: listPriceHistory.bind(null, client),
    estimateMarketPrice: estimateMarketPrice.bind(null, client),
    fetchOpenInterest: fetchOpenInterest.bind(null, client),
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
  FetchOpenInterestError,
  FetchOrderBookError,
  FetchOrderBooksError,
  FetchPriceError,
  FetchPricesError,
  FetchResolutionsError,
  FetchSpreadError,
  FetchSpreadsError,
  ListMarketHoldersError,
  ListPriceHistoryError,
  ListTradesError,
  PriceHistoryInterval,
  ResolutionMarketType,
  ResolutionReporter,
  ResolutionSource,
  ResolutionStatus,
} from '../actions';

import type {
  AcceptedOrderResponse,
  CancelOrdersResponse,
  OpenOrder,
  OrderResponse,
  OrderResponses,
} from '@polymarket/bindings/clob';
import type { TxHash } from '@polymarket/types';
import {
  type CancelMarketOrdersRequest,
  type CancelOrderRequest,
  type CancelOrdersRequest,
  cancelAll,
  cancelMarketOrders,
  cancelOrder,
  cancelOrders,
  createLimitOrder,
  createMarketOrder,
  type FetchOrderRequest,
  fetchOrder,
  type ListOpenOrdersRequest,
  listOpenOrders,
  type PostOrdersRequest,
  type PrepareLimitOrderRequest,
  type PrepareMarketOrderRequest,
  placeLimitOrder,
  placeMarketOrder,
  postOrder,
  postOrders,
  type WaitForOrderFillSettlementRequest,
  waitForOrderFillSettlement,
} from '../actions';
import type { SignedOrder } from '../actions/orders';
import type { BaseSecureClient } from '../clients';
import type { Paginated } from '../pagination';

export type SecureTradingActions = {
  /**
   * Creates a signed market order for the authenticated account.
   *
   * @throws {@link CreateMarketOrderError}
   * Thrown on failure.
   *
   * @example Basic market buy
   * ```ts
   * const order = await client.createMarketOrder({
   *   amount: 10,
   *   side: OrderSide.BUY,
   *   tokenId: '123',
   * });
   * ```
   *
   * @example Protected market buy
   * ```ts
   * const order = await client.createMarketOrder({
   *   amount: 10,
   *   maxPrice: '0.55',
   *   side: OrderSide.BUY,
   *   tokenId: '123',
   * });
   * ```
   */
  createMarketOrder(request: PrepareMarketOrderRequest): Promise<SignedOrder>;
  /**
   * Creates and posts a market order for the authenticated account.
   *
   * @remarks
   * Settlement happens asynchronously, so a matched response is not
   * guaranteed to carry settlement transaction hashes. Use
   * `waitForOrderFillSettlement` to obtain them reliably.
   *
   * @throws {@link PlaceMarketOrderError}
   * Thrown on failure.
   *
   * @example Basic market buy
   * ```ts
   * const response = await client.placeMarketOrder({
   *   amount: 10,
   *   side: OrderSide.BUY,
   *   tokenId: '123',
   * });
   *
   * // response: OrderResponse
   * ```
   *
   * @example Protected market sell
   * ```ts
   * const response = await client.placeMarketOrder({
   *   minPrice: '0.54',
   *   shares: 10,
   *   side: OrderSide.SELL,
   *   tokenId: '123',
   * });
   *
   * // response: OrderResponse
   * ```
   *
   * @example Market buy followed to settlement
   * ```ts
   * const response = await client.placeMarketOrder({
   *   amount: 10,
   *   side: OrderSide.BUY,
   *   tokenId: '123',
   * });
   *
   * if (response.ok) {
   *   const hashes = await client.waitForOrderFillSettlement(response);
   *   // hashes: TxHash[]
   * }
   * ```
   */
  placeMarketOrder(request: PrepareMarketOrderRequest): Promise<OrderResponse>;
  /**
   * Creates a signed limit order for the authenticated account.
   *
   * @remarks
   * GTD expirations must be at least 3 minutes in the future. Add your own
   * buffer for network latency and clock skew when deriving an expiration from
   * the current time.
   *
   * @throws {@link CreateLimitOrderError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const order = await client.createLimitOrder({
   *   postOnly: true,
   *   price: 0.52,
   *   side: OrderSide.BUY,
   *   size: 10,
   *   tokenId: '123',
   * });
   * ```
   */
  createLimitOrder(request: PrepareLimitOrderRequest): Promise<SignedOrder>;
  /**
   * Creates and posts a limit order for the authenticated account.
   *
   * @remarks
   * GTD expirations must be at least 3 minutes in the future. Add your own
   * buffer for network latency and clock skew when deriving an expiration from
   * the current time.
   *
   * @throws {@link PlaceLimitOrderError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const response = await client.placeLimitOrder({
   *   postOnly: true,
   *   price: 0.52,
   *   side: OrderSide.BUY,
   *   size: 10,
   *   tokenId: '123',
   * });
   *
   * // response: OrderResponse
   * ```
   */
  placeLimitOrder(request: PrepareLimitOrderRequest): Promise<OrderResponse>;
  /**
   * Posts a signed order for the authenticated account.
   *
   * @throws {@link PostOrderError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const response = await client.postOrder(signedOrder);
   * ```
   */
  postOrder(order: SignedOrder): Promise<OrderResponse>;
  /**
   * Posts multiple signed orders for the authenticated account.
   *
   * @remarks
   * Accepts between 1 and 15 orders, matching the current service limit.
   *
   * @throws {@link PostOrdersError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const responses = await client.postOrders([firstSignedOrder, secondSignedOrder]);
   * ```
   */
  postOrders(orders: PostOrdersRequest): Promise<OrderResponses>;
  /**
   * Waits until every fill listed in an order response reaches a terminal
   * settlement outcome and returns the settlement transaction hashes.
   *
   * @remarks
   * Settlement covers the fills listed in this order response. These are the
   * fills that happened immediately when the order was accepted. It does not
   * wait for later fills of any remaining quantity resting on the book;
   * subscribe to the `user` channel to follow those.
   *
   * @throws {@link WaitForOrderFillSettlementError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const response = await client.placeMarketOrder({
   *   amount: 10,
   *   side: OrderSide.BUY,
   *   tokenId: '123',
   * });
   *
   * if (response.ok) {
   *   const hashes = await client.waitForOrderFillSettlement(response);
   *   // hashes: TxHash[]
   * }
   * ```
   */
  waitForOrderFillSettlement(
    order: AcceptedOrderResponse,
    request?: WaitForOrderFillSettlementRequest,
  ): Promise<TxHash[]>;
  /**
   * Cancels a single open order for the authenticated account.
   *
   * @throws {@link CancelOrderError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const response = await client.cancelOrder({ orderId: '123' });
   *
   * // response.canceled: OrderId[]
   * ```
   */
  cancelOrder(request: CancelOrderRequest): Promise<CancelOrdersResponse>;
  /**
   * Cancels multiple open orders for the authenticated account.
   *
   * @throws {@link CancelOrdersError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const response = await client.cancelOrders({ orderIds: ['1', '2'] });
   *
   * // response.canceled: OrderId[]
   * ```
   */
  cancelOrders(request: CancelOrdersRequest): Promise<CancelOrdersResponse>;
  /**
   * Cancels all open orders for the authenticated account.
   *
   * @throws {@link CancelAllError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const response = await client.cancelAll();
   *
   * // response.canceled: OrderId[]
   * ```
   */
  cancelAll(): Promise<CancelOrdersResponse>;
  /**
   * Cancels all open orders for the authenticated account that match the market or token filter.
   *
   * @throws {@link CancelMarketOrdersError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const response = await client.cancelMarketOrders({
   *   market: '0x0000000000000000000000000000000000000000000000000000000000000001',
   * });
   *
   * // response.canceled: OrderId[]
   * ```
   */
  cancelMarketOrders(
    request: CancelMarketOrdersRequest,
  ): Promise<CancelOrdersResponse>;
  /**
   * Lists open orders for the authenticated account across all pages.
   *
   * @throws {@link ListOpenOrdersError}
   * Thrown on failure.
   *
   * @example
   * Fetch the first page of results:
   * ```ts
   * const paginator = client.listOpenOrders({
   *   market: '0x0000000000000000000000000000000000000000000000000000000000000001',
   * });
   *
   * const firstPage = await paginator.firstPage();
   *
   * // Optionally, fetch additional pages:
   * for await (const page of paginator.from(firstPage.nextCursor)) {
   *   // page.items: OpenOrder[]
   * }
   * ```
   *
   * @example
   * Loop through all pages with `for await`:
   * ```ts
   * const paginator = client.listOpenOrders({
   *   market: '0x0000000000000000000000000000000000000000000000000000000000000001',
   * });
   *
   * for await (const page of paginator) {
   *   // page.items: OpenOrder[]
   * }
   * ```
   */
  listOpenOrders(request?: ListOpenOrdersRequest): Paginated<OpenOrder[]>;
  /**
   * Fetches a single order for the authenticated account.
   *
   * @throws {@link FetchOrderError}
   * Thrown on failure.
   *
   * @example
   * ```ts
   * const order = await client.fetchOrder({ orderId: '123' });
   * ```
   */
  fetchOrder(request: FetchOrderRequest): Promise<OpenOrder>;
};

export function tradingActions(client: BaseSecureClient): SecureTradingActions;
export function tradingActions(client: BaseSecureClient): SecureTradingActions {
  return {
    createMarketOrder: createMarketOrder.bind(null, client),
    placeMarketOrder: placeMarketOrder.bind(null, client),
    createLimitOrder: createLimitOrder.bind(null, client),
    placeLimitOrder: placeLimitOrder.bind(null, client),
    postOrder: postOrder(client),
    postOrders: postOrders(client),
    waitForOrderFillSettlement: waitForOrderFillSettlement.bind(null, client),
    cancelOrder: cancelOrder.bind(null, client),
    cancelOrders: cancelOrders.bind(null, client),
    cancelAll: cancelAll.bind(null, client),
    cancelMarketOrders: cancelMarketOrders.bind(null, client),
    listOpenOrders: listOpenOrders.bind(null, client),
    fetchOrder: fetchOrder.bind(null, client),
  };
}

// Error unions and runtime `isError` guards for every action bound above.
// Surfaced at the root entry point through `export * from './decorators'`.
// Keep this list in sync with the methods on SecureTradingActions.
export {
  CancelAllError,
  CancelMarketOrdersError,
  CancelOrderError,
  CancelOrdersError,
  CreateLimitOrderError,
  CreateMarketOrderError,
  FetchOrderError,
  ListOpenOrdersError,
  PlaceLimitOrderError,
  PlaceMarketOrderError,
  PostOrderError,
  PostOrdersError,
  WaitForOrderFillSettlementError,
} from '../actions';

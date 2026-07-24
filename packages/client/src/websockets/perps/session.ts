import {
  type PerpsAccountConfig,
  type PerpsAccountFill,
  type PerpsAccountFundingPayment,
  type PerpsAccountStats,
  type PerpsBalance,
  type PerpsCancelOrderResult,
  type PerpsCommandAck,
  PerpsCommandAckSchema,
  type PerpsCredentials,
  type PerpsDeposit,
  type PerpsEquityPoint,
  type PerpsOrder,
  type PerpsOrderId,
  type PerpsPnlPoint,
  type PerpsPortfolio,
  type PerpsPostOrderAck,
  type PerpsUpdateLeverageResult,
  type PerpsWithdrawal,
} from '@polymarket/bindings/perps';
import {
  type PerpsOrderUpdateEvent,
  type PerpsSessionEvent,
  PerpsSessionUpdateEventSchema,
} from '@polymarket/bindings/subscriptions';
import {
  expectNonEmptyArray,
  expectPresent,
  invariant,
  setNonBlockingTimeout,
} from '@polymarket/types';
import { type Pushable, pushable } from 'it-pushable';
import { z } from 'zod';
import {
  type RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransportError,
  type UnexpectedResponseError,
  UserInputError,
} from '../../errors';
import type { Paginated } from '../../pagination';
import { ServiceClient } from '../../ServiceClient';
import { PerpsWebSocketHeartbeat } from '../heartbeat';
import { ReconnectScheduler, WebSocketConnection } from '../lifecycle';
import {
  type FetchPerpsAccountConfigRequest,
  type FetchPerpsOpenOrdersRequest,
  type FetchPerpsOrdersRequest,
  fetchPerpsAccountConfig,
  fetchPerpsBalances,
  fetchPerpsOpenOrders,
  fetchPerpsOrders,
  fetchPerpsPortfolio,
  fetchPerpsStats,
  type ListPerpsDepositsRequest,
  type ListPerpsEquityHistoryRequest,
  type ListPerpsFillsRequest,
  type ListPerpsFundingPaymentsRequest,
  type ListPerpsPnlHistoryRequest,
  type ListPerpsWithdrawalsRequest,
  listPerpsDeposits,
  listPerpsEquityHistory,
  listPerpsFills,
  listPerpsFundingPayments,
  listPerpsPnlHistory,
  listPerpsWithdrawals,
} from './actions/account';
import {
  type CancelAllPerpsOrdersRequest,
  type CancelPerpsOrderRequest,
  type CancelPerpsOrdersRequest,
  cancelAllOrders,
  cancelPerpsOrder,
  cancelPerpsOrders,
  hasPerpsTpSl,
  type PerpsSignedWsCommandRequest,
  type PerpsTradingTransport,
  type PlacePerpsOrderRequest,
  type PlacePerpsOrderRequestWithOptions,
  type PlacePerpsOrderWithTpSlRequest,
  type PlacePerpsPositionTpSlRequest,
  type PostPerpsOrdersRequest,
  placePerpsOrderWithTpSl,
  placePerpsPositionTpSl,
  postPerpsOrders,
  toPerpsCommandBodyOp,
  type UpdatePerpsLeverageRequest,
  updatePerpsLeverage,
} from './actions/trading';
import { type PerpsSignableValue, signPerpsOp } from './signing';

const AUTH_TIMEOUT_MS = 30_000;
const ACK_TIMEOUT_MS = 30_000;
// Purposefully generous: backend order updates are expected in the ~100ms range.
const ORDER_PLACEMENT_UPDATE_TIMEOUT_MS = 2000;
const PERPS_SESSION_CHANNELS = [
  'balances',
  'portfolio',
  'orders',
  'fills',
  'funding',
  'deposits',
  'withdrawals',
  'tpsl',
] as const;

const PerpsResponseEnvelopeSchema = z
  .object({
    id: z.number().int().positive().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

const PerpsSessionAckSchema = z
  .union([PerpsCommandAckSchema, z.array(PerpsCommandAckSchema)])
  .transform((response) =>
    Array.isArray(response)
      ? (response.find((item) => item.status === 'err') ?? response[0])
      : response,
  );

type PendingResponse = {
  reject(error: Error): void;
  resolve(value: unknown): void;
  schema: z.ZodType;
};

type EventWaiter = {
  predicate(event: PerpsSessionEvent): boolean;
  reject(error: Error): void;
  resolve(event: PerpsSessionEvent): void;
  timeout: ReturnType<typeof setNonBlockingTimeout>;
};

export type {
  PerpsCancelOrderResult,
  PerpsPostOrderAck,
  PerpsUpdateLeverageResult,
} from '@polymarket/bindings/perps';
export type { PerpsSessionEvent } from '@polymarket/bindings/subscriptions';
export type {
  FetchPerpsAccountConfigRequest,
  FetchPerpsOpenOrdersRequest,
  FetchPerpsOrdersRequest,
  ListPerpsDepositsRequest,
  ListPerpsEquityHistoryRequest,
  ListPerpsFillsRequest,
  ListPerpsFundingPaymentsRequest,
  ListPerpsPnlHistoryRequest,
  ListPerpsWithdrawalsRequest,
} from './actions/account';
export type {
  CancelAllPerpsOrdersRequest,
  CancelPerpsOrderRequest,
  CancelPerpsOrdersRequest,
  PerpsOrderRequest,
  PerpsPlaceFokOrderRequest,
  PerpsPlaceGtcOrderRequest,
  PerpsPlaceIocOrderRequest,
  PerpsPositionTpSlTrigger,
  PerpsTpSlTrigger,
  PlacePerpsOrderRequest,
  PlacePerpsOrderWithTpSlRequest,
  PlacePerpsPositionTpSlRequest,
  PostPerpsOrdersRequest,
  UpdatePerpsLeverageRequest,
} from './actions/trading';
export { UpdatePerpsLeverageError } from './actions/trading';

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsSessionOptions = {
  chainId: number;
  credentials: PerpsCredentials;
  headers?: Record<string, string>;
  onClose: (session: PerpsSession) => void;
  restUrl: string;
  wsUrl: string;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsSessionLifecycleError = RequestRejectedError | TransportError;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsSessionAccountError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsSessionTradingError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPlacedTpSlOrder = {
  orderId: PerpsOrderId;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsPlacedTpSlOrders = {
  takeProfit?: PerpsPlacedTpSlOrder;
  stopLoss?: PerpsPlacedTpSlOrder;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PlacePerpsOrderResult = {
  order: PerpsOrder;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PlacePerpsOrderWithTpSlResult = PlacePerpsOrderResult & {
  tpSl: PerpsPlacedTpSlOrders;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PlacePerpsPositionTpSlResult = {
  tpSl: PerpsPlacedTpSlOrders;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export class PerpsSession implements AsyncIterable<PerpsSessionEvent> {
  readonly credentials: PerpsCredentials;
  readonly #api: ServiceClient;
  readonly #chainId: number;
  readonly #headers: Record<string, string> | undefined;
  readonly #onClose: (session: PerpsSession) => void;
  readonly #wsUrl: string;
  readonly #connection = new WebSocketConnection({
    heartbeat: new PerpsWebSocketHeartbeat(),
  });
  readonly #queue: Pushable<PerpsSessionEvent> = pushable({ objectMode: true });
  readonly #pending = new Map<number, PendingResponse>();
  readonly #eventWaiters = new Set<EventWaiter>();
  readonly #reconnectScheduler = new ReconnectScheduler();
  readonly #sequences = new Map<string, number>();
  #nextRequestId = 1;
  #closing: Promise<void> | undefined;

  /**
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  constructor(options: PerpsSessionOptions) {
    this.#api = new ServiceClient({
      headers: options.headers,
      resolveHeaders: async () => this.#authenticatedHeaders(),
      root: options.restUrl,
    });
    this.#chainId = options.chainId;
    this.credentials = options.credentials;
    this.#headers = options.headers;
    this.#onClose = options.onClose;
    this.#wsUrl = options.wsUrl;
  }

  /**
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  get closed(): boolean {
    return this.#closing !== undefined;
  }

  /**
   * Connects and authenticates the session WebSocket.
   *
   * @throws {@link PerpsSessionLifecycleError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async connect(): Promise<void> {
    await this.#connect(false);
  }

  /**
   * Closes the session and releases pending requests.
   *
   * @throws {@link PerpsSessionLifecycleError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async close(): Promise<void> {
    if (this.#closing === undefined) {
      this.#closing = this.#shutdown();
    }
    await this.#closing;
  }

  /**
   * Iterates authenticated Perps account events emitted by this session.
   *
   * @example
   * ```ts
   * for await (const event of session) {
   *   if (event.type === 'order') {
   *     console.log(event.payload.id);
   *   }
   * }
   * ```
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  [Symbol.asyncIterator](): AsyncIterator<PerpsSessionEvent> {
    return this.#queue[Symbol.asyncIterator]();
  }

  /**
   * Fetches current Perps balances for the authenticated account.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async fetchBalances(): Promise<PerpsBalance[]> {
    return await fetchPerpsBalances(this.#api);
  }

  /**
   * Fetches the current Perps portfolio for the authenticated account.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async fetchPortfolio(): Promise<PerpsPortfolio> {
    return await fetchPerpsPortfolio(this.#api);
  }

  /**
   * Fetches account-level Perps statistics for the authenticated account.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async fetchStats(): Promise<PerpsAccountStats> {
    return await fetchPerpsStats(this.#api);
  }

  /**
   * Fetches Perps account configuration, optionally filtered by instrument.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async fetchAccountConfig(
    request?: FetchPerpsAccountConfigRequest,
  ): Promise<PerpsAccountConfig[]> {
    return await fetchPerpsAccountConfig(this.#api, request);
  }

  /**
   * Fetches currently open Perps orders, optionally filtered by instrument.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async fetchOpenOrders(
    request?: FetchPerpsOpenOrdersRequest,
  ): Promise<PerpsOrder[]> {
    return await fetchPerpsOpenOrders(this.#api, request);
  }

  /**
   * Fetches Perps orders for the authenticated account.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async fetchOrders(request?: FetchPerpsOrdersRequest): Promise<PerpsOrder[]> {
    return await fetchPerpsOrders(this.#api, request);
  }

  /**
   * Lists Perps fills
   *
   * @remarks
   * Fills are returned newest first by default; set `sort` to change the
   * time direction. Page cursors are opaque values forwarded to the API.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  listFills(
    request: ListPerpsFillsRequest = {},
  ): Paginated<PerpsAccountFill[]> {
    return listPerpsFills(this.#api, request);
  }

  /**
   * Lists Perps funding payments with SDK-owned pagination.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  listFundingPayments(
    request: ListPerpsFundingPaymentsRequest = {},
  ): Paginated<PerpsAccountFundingPayment[]> {
    return listPerpsFundingPayments(this.#api, request);
  }

  /**
   * Lists Perps deposits with SDK-owned pagination.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  listDeposits(
    request: ListPerpsDepositsRequest = {},
  ): Paginated<PerpsDeposit[]> {
    return listPerpsDeposits(this.#api, request);
  }

  /**
   * Lists Perps withdrawals with SDK-owned pagination.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  listWithdrawals(
    request: ListPerpsWithdrawalsRequest = {},
  ): Paginated<PerpsWithdrawal[]> {
    return listPerpsWithdrawals(this.#api, request);
  }

  /**
   * Lists Perps equity history with SDK-owned pagination.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  listEquityHistory(
    request: ListPerpsEquityHistoryRequest,
  ): Paginated<PerpsEquityPoint[]> {
    return listPerpsEquityHistory(this.#api, request);
  }

  /**
   * Lists Perps PnL history with SDK-owned pagination.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  listPnlHistory(
    request: ListPerpsPnlHistoryRequest,
  ): Paginated<PerpsPnlPoint[]> {
    return listPerpsPnlHistory(this.#api, request);
  }

  /**
   * Places one Perps order and resolves with the first matching orders update.
   *
   * @example
   * ```ts
   * const { order } = await session.placeOrder({
   *   instrumentId: 1,
   *   price: '100',
   *   quantity: '1',
   *   side: OrderSide.BUY,
   *   timeInForce: PerpsTimeInForce.GTC,
   * });
   * ```
   *
   * @example
   * ```ts
   * const { order, tpSl } = await session.placeOrder({
   *   instrumentId: 1,
   *   price: '100',
   *   quantity: '1',
   *   side: OrderSide.BUY,
   *   stopLoss: { triggerPrice: '90' },
   *   timeInForce: PerpsTimeInForce.GTC,
   * });
   * ```
   *
   * @throws {@link PerpsSessionTradingError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async placeOrder(
    request: PlacePerpsOrderWithTpSlRequest,
  ): Promise<PlacePerpsOrderWithTpSlResult>;
  /**
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async placeOrder(
    request: PlacePerpsOrderRequest,
  ): Promise<PlacePerpsOrderResult>;
  /**
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async placeOrder(
    request: PlacePerpsOrderRequestWithOptions,
  ): Promise<PlacePerpsOrderResult | PlacePerpsOrderWithTpSlResult> {
    if (hasPerpsTpSl(request)) {
      return await this.#placeOrderWithTpSl(request);
    }

    const [acknowledgement] = await postPerpsOrders(this.#tradingTransport(), {
      orders: [request],
      expiresAt: request.expiresAt,
    }).then(expectNonEmptyArray);

    if (acknowledgement.status === 'err') {
      throw new RequestRejectedError(acknowledgement.error, { status: 200 });
    }

    const update = await this.#waitForEvent(
      (event): event is PerpsOrderUpdateEvent =>
        event.type === 'order' && event.payload.id === acknowledgement.orderId,
      ORDER_PLACEMENT_UPDATE_TIMEOUT_MS,
    );
    return { order: update.payload };
  }

  /**
   * Posts one or more Perps orders and returns queue-entry acknowledgements.
   *
   * @remarks
   * This is a low-level method. Most SDK consumers should prefer `placeOrder`.
   *
   * @throws {@link PerpsSessionTradingError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async postOrders(
    request: PostPerpsOrdersRequest,
  ): Promise<PerpsPostOrderAck[]> {
    return await postPerpsOrders(this.#tradingTransport(), request);
  }

  async #placeOrderWithTpSl(
    request: PlacePerpsOrderWithTpSlRequest,
  ): Promise<PlacePerpsOrderWithTpSlResult> {
    const acknowledgements = await placePerpsOrderWithTpSl(
      this.#tradingTransport(),
      request,
    ).then(expectNonEmptyArray);

    for (const acknowledgement of acknowledgements) {
      if (acknowledgement.status === 'err') {
        throw new RequestRejectedError(acknowledgement.error, { status: 200 });
      }
    }

    const [entryAcknowledgement] = acknowledgements;
    const entryPlacement = placedOrderFrom(entryAcknowledgement);
    const update = await this.#waitForEvent(
      (event): event is PerpsOrderUpdateEvent =>
        event.type === 'order' && event.payload.id === entryPlacement.orderId,
      ORDER_PLACEMENT_UPDATE_TIMEOUT_MS,
    );

    let triggerIndex = 1;
    const tpSl: PerpsPlacedTpSlOrders = {};
    if (request.takeProfit !== undefined) {
      tpSl.takeProfit = placedOrderFrom(
        expectPresent(
          acknowledgements[triggerIndex++],
          'Expected Perps take-profit acknowledgement.',
        ),
      );
    }
    if (request.stopLoss !== undefined) {
      tpSl.stopLoss = placedOrderFrom(
        expectPresent(
          acknowledgements[triggerIndex],
          'Expected Perps stop-loss acknowledgement.',
        ),
      );
    }

    return { order: update.payload, tpSl };
  }

  /**
   * Places take-profit and/or stop-loss protection for the current position.
   *
   * @remarks
   * The exit side is inferred from the current position for the requested
   * instrument.
   *
   * @example
   * ```ts
   * const { tpSl } = await session.placePositionTpSl({
   *   instrumentId: 1,
   *   stopLoss: { triggerPrice: '90' },
   * });
   * ```
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown when the current position cannot be read.
   *
   * @throws {@link PerpsSessionTradingError}
   * Thrown when the TP/SL command fails.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async placePositionTpSl(
    request: PlacePerpsPositionTpSlRequest,
  ): Promise<PlacePerpsPositionTpSlResult> {
    const acknowledgements = await placePerpsPositionTpSl(
      this.#tradingTransport(),
      {
        ...request,
        buy: await this.#positionTpSlExitBuy(request.instrumentId),
      },
    ).then(expectNonEmptyArray);

    for (const acknowledgement of acknowledgements) {
      if (acknowledgement.status === 'err') {
        throw new RequestRejectedError(acknowledgement.error, { status: 200 });
      }
    }

    let triggerIndex = 0;
    const tpSl: PerpsPlacedTpSlOrders = {};
    if (request.takeProfit !== undefined) {
      tpSl.takeProfit = placedOrderFrom(
        expectPresent(
          acknowledgements[triggerIndex++],
          'Expected Perps take-profit acknowledgement.',
        ),
      );
    }
    if (request.stopLoss !== undefined) {
      tpSl.stopLoss = placedOrderFrom(
        expectPresent(
          acknowledgements[triggerIndex],
          'Expected Perps stop-loss acknowledgement.',
        ),
      );
    }

    return { tpSl };
  }

  async #positionTpSlExitBuy(instrumentId: number): Promise<boolean> {
    const portfolio = await this.fetchPortfolio();
    const position = portfolio.positions.find(
      (item) => item.instrumentId === instrumentId,
    );
    const sign = position === undefined ? 0 : decimalSign(position.size);

    if (sign === 0) {
      throw new UserInputError(
        `No open Perps position for instrument ${instrumentId}.`,
      );
    }

    return sign < 0;
  }

  /**
   * Cancels one Perps order and returns the cancel result.
   *
   * @remarks
   * The returned status reflects whether the cancel happened.
   *
   * @throws {@link PerpsSessionTradingError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async cancelOrder(
    request: CancelPerpsOrderRequest,
  ): Promise<PerpsCancelOrderResult> {
    return await cancelPerpsOrder(this.#tradingTransport(), request);
  }

  /**
   * Cancels one or more Perps orders and returns one result per requested order.
   *
   * @remarks
   * Each returned status reflects whether that cancel happened.
   *
   * @throws {@link PerpsSessionTradingError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async cancelOrders(
    request: CancelPerpsOrdersRequest,
  ): Promise<PerpsCancelOrderResult[]> {
    return await cancelPerpsOrders(this.#tradingTransport(), request);
  }

  /**
   * Cancels all open Perps orders for the authenticated account.
   *
   * @remarks
   * Omit `instrumentId` to cancel open orders across all instruments. The
   * endpoint returns once the cancel-all request is accepted; individual orders
   * can still race with fills or other cancels.
   *
   * @throws {@link PerpsSessionTradingError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async cancelAllOrders(request?: CancelAllPerpsOrdersRequest): Promise<void> {
    await cancelAllOrders(
      this.#api,
      (op, expiresAt) => this.#createSignedCommand(op, expiresAt),
      request,
    );
  }

  /**
   * Updates Perps leverage and margin mode for an instrument.
   *
   * @example
   * ```ts
   * await session.updateLeverage({
   *   crossMargin: true,
   *   instrumentId: 1,
   *   leverage: 2,
   * });
   * ```
   *
   * @throws {@link UpdatePerpsLeverageError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async updateLeverage(
    request: UpdatePerpsLeverageRequest,
  ): Promise<PerpsUpdateLeverageResult> {
    return await updatePerpsLeverage(this.#tradingTransport(), request);
  }

  async #connect(emitResync: boolean): Promise<void> {
    await this.#connection.connect({
      onConnectionLost: () => this.#handleConnectionLost(),
      onError: () => undefined,
      onMessage: (message) => this.#handleMessage(message),
      onOpen: () => undefined,
      headers: this.#headers,
      url: this.#wsUrl,
    });
    await this.#authenticate();
    await this.#subscribe();

    this.#reconnectScheduler.resetBackoff();
    if (emitResync) {
      this.#sequences.clear();
      this.#queue.push({
        reason: 'reconnect',
        type: 'resync',
      });
    }
  }

  async #authenticate(): Promise<void> {
    await this.#sendRequest(
      {
        id: this.#nextRequestId++,
        op: {
          args: {
            proxy: this.credentials.proxy,
            secret: this.credentials.secret,
          },
          type: 'auth',
        },
        req: 'post',
      },
      PerpsSessionAckSchema,
      AUTH_TIMEOUT_MS,
      'Perps session authentication timed out.',
    );
  }

  async #subscribe(): Promise<void> {
    await this.#sendRequest(
      {
        id: this.#nextRequestId++,
        req: 'sub',
        chs: PERPS_SESSION_CHANNELS,
      },
      PerpsSessionAckSchema,
      ACK_TIMEOUT_MS,
      'Perps session subscription timed out.',
    );
  }

  #authenticatedHeaders(): HeadersInit {
    return {
      'POLYMARKET-PROXY': this.credentials.proxy,
      'POLYMARKET-SECRET': this.credentials.secret,
    };
  }

  #tradingTransport(): PerpsTradingTransport {
    return {
      sendSignedWsCommand: (request) => this.#sendSignedWsCommand(request),
    };
  }

  async #sendSignedWsCommand<T>(
    request: PerpsSignedWsCommandRequest<T>,
  ): Promise<T> {
    const bodyOp = toPerpsCommandBodyOp(request.op);
    const command = this.#createSignedCommand(request.op, request.expiresAt);
    return await this.#sendRequest(
      {
        ...command,
        id: this.#nextRequestId++,
        op: bodyOp,
        req: 'post',
      },
      request.responseSchema,
      ACK_TIMEOUT_MS,
      request.timeoutMessage,
    );
  }

  #createSignedCommand(op: PerpsSignableValue, expiresAt?: number) {
    const salt = randomUint32();
    const timestamp = Date.now();
    let signature: string;
    try {
      signature = signPerpsOp({
        chainId: this.#chainId,
        op,
        privateKey: this.credentials.privateKey,
        salt,
        timestamp,
      });
    } catch (error) {
      throw SigningError.fromError(
        error,
        'Could not sign the Perps session command',
      );
    }

    const body: Record<string, unknown> = {
      salt,
      sig: signature,
      ts: timestamp,
    };
    if (expiresAt !== undefined) body.exp = expiresAt;
    return body;
  }

  async #sendRequest<T>(
    frame: Record<string, unknown> & { id: number },
    schema: z.ZodType<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    const pending = createPendingResponse(schema);
    this.#pending.set(frame.id, pending);
    const timeout = setNonBlockingTimeout(() => {
      pending.reject(new TransportError(timeoutMessage));
    }, timeoutMs);

    try {
      if (!this.#connection.send(frame)) {
        throw new TransportError('Perps session transport is not open.');
      }
      return await pending.promise;
    } finally {
      clearTimeout(timeout);
      this.#pending.delete(frame.id);
    }
  }

  async #shutdown(): Promise<void> {
    this.#reconnectScheduler.stop();
    this.#rejectPending(new TransportError('Perps session closed.'));
    this.#rejectEventWaiters(new TransportError('Perps session closed.'));
    this.#queue.end();
    await this.#connection.close();
    this.#onClose(this);
  }

  #handleMessage(rawMessage: unknown): void {
    if (this.#handleResponse(rawMessage)) return;

    const parsed = PerpsSessionUpdateEventSchema.safeParse(rawMessage);
    if (!parsed.success) return;

    const event = parsed.data;
    this.#pushSequenceGapIfNeeded(event);
    this.#emitEvent(event);
  }

  #handleResponse(rawMessage: unknown): boolean {
    const parsed = PerpsResponseEnvelopeSchema.safeParse(rawMessage);
    if (!parsed.success || parsed.data.id === undefined) return false;

    const pending = this.#pending.get(parsed.data.id);
    if (pending === undefined) return true;

    const data = pending.schema.safeParse(parsed.data.data);
    if (!data.success) {
      const ack = errorAckFrom(parsed.data.data ?? parsed.data);
      if (ack !== undefined) {
        pending.reject(new RequestRejectedError(ack.error, { status: 200 }));
      } else {
        pending.reject(
          new TransportError('Perps session unexpected response.'),
        );
      }
      return true;
    }

    if (isRejectedPerpsAck(data.data)) {
      pending.reject(
        new RequestRejectedError(data.data.error, { status: 200 }),
      );
    } else {
      pending.resolve(data.data);
    }
    return true;
  }

  #handleConnectionLost(): void {
    this.#rejectPending(new TransportError('Perps session connection closed.'));
    this.#rejectEventWaiters(
      new TransportError('Perps session connection closed.'),
    );
    if (this.#closing !== undefined) return;

    this.#reconnectScheduler.schedule({
      reconnect: () => this.#connect(true),
      shouldReconnect: () => this.#closing === undefined,
    });
  }

  #rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #pushSequenceGapIfNeeded(event: { channel: string; sequence: number }): void {
    const previousSequence = this.#sequences.get(event.channel);
    this.#sequences.set(event.channel, event.sequence);

    if (
      previousSequence === undefined ||
      event.sequence === previousSequence + 1
    ) {
      return;
    }

    this.#emitEvent({
      channel: event.channel,
      previousSequence,
      reason: 'sequence_gap',
      sequence: event.sequence,
      type: 'resync',
    });
  }

  #emitEvent(event: PerpsSessionEvent): void {
    this.#resolveEventWaiters(event);
    this.#queue.push(event);
  }

  #waitForEvent<TEvent extends PerpsSessionEvent>(
    predicate: (event: PerpsSessionEvent) => event is TEvent,
    timeoutMs: number,
  ): Promise<TEvent> {
    return this.#createEventWaiter(predicate, timeoutMs).then(
      (event) => event as TEvent,
    );
  }

  #createEventWaiter(
    predicate: (event: PerpsSessionEvent) => boolean,
    timeoutMs: number,
  ): Promise<PerpsSessionEvent> {
    let waiter!: EventWaiter;
    const promise = new Promise<PerpsSessionEvent>((resolve, reject) => {
      waiter = {
        predicate,
        reject,
        resolve,
        timeout: setNonBlockingTimeout(() => {
          this.#removeEventWaiter(waiter);
          reject(new TimeoutError('Perps event wait timed out.'));
        }, timeoutMs),
      };
    });
    this.#eventWaiters.add(waiter);
    return promise;
  }

  #resolveEventWaiters(event: PerpsSessionEvent): void {
    for (const waiter of Array.from(this.#eventWaiters)) {
      if (waiter.predicate(event)) {
        this.#removeEventWaiter(waiter);
        waiter.resolve(event);
      }
    }
  }

  #removeEventWaiter(waiter: EventWaiter): void {
    if (!this.#eventWaiters.delete(waiter)) return;
    clearTimeout(waiter.timeout);
  }

  #rejectEventWaiters(error: Error): void {
    for (const waiter of Array.from(this.#eventWaiters)) {
      this.#removeEventWaiter(waiter);
      waiter.reject(error);
    }
  }
}

function createPendingResponse<T>(
  schema: z.ZodType<T>,
): PendingResponse & { promise: Promise<T> } {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve, schema };
}

function isRejectedPerpsAck(
  value: unknown,
): value is Extract<PerpsCommandAck, { status: 'err' }> {
  return errorAckFrom(value) !== undefined;
}

function errorAckFrom(value: unknown): { error: string } | undefined {
  if (Array.isArray(value) || typeof value !== 'object' || value === null) {
    return undefined;
  }

  const ack = value as { error?: unknown; status?: unknown };
  if (ack.status !== 'err') return undefined;

  return {
    error: typeof ack.error === 'string' ? ack.error : 'Perps command failed.',
  };
}

function placedOrderFrom(
  acknowledgement: PerpsPostOrderAck,
): PerpsPlacedTpSlOrder {
  if (acknowledgement.status === 'err') {
    throw new RequestRejectedError(acknowledgement.error, { status: 200 });
  }

  return {
    orderId: acknowledgement.orderId,
  };
}

function decimalSign(value: string): -1 | 0 | 1 {
  const trimmed = value.trim();
  const digits = trimmed.replace(/^[+-]/, '').replace('.', '');
  if (/^0*$/.test(digits)) return 0;
  return trimmed.startsWith('-') ? -1 : 1;
}

function randomUint32(): number {
  const [value] = globalThis.crypto.getRandomValues(new Uint32Array(1));
  invariant(
    value !== undefined,
    'Expected crypto.getRandomValues to return a salt.',
  );
  return value;
}

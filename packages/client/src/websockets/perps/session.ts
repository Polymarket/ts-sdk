import {
  type PerpsAccountConfig,
  type PerpsAccountFill,
  type PerpsAccountFundingPayment,
  type PerpsBalance,
  type PerpsCancelOrderResult,
  type PerpsCommandAck,
  PerpsCommandAckSchema,
  type PerpsCredentials,
  type PerpsDeposit,
  type PerpsEquityPoint,
  type PerpsOrder,
  type PerpsPnlPoint,
  type PerpsPortfolio,
  type PerpsPostOrderAck,
  type PerpsWithdrawal,
} from '@polymarket/bindings/perps';
import {
  type PerpsOrderUpdateEvent,
  type PerpsSessionEvent,
  PerpsSessionUpdateEventSchema,
} from '@polymarket/bindings/subscriptions';
import {
  expectNonEmptyArray,
  invariant,
  setNonBlockingTimeout,
  unwrap,
} from '@polymarket/types';
import { type Pushable, pushable } from 'it-pushable';
import { z } from 'zod';
import {
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransportError,
} from '../../errors';
import type { Paginated } from '../../pagination';
import { validateWith } from '../../response';
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
  type CancelPerpsOrderRequest,
  type CancelPerpsOrdersRequest,
  cancelPerpsOrder,
  cancelPerpsOrders,
  type PerpsSignedHttpCommandRequest,
  type PerpsSignedWsCommandRequest,
  type PerpsTradingTransport,
  type PlacePerpsOrderRequest,
  type PostPerpsOrdersRequest,
  postPerpsOrders,
  toPerpsCommandBodyOp,
  type UpdatePerpsLeverageRequest,
  type UpdatePerpsMarginRequest,
  updatePerpsLeverage,
  updatePerpsMargin,
} from './actions/trading';
import { type PerpsSignableValue, signPerpsOp } from './signing';

const AUTH_TIMEOUT_MS = 30_000;
const ACK_TIMEOUT_MS = 30_000;
// Purposefully generous: backend order updates are expected in the ~100ms range.
const ORDER_PLACEMENT_UPDATE_TIMEOUT_MS = 500;
const PERPS_SESSION_CHANNELS = [
  'balances',
  'portfolio',
  'orders',
  'fills',
  'funding',
  'deposits',
  'withdrawals',
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
  CancelPerpsOrderRequest,
  CancelPerpsOrdersRequest,
  PlacePerpsOrderRequest,
  PostPerpsOrdersRequest,
  UpdatePerpsLeverageRequest,
  UpdatePerpsMarginRequest,
} from './actions/trading';
export {
  UpdatePerpsLeverageError,
  UpdatePerpsMarginError,
} from './actions/trading';

export type PerpsSessionOptions = {
  chainId: number;
  credentials: PerpsCredentials;
  headers?: Record<string, string>;
  onClose: (session: PerpsSession) => void;
  restUrl: string;
  wsUrl: string;
};

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

  get closed(): boolean {
    return this.#closing !== undefined;
  }

  async connect(): Promise<void> {
    await this.#connect(false);
  }

  async close(): Promise<void> {
    if (this.#closing === undefined) {
      this.#closing = this.#shutdown();
    }
    await this.#closing;
  }

  [Symbol.asyncIterator](): AsyncIterator<PerpsSessionEvent> {
    return this.#queue[Symbol.asyncIterator]();
  }

  async fetchBalances(): Promise<PerpsBalance[]> {
    return await fetchPerpsBalances(this.#api);
  }

  async fetchPortfolio(): Promise<PerpsPortfolio> {
    return await fetchPerpsPortfolio(this.#api);
  }

  async fetchAccountConfig(
    request?: FetchPerpsAccountConfigRequest,
  ): Promise<PerpsAccountConfig[]> {
    return await fetchPerpsAccountConfig(this.#api, request);
  }

  async fetchOpenOrders(
    request?: FetchPerpsOpenOrdersRequest,
  ): Promise<PerpsOrder[]> {
    return await fetchPerpsOpenOrders(this.#api, request);
  }

  async fetchOrders(request?: FetchPerpsOrdersRequest): Promise<PerpsOrder[]> {
    return await fetchPerpsOrders(this.#api, request);
  }

  listFills(
    request: ListPerpsFillsRequest = {},
  ): Paginated<PerpsAccountFill[]> {
    return listPerpsFills(this.#api, request);
  }

  listFundingPayments(
    request: ListPerpsFundingPaymentsRequest = {},
  ): Paginated<PerpsAccountFundingPayment[]> {
    return listPerpsFundingPayments(this.#api, request);
  }

  listDeposits(
    request: ListPerpsDepositsRequest = {},
  ): Paginated<PerpsDeposit[]> {
    return listPerpsDeposits(this.#api, request);
  }

  listWithdrawals(
    request: ListPerpsWithdrawalsRequest = {},
  ): Paginated<PerpsWithdrawal[]> {
    return listPerpsWithdrawals(this.#api, request);
  }

  listEquityHistory(
    request: ListPerpsEquityHistoryRequest,
  ): Paginated<PerpsEquityPoint[]> {
    return listPerpsEquityHistory(this.#api, request);
  }

  listPnlHistory(
    request: ListPerpsPnlHistoryRequest,
  ): Paginated<PerpsPnlPoint[]> {
    return listPerpsPnlHistory(this.#api, request);
  }

  /**
   * Places one Perps order and resolves with the first matching orders update.
   *
   * @throws Thrown on failure.
   */
  async placeOrder(request: PlacePerpsOrderRequest): Promise<PerpsOrder> {
    const [acknowledgement] = await postPerpsOrders(this.#tradingTransport(), {
      orders: [request],
    }).then(expectNonEmptyArray);

    if (acknowledgement.status === 'err') {
      throw new RequestRejectedError(acknowledgement.error, { status: 200 });
    }

    const update = await this.#waitForEvent(
      (event): event is PerpsOrderUpdateEvent =>
        event.type === 'order' && event.payload.id === acknowledgement.orderId,
      ORDER_PLACEMENT_UPDATE_TIMEOUT_MS,
    );
    return update.payload;
  }

  /**
   * Posts one or more Perps orders and returns queue-entry acknowledgements.
   *
   * @remarks
   * This is a low-level method. Most SDK consumers should prefer `placeOrder`.
   */
  async postOrders(
    request: PostPerpsOrdersRequest,
  ): Promise<PerpsPostOrderAck[]> {
    return await postPerpsOrders(this.#tradingTransport(), request);
  }

  /**
   * Cancels one Perps order and returns the cancel result.
   *
   * @remarks
   * The returned status reflects whether the cancel happened.
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
   */
  async cancelOrders(
    request: CancelPerpsOrdersRequest,
  ): Promise<PerpsCancelOrderResult[]> {
    return await cancelPerpsOrders(this.#tradingTransport(), request);
  }

  async updateLeverage(request: UpdatePerpsLeverageRequest): Promise<void> {
    return await updatePerpsLeverage(this.#tradingTransport(), request);
  }

  async updateMargin(request: UpdatePerpsMarginRequest): Promise<void> {
    return await updatePerpsMargin(this.#tradingTransport(), request);
  }

  async #connect(emitResync: boolean): Promise<void> {
    await this.#connection.connect({
      onClose: () => this.#handleClose(),
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
      sendSignedHttpCommand: (path, request) =>
        this.#sendSignedHttpCommand(path, request),
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

  async #sendSignedHttpCommand(
    path: string,
    request: PerpsSignedHttpCommandRequest,
  ): Promise<PerpsCommandAck> {
    const command = this.#createSignedCommand(request.op);
    return await unwrap(
      this.#api
        .patch(path, {
          json: {
            ...command,
            op: request.bodyOp,
          },
        })
        .andThen(validateWith(PerpsCommandAckSchema)),
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

  #handleClose(): void {
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

function randomUint32(): number {
  const [value] = globalThis.crypto.getRandomValues(new Uint32Array(1));
  invariant(
    value !== undefined,
    'Expected crypto.getRandomValues to return a salt.',
  );
  return value;
}

import {
  type PerpsAccountConfig,
  type PerpsAccountFill,
  type PerpsAccountFundingPayment,
  type PerpsBalance,
  type PerpsCancelOrderAck,
  type PerpsCommandAck,
  PerpsCommandAckSchema,
  type PerpsCredentials,
  type PerpsDeposit,
  type PerpsEquityPoint,
  type PerpsModifyOrderAck,
  type PerpsOrder,
  type PerpsPlaceOrderAck,
  type PerpsPnlPoint,
  type PerpsPortfolio,
  type PerpsWithdrawal,
} from '@polymarket/bindings/perps';
import {
  type PerpsSessionEvent,
  PerpsSessionUpdateEventSchema,
} from '@polymarket/bindings/subscriptions';
import { invariant, setNonBlockingTimeout, unwrap } from '@polymarket/types';
import { type Pushable, pushable } from 'it-pushable';
import { z } from 'zod';
import {
  RequestRejectedError,
  SigningError,
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
  type ModifyPerpsOrderRequest,
  type ModifyPerpsOrdersRequest,
  modifyPerpsOrder,
  modifyPerpsOrders,
  type PerpsSignedHttpCommandRequest,
  type PerpsSignedWsCommandRequest,
  type PerpsTradingTransport,
  type PlacePerpsOrderRequest,
  type PlacePerpsOrdersRequest,
  placePerpsOrder,
  placePerpsOrders,
  toPerpsCommandBodyOp,
  type UpdatePerpsLeverageRequest,
  type UpdatePerpsMarginRequest,
  updatePerpsLeverage,
  updatePerpsMargin,
} from './actions/trading';
import { type PerpsSignedOp, signPerpsOp } from './signing';

const AUTH_TIMEOUT_MS = 30_000;
const ACK_TIMEOUT_MS = 30_000;
const PERPS_SESSION_CHANNELS = [
  'balances',
  'portfolio',
  'orders',
  'fills',
  'funding',
  'deposits',
  'withdrawals',
] as const;

const PerpsResponseEnvelopeSchema = z.object({
  id: z.number().int().positive().optional(),
  data: z.unknown(),
});

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

export type {
  PerpsCancelOrderAck,
  PerpsModifyOrderAck,
  PerpsPlaceOrderAck,
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
  ModifyPerpsOrderRequest,
  ModifyPerpsOrdersRequest,
  PlacePerpsOrderRequest,
  PlacePerpsOrdersRequest,
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
  readonly #reconnectScheduler = new ReconnectScheduler();
  readonly #sequences = new Map<string, number>();
  readonly #lastDedupedPayload = new Map<string, string>();
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

  async placeOrder(
    request: PlacePerpsOrderRequest,
  ): Promise<PerpsPlaceOrderAck> {
    return await placePerpsOrder(this.#tradingTransport(), request);
  }

  async placeOrders(
    request: PlacePerpsOrdersRequest,
  ): Promise<PerpsPlaceOrderAck[]> {
    return await placePerpsOrders(this.#tradingTransport(), request);
  }

  async modifyOrder(
    request: ModifyPerpsOrderRequest,
  ): Promise<PerpsModifyOrderAck> {
    return await modifyPerpsOrder(this.#tradingTransport(), request);
  }

  async modifyOrders(
    request: ModifyPerpsOrdersRequest,
  ): Promise<PerpsModifyOrderAck[]> {
    return await modifyPerpsOrders(this.#tradingTransport(), request);
  }

  async cancelOrder(
    request: CancelPerpsOrderRequest,
  ): Promise<PerpsCancelOrderAck> {
    return await cancelPerpsOrder(this.#tradingTransport(), request);
  }

  async cancelOrders(
    request: CancelPerpsOrdersRequest,
  ): Promise<PerpsCancelOrderAck[]> {
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
      this.#lastDedupedPayload.clear();
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
    const command = this.#createSignedCommand(request.op, request.expiresAt);
    return await this.#sendRequest(
      {
        ...command,
        id: this.#nextRequestId++,
        op: toPerpsCommandBodyOp(request.op),
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

  #createSignedCommand(op: PerpsSignedOp, expiresAt?: number) {
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
    this.#queue.end();
    await this.#connection.close();
    this.#onClose(this);
  }

  #handleMessage(rawMessage: unknown): void {
    if (this.#handleResponse(rawMessage)) return;

    const parsed = PerpsSessionUpdateEventSchema.safeParse(rawMessage);
    if (!parsed.success) return;

    const event = parsed.data;
    const shouldSkipDedupedTick = this.#shouldSkipDedupedTick(event);
    this.#pushSequenceGapIfNeeded(event);
    if (shouldSkipDedupedTick) return;
    this.#queue.push(event);
  }

  #handleResponse(rawMessage: unknown): boolean {
    const parsed = PerpsResponseEnvelopeSchema.safeParse(rawMessage);
    if (!parsed.success || parsed.data.id === undefined) return false;

    const pending = this.#pending.get(parsed.data.id);
    if (pending === undefined) return true;

    const data = pending.schema.safeParse(parsed.data.data);
    if (!data.success) {
      pending.reject(new TransportError('Perps session empty response.'));
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

  #shouldSkipDedupedTick(event: {
    channel: string;
    payload: unknown;
  }): boolean {
    if (event.channel !== 'balances' && event.channel !== 'portfolio') {
      return false;
    }

    const payload = JSON.stringify(event.payload);
    const previousPayload = this.#lastDedupedPayload.get(event.channel);
    this.#lastDedupedPayload.set(event.channel, payload);
    return payload === previousPayload;
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

    this.#queue.push({
      channel: event.channel,
      previousSequence,
      reason: 'sequence_gap',
      sequence: event.sequence,
      type: 'resync',
    });
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
  return (
    !Array.isArray(value) &&
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    value.status === 'err'
  );
}

function randomUint32(): number {
  const [value] = globalThis.crypto.getRandomValues(new Uint32Array(1));
  invariant(
    value !== undefined,
    'Expected crypto.getRandomValues to return a salt.',
  );
  return value;
}

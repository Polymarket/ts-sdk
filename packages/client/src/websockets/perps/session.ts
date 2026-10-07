import { EvmAddressSchema } from '@polymarket/bindings';
import type { PerpsPositionSnapshots } from '@polymarket/bindings/perps';
import {
  type PerpsAccountConfig,
  type PerpsAccountFill,
  type PerpsAccountFundingPayment,
  type PerpsAccountStats,
  type PerpsAutoCancelStatus,
  type PerpsBalance,
  type PerpsBuilderApproval,
  type PerpsBuilderEarning,
  type PerpsBuilderEarningsSummary,
  PerpsBuilderStatusSchema,
  type PerpsCancelOrderResult,
  type PerpsChase,
  type PerpsChaseAccepted,
  type PerpsCommandAck,
  PerpsCommandAckSchema,
  type PerpsCredentials,
  type PerpsDeposit,
  type PerpsEquityPoint,
  type PerpsInternalTransfer,
  type PerpsNotificationEntry,
  type PerpsOrder,
  type PerpsPnlPoint,
  type PerpsPortfolio,
  type PerpsPostOrderAck,
  type PerpsTwap,
  type PerpsTwapAccepted,
  type PerpsUpdateLeverageBatchResult,
  type PerpsUpdateLeverageResult,
  type PerpsWithdrawal,
} from '@polymarket/bindings/perps';
import {
  PerpsNotificationsResyncFrameSchema,
  type PerpsSessionEvent,
  PerpsSessionUpdateEventSchema,
} from '@polymarket/bindings/subscriptions';
import { invariant, setNonBlockingTimeout, unwrap } from '@polymarket/types';
import { type Pushable, pushable } from 'it-pushable';
import { z } from 'zod';
import {
  type ApprovePerpsBuilderFeeError,
  type ApprovePerpsBuilderFeeRequest,
  ApprovePerpsBuilderFeeRequestSchema,
  type PerpsBuilderFeeApprover,
} from '../../actions/perps/builders';
import {
  fetchOwnPerpsPositionSnapshots,
  type PerpsPositionSnapshotSelection,
} from '../../actions/perps/position-snapshots';
import {
  makeErrorGuard,
  type OperationAbortedError,
  type PerpsCancelRetryError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../errors';
import { parseUserInput } from '../../input';
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
  fetchPerpsAutoCancelStatus,
  fetchPerpsBalances,
  fetchPerpsOpenOrders,
  fetchPerpsOrders,
  fetchPerpsPortfolio,
  fetchPerpsStats,
  fetchPerpsUnreadNotificationsCount,
  type ListPerpsDepositsRequest,
  type ListPerpsEquityHistoryRequest,
  type ListPerpsFillsRequest,
  type ListPerpsFundingPaymentsRequest,
  type ListPerpsInternalTransfersRequest,
  type ListPerpsNotificationsRequest,
  type ListPerpsPnlHistoryRequest,
  type ListPerpsWithdrawalsRequest,
  listPerpsDeposits,
  listPerpsEquityHistory,
  listPerpsFills,
  listPerpsFundingPayments,
  listPerpsInternalTransfers,
  listPerpsNotifications,
  listPerpsPnlHistory,
  listPerpsWithdrawals,
  type MarkPerpsNotificationsReadRequest,
  markPerpsNotificationsRead,
} from './actions/account';
import {
  minPerpsBuilderFeeRate,
  type PerpsBuilderTermsInput,
  PerpsBuilderTermsInputSchema,
} from './actions/builder-terms';
import {
  type FetchPerpsBuilderApprovalsRequest,
  type FetchPerpsBuilderEarningsSummaryRequest,
  fetchPerpsBuilderApprovals,
  fetchPerpsBuilderEarningsSummary,
  type ListPerpsBuilderEarningsRequest,
  listPerpsBuilderEarnings,
} from './actions/builders';
import {
  type CancelPerpsChaseRequest,
  type CreatePerpsChaseRequest,
  cancelPerpsChase,
  createPerpsChase,
  fetchPerpsChases,
} from './actions/chases';
import {
  type ArmPerpsAutoCancelRequest,
  armPerpsAutoCancel,
  type CancelAllPerpsOrdersRequest,
  type CancelPerpsOrderRequest,
  type CancelPerpsOrdersRequest,
  cancelAllOrders,
  cancelPerpsOrder,
  cancelPerpsOrders,
  type DisarmPerpsAutoCancelRequest,
  disarmPerpsAutoCancel,
  type PerpsCommandRequest,
  type PerpsDeleteCommandRequest,
  type PlacePerpsOrderRequest,
  type PlacePerpsOrderRequestWithOptions,
  type PlacePerpsOrderResult,
  type PlacePerpsOrderWithTpSlRequest,
  type PlacePerpsOrderWithTpSlResult,
  type PlacePerpsPositionTpSlRequest,
  type PlacePerpsPositionTpSlResult,
  type PostPerpsOrdersRequest,
  placePerpsOrder,
  placePerpsPositionTpSl,
  postPerpsOrders,
  toPerpsCommandBodyOp,
  type UpdatePerpsLeverageRequest,
  type UpdatePerpsLeveragesRequest,
  type UpdatePerpsMarginRequest,
  updatePerpsLeverage,
  updatePerpsLeverages,
  updatePerpsMargin,
} from './actions/trading';
import {
  type CancelPerpsTwapRequest,
  type CreatePerpsTwapRequest,
  cancelPerpsTwap,
  createPerpsTwap,
  fetchPerpsTwaps,
  type PausePerpsTwapRequest,
  pausePerpsTwap,
  type ResumePerpsTwapRequest,
  resumePerpsTwap,
} from './actions/twaps';
import { type PerpsSignableValue, signPerpsOp } from './signing';

const AUTH_TIMEOUT_MS = 30_000;
const COMMAND_TIMEOUT_MS = 30_000;
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
  'notifications',
  'tpsl',
] as const;

// Notification and builder-fill frames carry the source event's engine sequence, which is not
// dense per channel: unrelated engine events skip values and one event can
// emit several notifications sharing one sequence. Local sequence-gap
// detection would misfire. Notification loss is reported by server resync
// control frames instead.
const SERVER_RESYNC_CHANNELS: ReadonlySet<string> = new Set([
  'notifications',
  'builderFills',
]);

const PerpsResponseEnvelopeSchema = z
  .object({
    id: z.number().int().positive().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type { ApprovePerpsBuilderFeeError };

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
  promise: Promise<PerpsSessionEvent>;
  predicate(event: PerpsSessionEvent): boolean;
  reject(error: Error): void;
  resolve(event: PerpsSessionEvent): void;
  timeout?: ReturnType<typeof setNonBlockingTimeout>;
};

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type {
  PerpsAutoCancelStatus,
  PerpsCancelOrderResult,
  PerpsPostOrderAck,
  PerpsUpdateLeverageBatchResult,
  PerpsUpdateLeverageRejection,
  PerpsUpdateLeverageResult,
} from '@polymarket/bindings/perps';
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type {
  PerpsBuilderFillUpdateEvent,
  PerpsSessionEvent,
} from '@polymarket/bindings/subscriptions';
export type {
  FetchPerpsAccountConfigRequest,
  FetchPerpsOpenOrdersRequest,
  FetchPerpsOrdersRequest,
  ListPerpsDepositsRequest,
  ListPerpsEquityHistoryRequest,
  ListPerpsFillsRequest,
  ListPerpsFundingPaymentsRequest,
  ListPerpsInternalTransfersRequest,
  ListPerpsNotificationsRequest,
  ListPerpsPnlHistoryRequest,
  ListPerpsWithdrawalsRequest,
  MarkPerpsNotificationsReadRequest,
} from './actions/account';
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type { PerpsBuilderTermsInput } from './actions/builder-terms';
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type {
  FetchPerpsBuilderApprovalsRequest,
  FetchPerpsBuilderEarningsSummaryRequest,
  ListPerpsBuilderEarningsRequest,
} from './actions/builders';
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export {
  FetchPerpsBuilderApprovalsError,
  FetchPerpsBuilderEarningsSummaryError,
  ListPerpsBuilderEarningsError,
} from './actions/builders';
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type {
  ArmPerpsAutoCancelRequest,
  CancelAllPerpsOrdersRequest,
  CancelPerpsOrderRequest,
  CancelPerpsOrdersRequest,
  DisarmPerpsAutoCancelRequest,
  PerpsCancelOptions,
  PerpsCancelRetryOptions,
  PerpsOrderRequest,
  PerpsPlacedTpSlOrder,
  PerpsPlacedTpSlOrders,
  PerpsPlaceFokOrderRequest,
  PerpsPlaceGtcOrderRequest,
  PerpsPlaceGtdOrderRequest,
  PerpsPlaceIocOrderRequest,
  PerpsPositionTpSlTrigger,
  PerpsPositionTrailingStop,
  PerpsTpSlTrigger,
  PerpsTrailingStop,
  PlacePerpsOrderRequest,
  PlacePerpsOrderResult,
  PlacePerpsOrderWithTpSlRequest,
  PlacePerpsOrderWithTpSlResult,
  PlacePerpsPositionTpSlRequest,
  PlacePerpsPositionTpSlResult,
  PostPerpsOrdersRequest,
  UpdatePerpsLeverageRequest,
  UpdatePerpsLeveragesRequest,
  UpdatePerpsMarginRequest,
} from './actions/trading';
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export {
  ArmPerpsAutoCancelError,
  UpdatePerpsLeverageError,
  UpdatePerpsLeveragesError,
  UpdatePerpsMarginError,
} from './actions/trading';

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsSessionOptions = {
  /** @internal Owner approval operation supplied by the parent client. */
  approveBuilderFee?: PerpsBuilderFeeApprover;
  /** Builder selector whose saved approval is restored, or previously resolved terms. */
  builderAttribution?: string | PerpsBuilderTermsInput;
  chainId: number;
  credentials: PerpsCredentials;
  headers?: Record<string, string>;
  /**
   * Include this authenticated account's builder receipts in the session iterator.
   * Subscription is best effort and retried on reconnect; failure does not block the session.
   */
  includeBuilderFills?: boolean;
  onClose: (session: PerpsSession) => void;
  restUrl: string;
  wsUrl: string;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsSessionLifecycleError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type RevokePerpsBuilderFeeError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const RevokePerpsBuilderFeeError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

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
  | OperationAbortedError
  | PerpsCancelRetryError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TimeoutError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export class PerpsSession implements AsyncIterable<PerpsSessionEvent> {
  readonly credentials: PerpsCredentials;
  readonly #approveBuilderFee: PerpsBuilderFeeApprover | undefined;
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
  #builderAddress: string | undefined;
  #builderAttribution: PerpsBuilderTermsInput | undefined;
  #builderConsentChange: Promise<unknown> = Promise.resolve();
  readonly #includeBuilderFills: boolean;
  #nextRequestId = 1;
  #closing: Promise<void> | undefined;

  /**
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  constructor(options: PerpsSessionOptions) {
    this.#approveBuilderFee = options.approveBuilderFee;
    this.#includeBuilderFills = options.includeBuilderFills ?? false;
    this.#builderAttribution =
      options.builderAttribution === undefined ||
      typeof options.builderAttribution === 'string'
        ? undefined
        : Object.freeze(
            parseUserInput(
              options.builderAttribution,
              PerpsBuilderTermsInputSchema,
            ),
          );
    this.#builderAddress =
      typeof options.builderAttribution === 'string'
        ? parseUserInput(options.builderAttribution, EvmAddressSchema)
        : this.#builderAttribution?.builderAddress;
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
   * Most recently resolved builder terms. Resolved when opening the session or granting approval.
   * Undefined when the effective fee is zero or no builder is selected.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  get builderAttribution(): PerpsBuilderTermsInput | undefined {
    return this.#builderAttribution;
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
    if (
      this.#builderAddress !== undefined &&
      this.#builderAttribution === undefined
    ) {
      const status = await unwrap(
        this.#api
          .get('/v1/info/builder', {
            params: new URLSearchParams({ address: this.#builderAddress }),
          })
          .andThen(validateWith(PerpsBuilderStatusSchema)),
      );
      if (!status.registered || !status.enabled || !status.admissionEnabled) {
        throw new UserInputError(
          'Builder attribution is not active for this builder address.',
        );
      }
      const approvals = await this.fetchBuilderApprovals({
        builder: this.#builderAddress,
      });
      const approval = approvals.find(
        (entry) =>
          entry.builder.toLowerCase() === this.#builderAddress?.toLowerCase(),
      );
      const feeRate = minPerpsBuilderFeeRate(
        status.maxFeeRate,
        approval?.maxFeeRate ?? '0',
      );
      this.#builderAttribution = /[1-9]/.test(feeRate)
        ? Object.freeze({ builderAddress: this.#builderAddress, feeRate })
        : undefined;
    }
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
   * With `includeBuilderFills`, also emits receipts earned by this authenticated
   * account as a builder. After resync, reconcile receipts with
   * `listBuilderEarnings` and deduplicate by `earningId`.
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
   * Approves and adopts builder fees with the parent client's owner signer.
   * Requires an explicit maximum fee. The builder address defaults to the selected builder.
   * Approval is needed once and remains valid until revoked or replaced.
   * The SDK increments the saved approval version automatically. Only a
   * confirmed approval refreshes the builder cap and stores the lower of that
   * cap and the approved maximum for future orders. If the cap read fails,
   * consent may already be committed; local terms stay unchanged and the error propagates.
   * A zero effective fee disables attribution while retaining the selected builder.
   *
   * @example
   * ```ts
   * await session.approveBuilderFee({ maxFeeRate: '0.0005' });
   * ```
   * @throws {@link ApprovePerpsBuilderFeeError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async approveBuilderFee(
    request: ApprovePerpsBuilderFeeRequest,
  ): Promise<PerpsBuilderApproval> {
    const approvalRequest = parseUserInput(
      request,
      ApprovePerpsBuilderFeeRequestSchema,
    );
    return this.#changeBuilderConsent(() => ({
      ...approvalRequest,
      builderAddress:
        approvalRequest.builderAddress === undefined
          ? this.#builderAddress
          : approvalRequest.builderAddress,
    }));
  }

  /**
   * Revokes builder consent with the parent client's owner signer.
   * The address defaults to the session's active builder. Confirmation clears
   * that builder from future orders; accepted orders retain their saved terms.
   * Revocation remains available when the builder is inactive.
   *
   * @example
   * ```ts
   * await session.revokeBuilderFee();
   * ```
   * @throws {@link RevokePerpsBuilderFeeError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async revokeBuilderFee(
    builderAddress?: string,
  ): Promise<PerpsBuilderApproval> {
    return this.#changeBuilderConsent(() => {
      const builder = builderAddress ?? this.#builderAddress;
      if (builder === undefined) {
        throw new UserInputError(
          'A builder address is required when the session has no active builder attribution.',
        );
      }
      return { builderAddress: builder, maxFeeRate: '0' };
    });
  }

  #changeBuilderConsent(
    request: () => ApprovePerpsBuilderFeeRequest,
  ): Promise<PerpsBuilderApproval> {
    const change = this.#builderConsentChange
      .catch(() => undefined)
      .then(async () => {
        if (this.closed) throw new TransportError('Perps session closed.');
        if (this.#approveBuilderFee === undefined) {
          throw new UserInputError(
            'Builder approval requires a session opened with a secure client.',
          );
        }
        const approval = await this.#approveBuilderFee(this, request());
        if (/^0+(?:\.0+)?$/.test(approval.maxFeeRate)) {
          if (
            this.#builderAddress?.toLowerCase() ===
            approval.builder.toLowerCase()
          ) {
            this.#builderAttribution = undefined;
            this.#builderAddress = undefined;
          }
        } else {
          const status = await unwrap(
            this.#api
              .get('/v1/info/builder', {
                params: new URLSearchParams({ address: approval.builder }),
              })
              .andThen(validateWith(PerpsBuilderStatusSchema)),
          );
          this.#builderAddress = approval.builder;
          const feeRate = minPerpsBuilderFeeRate(
            status.maxFeeRate,
            approval.maxFeeRate,
          );
          this.#builderAttribution = /[1-9]/.test(feeRate)
            ? Object.freeze({ builderAddress: approval.builder, feeRate })
            : undefined;
        }
        return approval;
      });
    this.#builderConsentChange = change;
    return change;
  }

  /**
   * Fetches this trader's builder grants, including revoked grants.
   * @throws {@link FetchPerpsBuilderApprovalsError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async fetchBuilderApprovals(
    request?: FetchPerpsBuilderApprovalsRequest,
  ): Promise<PerpsBuilderApproval[]> {
    return await fetchPerpsBuilderApprovals(this.#api, request);
  }

  /**
   * Lists fee receipts earned by this authenticated account as a builder.
   * To reconcile with totals, call `fetchBuilderEarningsSummary` first and pass
   * its `snapshot` here; the snapshot pins the window and indexed sequence cutoff.
   * Continuations keep the original window and cutoff.
   * The configured order builder does not change whose earnings are read.
   * @throws {@link ListPerpsBuilderEarningsError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  listBuilderEarnings(
    request?: ListPerpsBuilderEarningsRequest,
  ): Paginated<PerpsBuilderEarning[]> {
    return listPerpsBuilderEarnings(this.#api, request);
  }

  /**
   * Fetches this builder account's earnings totals at a reporting cutoff.
   * Pass the returned `snapshot` to `listBuilderEarnings` to page the matching history.
   * Active approval count reflects current grants, independently of the cutoff.
   * @throws {@link FetchPerpsBuilderEarningsSummaryError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async fetchBuilderEarningsSummary(
    request?: FetchPerpsBuilderEarningsSummaryRequest,
  ): Promise<PerpsBuilderEarningsSummary> {
    return await fetchPerpsBuilderEarningsSummary(this.#api, request);
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

  /** Fetches snapshots for this session's authenticated account. Owner-only
   * leverage and PnL percentage remain null when historical values are unavailable.
   * This direct batch read does not paginate or retry item statuses.
   * @throws {@link FetchPerpsPositionSnapshotsError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async fetchPositionSnapshots(
    request: PerpsPositionSnapshotSelection,
  ): Promise<PerpsPositionSnapshots> {
    return fetchOwnPerpsPositionSnapshots(this.#api, request);
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
   * Fetches the auto-cancel status for the authenticated account, including
   * the armed deadline, today's trigger count, the daily trigger limit, and
   * when the daily counter resets.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async fetchAutoCancelStatus(): Promise<PerpsAutoCancelStatus> {
    return await fetchPerpsAutoCancelStatus(this.#api);
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
   * Lists Perps fills for the authenticated account, optionally by instrument.
   *
   * @remarks
   * Fills are returned newest first by default; set `sort` to change the
   * time direction. Page cursors are opaque values forwarded to the API.
   * An `instrumentId` filter is retained on every page, including when resuming
   * from a cursor. Fill `adl` marks auto-deleveraging; optional
   * `liquidationDetails.mark` is separate from the accounting fill price.
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
   * Lists settled Perps internal transfers with SDK-owned pagination.
   *
   * @remarks
   * Overlapping timestamp boundaries are deduplicated. Throws
   * `UnexpectedResponseError` if a full millisecond cannot be paged without
   * risking omitted transfers.
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  listInternalTransfers(
    request: ListPerpsInternalTransfersRequest = {},
  ): Paginated<PerpsInternalTransfer[]> {
    return listPerpsInternalTransfers(this.#api, request);
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
   * Lists Perps notifications, newest first, with SDK-owned pagination.
   *
   * @remarks
   * After a `resync` session event, pass `sinceSeq` to backfill missed
   * notifications: anchor it at the `sequence` of the last notification event
   * processed before the gap and deduplicate merged results by notification
   * id. Follow-up pages keep the same `sinceSeq` bound automatically.
   *
   * Notifications with types unknown to this SDK version are omitted from
   * page items, so newly introduced notification kinds never fail the read.
   *
   * @example
   * ```ts
   * const page = await session.listNotifications().firstPage();
   * console.log(page.items.length);
   * ```
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  listNotifications(
    request: ListPerpsNotificationsRequest = {},
  ): Paginated<PerpsNotificationEntry[]> {
    return listPerpsNotifications(this.#api, request);
  }

  /**
   * Fetches the account's count of unread Perps notifications.
   *
   * @example
   * ```ts
   * const unread = await session.fetchUnreadNotificationsCount();
   * ```
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async fetchUnreadNotificationsCount(): Promise<number> {
    return await fetchPerpsUnreadNotificationsCount(this.#api);
  }

  /**
   * Marks Perps notifications read, either by id or up to a notification.
   *
   * @remarks
   * Read state is account-scoped: only the authenticated account's
   * notifications can be marked read.
   *
   * @example
   * ```ts
   * await session.markNotificationsRead({ ids: [notification.id] });
   * ```
   *
   * @example
   * ```ts
   * await session.markNotificationsRead({
   *   upTo: { id: entry.notification.id, timestamp: entry.timestamp },
   * });
   * ```
   *
   * @throws {@link PerpsSessionAccountError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async markNotificationsRead(
    request: MarkPerpsNotificationsReadRequest,
  ): Promise<void> {
    await markPerpsNotificationsRead(this.#api, request);
  }

  /**
   * Places one Perps order and resolves with the first matching orders update.
   * GTD orders require a limit price and gtdExpiry in Unix milliseconds.
   * The order expiry is separate from the expiresAt command deadline.
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
    return await placePerpsOrder(this, request);
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
    return await postPerpsOrders(this, request);
  }

  /**
   * Places take-profit and/or stop-loss protection for the current position.
   *
   * @remarks
   * The exit side is inferred from the current position for the requested
   * instrument. Each trigger may specify a positive `quantity` for a partial
   * close; omission closes the full position at trigger time. A partial fill
   * leaves the other trigger armed while a same-side position remains.
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
    return await placePerpsPositionTpSl(this, request);
  }

  /**
   * Cancels one Perps order and returns the cancel result.
   *
   * @remarks
   * The SDK retries only `order_in_flight` rejections with bounded exponential
   * backoff and jitter. Pass `retry: false` to make one attempt. If the retry
   * budget is exhausted, the final `order_in_flight` result is returned. A
   * rejection of the cancellation request throws; an order-specific rejection
   * is returned in the result.
   * If a later attempt fails, {@link PerpsCancelRetryError} retains the last
   * received result and the failure as `cause`. Its `pendingIndexes` contains
   * `0`; that result describes the earlier attempt, not the failed retry.
   * A lost response may hide a completed cancellation, so reconcile the order
   * before submitting another cancellation.
   *
   * @throws {@link PerpsSessionTradingError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async cancelOrder(
    request: CancelPerpsOrderRequest,
  ): Promise<PerpsCancelOrderResult> {
    return await cancelPerpsOrder(this, request);
  }

  /**
   * Cancels one or more Perps orders and returns one result per requested order.
   *
   * @remarks
   * The SDK retries only orders rejected with `order_in_flight`; terminal
   * results are retained while transient orders are retried as a smaller batch.
   * Pass `retry: false` to make one attempt. Exhausted transient results retain
   * their final `order_in_flight` rejection. A rejection of the whole
   * cancellation request throws; order-specific rejections remain in their
   * result positions.
   * If a later attempt fails, {@link PerpsCancelRetryError} retains the last
   * received `results` in the original request order and the failure as `cause`.
   * Its `pendingIndexes` identifies the original request positions included in
   * that failed attempt. Those entries are historical rejections, not outcomes
   * of the failed retry; other entries retain their confirmed outcomes. A lost
   * response may hide completed cancellations, so reconcile the pending orders
   * before submitting another cancellation.
   *
   * @throws {@link PerpsSessionTradingError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async cancelOrders(
    request: CancelPerpsOrdersRequest,
  ): Promise<PerpsCancelOrderResult[]> {
    return await cancelPerpsOrders(this, request);
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
    await cancelAllOrders(this, request);
  }

  /**
   * Arms the auto-cancel switch that cancels all open Perps orders for the
   * authenticated account at `cancelAt`.
   *
   * @remarks
   * The switch is one-shot: once it fires and open orders are cancelled, the
   * schedule clears itself and orders placed afterwards are unprotected.
   * Re-arm periodically to keep protection active. Arming again replaces the
   * previous schedule, and `cancelAt` must be at least five seconds in the
   * future. Accounts may only trigger auto-cancel a limited number of times
   * per UTC day; use {@link PerpsSession.fetchAutoCancelStatus} to inspect the
   * limit, today's trigger count, and when the counter resets.
   *
   * @example
   * ```ts
   * // Keep a 60-second dead man's switch alive by re-arming every 20 seconds.
   * await session.armAutoCancel({ cancelAt: Date.now() + 60_000 });
   * const rearm = setInterval(() => {
   *   // A missed re-arm is fail-safe: the previously armed switch still fires.
   *   session.armAutoCancel({ cancelAt: Date.now() + 60_000 }).catch(() => {});
   * }, 20_000);
   *
   * // On graceful shutdown, stop re-arming and disarm the schedule.
   * clearInterval(rearm);
   * await session.disarmAutoCancel();
   * ```
   *
   * @throws {@link ArmPerpsAutoCancelError}
   * Thrown on failure, including `AutoCancelDailyLimitError` when the daily
   * trigger limit has been reached.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async armAutoCancel(request: ArmPerpsAutoCancelRequest): Promise<void> {
    await armPerpsAutoCancel(
      this.#api,
      (op, expiresAt) => this.#createSignedCommand(op, expiresAt),
      request,
    );
  }

  /**
   * Disarms the auto-cancel schedule for the authenticated account without
   * triggering it.
   *
   * @remarks
   * Disarming is always allowed, even when the daily trigger limit has been
   * reached.
   *
   * @throws {@link PerpsSessionTradingError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async disarmAutoCancel(
    request?: DisarmPerpsAutoCancelRequest,
  ): Promise<void> {
    await disarmPerpsAutoCancel(
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
    return await updatePerpsLeverage(this, request);
  }

  /**
   * Updates Perps leverage and margin mode for one or more instruments.
   *
   * @remarks
   * The batch must contain one to 100 unique instruments. Updates are
   * processed sequentially and are not atomic. Results preserve request
   * order. Per-instrument rejections, including `internal_error`, are returned
   * as data; `internal_error` may represent an unknown application outcome for
   * that instrument. A whole-request `internal_error` also has an unknown
   * application outcome; reconcile account state before retrying the batch.
   *
   * @example
   * ```ts
   * const results = await session.updateLeverages({
   *   updates: [
   *     { crossMargin: false, instrumentId: 1, leverage: 5 },
   *     { crossMargin: true, instrumentId: 2, leverage: 10 },
   *   ],
   * });
   * ```
   *
   * @throws {@link UpdatePerpsLeveragesError}
   * Thrown when the complete request is rejected, cannot be sent, or returns inconsistent results.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async updateLeverages(
    request: UpdatePerpsLeveragesRequest,
  ): Promise<PerpsUpdateLeverageBatchResult[]> {
    return await updatePerpsLeverages(this, request);
  }

  /**
   * Adjusts isolated margin for an instrument position.
   *
   * @remarks
   * A positive amount adds isolated margin. A negative amount removes it.
   *
   * @example
   * ```ts
   * await session.updateMargin({
   *   instrumentId: 1,
   *   amount: '100.25',
   * });
   * ```
   *
   * @throws {@link UpdatePerpsMarginError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async updateMargin(request: UpdatePerpsMarginRequest): Promise<void> {
    await updatePerpsMargin(this, request);
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
      COMMAND_TIMEOUT_MS,
      'Perps session subscription timed out.',
    );

    if (this.#includeBuilderFills) {
      // Optional receipts must not delay or fail core session readiness. Retry
      // on each reconnect; pending requests are cleaned up on timeout or close.
      void this.#sendRequest(
        {
          id: this.#nextRequestId++,
          req: 'sub',
          chs: ['builderFills'],
        },
        PerpsSessionAckSchema,
        COMMAND_TIMEOUT_MS,
        'Perps builder fills subscription timed out.',
      ).catch(() => undefined);
    }
  }

  #authenticatedHeaders(): HeadersInit {
    return {
      'POLYMARKET-PROXY': this.credentials.proxy,
      'POLYMARKET-SECRET': this.credentials.secret,
    };
  }

  /**
   * @internal
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async executeCommand<T>(
    request: PerpsCommandRequest,
    responseSchema: z.ZodType<T>,
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
      responseSchema,
      COMMAND_TIMEOUT_MS,
      'Perps command response timed out.',
    );
  }

  /**
   * @internal
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async executeCommandWithEvent<TResponse, TEvent extends PerpsSessionEvent>(
    request: PerpsCommandRequest,
    responseSchema: z.ZodType<TResponse>,
    predicate: (event: PerpsSessionEvent) => event is TEvent,
  ): Promise<readonly [TResponse, TEvent]> {
    const waiter = this.#createEventWaiter(predicate);
    const command = this.executeCommand(request, responseSchema);
    // The waiter is already active; its deadline begins after acknowledgement.
    void command.then(
      () =>
        this.#startEventWaiterTimeout(
          waiter,
          ORDER_PLACEMENT_UPDATE_TIMEOUT_MS,
        ),
      () => undefined,
    );

    try {
      const [commandResponse, event] = await Promise.all([
        command,
        waiter.promise,
      ]);
      return [commandResponse, event as TEvent];
    } finally {
      this.#removeEventWaiter(waiter);
    }
  }

  /**
   * @internal
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async executeDeleteCommand<T>(
    request: PerpsDeleteCommandRequest<T>,
  ): Promise<T> {
    const command = this.#createSignedCommand(request.op, request.expiresAt);
    return await unwrap(
      this.#api
        .del(request.path, {
          json: {
            ...command,
            op: toPerpsCommandBodyOp(request.op),
          },
        })
        .andThen(validateWith(request.responseSchema)),
    );
  }

  /** Create a chase using this session. Reconcile uncertain submissions before trying again.
   * @throws {@link CreatePerpsChaseError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async createChase(
    request: CreatePerpsChaseRequest,
  ): Promise<PerpsChaseAccepted> {
    return await createPerpsChase(
      this.#api,
      this.#createSignedCommand.bind(this),
      request,
    );
  }
  /** End a chase and cancel its resting child; completed fills remain.
   * @throws {@link CancelPerpsChaseError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async cancelChase(request: CancelPerpsChaseRequest): Promise<void> {
    return await cancelPerpsChase(
      this.#api,
      this.#createSignedCommand.bind(this),
      request,
    );
  }
  /** Fetch all running chases without pagination. Ended chases are absent.
   * @throws {@link FetchPerpsChasesError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async fetchChases(): Promise<PerpsChase[]> {
    return await fetchPerpsChases(this.#api);
  }

  /** Create a TWAP using this session's credentials.
   * @throws {@link CreatePerpsTwapError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async createTwap(
    request: CreatePerpsTwapRequest,
  ): Promise<PerpsTwapAccepted> {
    return await createPerpsTwap(
      this.#api,
      this.#createSignedCommand.bind(this),
      request,
    );
  }

  /** Pause a TWAP using this session's credentials.
   * @throws {@link PausePerpsTwapError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async pauseTwap(request: PausePerpsTwapRequest): Promise<void> {
    return await pausePerpsTwap(
      this.#api,
      this.#createSignedCommand.bind(this),
      request,
    );
  }

  /** Resume a TWAP using this session's credentials.
   * @throws {@link ResumePerpsTwapError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async resumeTwap(request: ResumePerpsTwapRequest): Promise<void> {
    return await resumePerpsTwap(
      this.#api,
      this.#createSignedCommand.bind(this),
      request,
    );
  }

  /** Cancel a TWAP using this session's credentials.
   * @throws {@link CancelPerpsTwapError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async cancelTwap(request: CancelPerpsTwapRequest): Promise<void> {
    return await cancelPerpsTwap(
      this.#api,
      this.#createSignedCommand.bind(this),
      request,
    );
  }

  /** Fetch all active TWAPs. Ended runs are absent; no pagination.
   * @throws {@link FetchPerpsTwapsError} Thrown on failure.
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  async fetchTwaps(): Promise<PerpsTwap[]> {
    return await fetchPerpsTwaps(this.#api);
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

    const resync = PerpsNotificationsResyncFrameSchema.safeParse(rawMessage);
    if (resync.success) {
      this.#emitEvent(resync.data);
      return;
    }

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
    if (SERVER_RESYNC_CHANNELS.has(event.channel)) return;

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

  #createEventWaiter(
    predicate: (event: PerpsSessionEvent) => boolean,
  ): EventWaiter {
    let resolve!: (event: PerpsSessionEvent) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<PerpsSessionEvent>(
      (resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      },
    );
    const waiter: EventWaiter = {
      promise,
      predicate,
      reject,
      resolve,
    };
    this.#eventWaiters.add(waiter);
    return waiter;
  }

  #startEventWaiterTimeout(waiter: EventWaiter, timeoutMs: number): void {
    if (!this.#eventWaiters.has(waiter)) return;
    waiter.timeout = setNonBlockingTimeout(() => {
      this.#removeEventWaiter(waiter);
      waiter.reject(new TimeoutError('Perps event wait timed out.'));
    }, timeoutMs);
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
    if (waiter.timeout !== undefined) clearTimeout(waiter.timeout);
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
  // Array schemas own per-item error policy; only schema failures recurse into them.
  if (Array.isArray(value)) return false;
  return errorAckFrom(value) !== undefined;
}

function errorAckFrom(value: unknown): { error: string } | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const error = errorAckFrom(item);
      if (error !== undefined) return error;
    }
    return undefined;
  }
  if (typeof value !== 'object' || value === null) {
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

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export {
  CancelPerpsChaseError,
  type CancelPerpsChaseRequest,
  CreatePerpsChaseError,
  type CreatePerpsChaseRequest,
  FetchPerpsChasesError,
} from './actions/chases';

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export {
  CancelPerpsTwapError,
  type CancelPerpsTwapRequest,
  CreatePerpsTwapError,
  type CreatePerpsTwapRequest,
  FetchPerpsTwapsError,
  PausePerpsTwapError,
  type PausePerpsTwapRequest,
  ResumePerpsTwapError,
  type ResumePerpsTwapRequest,
} from './actions/twaps';

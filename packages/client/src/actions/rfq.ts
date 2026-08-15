import type {
  BuilderCode,
  DecimalString,
  EpochMilliseconds,
  PositionId,
  TxHash,
} from '@polymarket/bindings';
import {
  OrderSide,
  OrderSideSchema,
  toBaseUnits,
  toBuilderCode,
  toPositionId,
  toRfqId,
  toRfqQuoteId,
} from '@polymarket/bindings';
import type {
  RfqConfirmationAck as BindingRfqConfirmationAck,
  RfqQuoteAck as BindingRfqQuoteAck,
  RfqQuoteCancelAck as BindingRfqQuoteCancelAck,
  BuilderRfqAcceptRequest,
  BuilderRfqCreateRequest,
  BuilderRfqError,
  BuilderRfqFinalStateResponse,
  BuilderRfqQuoteReadyResponse,
  BuilderRfqStatusResponse,
  RfqConfirmationRequest,
  RfqErrorCode,
  RfqExecutionUpdate,
  RfqId,
  RfqQuoteId,
  RfqQuoteRequest,
  RfqRequestedSize,
  RfqRequestorPublicId,
  RfqSignedOrder,
} from '@polymarket/bindings/combos';
import {
  BuilderRfqCreateResponseSchema,
  BuilderRfqStatusResponseSchema,
  ComboAcceptFailureReason,
  ComboQuoteUnavailableReason,
  RfqDirection,
  RfqExecutionStatus,
  RfqKnownErrorCode,
  RfqRejectionCode,
  RfqRequestedSizeUnit,
  RfqSide,
  RfqStatus,
  type RfqTrade,
} from '@polymarket/bindings/combos';
import type { EvmSignature } from '@polymarket/types';
import { delay, PolymarketError, unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseSecureClient } from '../clients';
import {
  CancelledSigningError,
  ConnectionLostError,
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import type { ExchangeOrderDomain } from '../exchange';
import {
  createExchangeOrderSignature,
  createExchangeOrderTypedDataPayload,
  createExchangeV3OrderDomain,
  encodeExchangeOrderSide,
} from '../exchange';
import { parseUserInput } from '../input';
import { validateWith } from '../response';
import { resolveOrderIdentity } from '../wallet';

export {
  ComboAcceptFailureReason,
  ComboQuoteUnavailableReason,
  RfqConfirmationDecision,
  RfqDirection,
  RfqExecutionStatus,
  RfqKnownErrorCode,
  RfqRejectionCode,
  RfqRequestedSizeUnit,
  RfqSide,
  RfqStatus,
} from '@polymarket/bindings/combos';
export type {
  BuilderRfqError,
  RfqConfirmationRequest,
  RfqErrorCode,
  RfqExecutionUpdate,
  RfqId,
  RfqQuoteId,
  RfqQuoteRequest,
  RfqRequestedSize,
  RfqRequestorPublicId,
  RfqTrade,
};

/**
 * Plain-data reference identifying a submitted RFQ quote.
 *
 * @remarks
 * This identifies the quote; it does not imply execution or guarantee that a
 * later cancellation request can withdraw it.
 */
export type RfqQuoteReference = Omit<BindingRfqQuoteAck, 'type'>;

/** Acknowledgement that a quote cancellation request was processed. */
export type RfqCancelQuoteAck = Omit<BindingRfqQuoteCancelAck, 'type'>;
export type RfqConfirmationAck = Omit<
  BindingRfqConfirmationAck,
  'decision' | 'type'
>;

export type RfqQuoteSource = 'collateral' | 'inventory';

export type RfqQuoteResponse = {
  /** Quote price in pUSD per outcome token, for example `0.45` or `"0.45"`. */
  price: number | string;

  /**
   * How the maker wants to fund the quote.
   *
   * @remarks
   * For a BUY request (BUY YES):
   * - `inventory` sells YES tokens from the maker's inventory at `price`.
   * - `collateral` buys NO tokens with collateral at `1 - price`.
   *
   * For a SELL request (SELL YES):
   * - `inventory` sells NO tokens from the maker's inventory at `1 - price`.
   * - `collateral` buys YES tokens with collateral at `price`.
   *
   * When omitted, the SDK uses `collateral`.
   *
   * @defaultValue `'collateral'`
   */
  source?: RfqQuoteSource;

  /**
   * Optional quote size in outcome tokens.
   *
   * This is the human-readable token amount: `1` means one full share, not one
   * 6-decimal base unit. When omitted, the quote uses the full RFQ request size.
   */
  size?: number | string;
};

export type RfqQuoteRejectedErrorOptions = {
  /** RFQ error code for the rejected quote. */
  code?: RfqErrorCode;
  /** Error identifier for the rejected quote. */
  errorId?: string;
  /** RFQ identifier for the rejected quote. */
  rfqId: RfqId;
};

/**
 * Error thrown when the RFQ server rejects a quote response.
 */
export class RfqQuoteRejectedError extends PolymarketError {
  override name = 'RfqQuoteRejectedError' as const;

  readonly code: RfqErrorCode | undefined;
  readonly errorId: string | undefined;
  readonly rfqId: RfqId;

  constructor(
    message: string,
    options: ErrorOptions & RfqQuoteRejectedErrorOptions,
  ) {
    super(message, options);
    this.code = options.code;
    this.errorId = options.errorId;
    this.rfqId = options.rfqId;
  }
}

export type RfqQuoteError =
  | ConnectionLostError
  | RfqQuoteRejectedError
  | SigningError
  | TimeoutError
  | TransportError
  | UserInputError;
export const RfqQuoteError = makeErrorGuard(
  ConnectionLostError,
  RfqQuoteRejectedError,
  SigningError,
  TimeoutError,
  TransportError,
  UserInputError,
);

export type RfqCancelQuoteRejectedErrorOptions = {
  /** RFQ error code for the rejected cancellation request. */
  code?: RfqErrorCode;
  /** Error identifier for the rejected cancellation request. */
  errorId?: string;
  /** RFQ identifier for the cancellation request. */
  rfqId: RfqId;
  /** Quote identifier for the cancellation request. */
  quoteId: RfqQuoteId;
};

/**
 * Error thrown when the RFQ server rejects a quote cancellation request.
 */
export class RfqCancelQuoteRejectedError extends PolymarketError {
  override name = 'RfqCancelQuoteRejectedError' as const;

  readonly code: RfqErrorCode | undefined;
  readonly errorId: string | undefined;
  readonly rfqId: RfqId;
  readonly quoteId: RfqQuoteId;

  constructor(
    message: string,
    options: ErrorOptions & RfqCancelQuoteRejectedErrorOptions,
  ) {
    super(message, options);
    this.code = options.code;
    this.errorId = options.errorId;
    this.rfqId = options.rfqId;
    this.quoteId = options.quoteId;
  }
}

export type RfqCancelQuoteError =
  | ConnectionLostError
  | RfqCancelQuoteRejectedError
  | TimeoutError
  | TransportError;
export const RfqCancelQuoteError = makeErrorGuard(
  ConnectionLostError,
  RfqCancelQuoteRejectedError,
  TimeoutError,
  TransportError,
);

export type RfqConfirmationRejectedErrorOptions = {
  /** RFQ error code for the rejected confirmation decision. */
  code?: RfqErrorCode;
  /** Error identifier for the rejected confirmation decision. */
  errorId?: string;
  /** RFQ identifier for the rejected confirmation decision. */
  rfqId: RfqId;
  /** Quote identifier for the rejected confirmation decision. */
  quoteId: RfqQuoteId;
};

/**
 * Error thrown when the RFQ server rejects a confirmation decision.
 */
export class RfqConfirmationRejectedError extends PolymarketError {
  override name = 'RfqConfirmationRejectedError' as const;

  readonly code: RfqErrorCode | undefined;
  readonly errorId: string | undefined;
  readonly rfqId: RfqId;
  readonly quoteId: RfqQuoteId;

  constructor(
    message: string,
    options: ErrorOptions & RfqConfirmationRejectedErrorOptions,
  ) {
    super(message, options);
    this.code = options.code;
    this.errorId = options.errorId;
    this.rfqId = options.rfqId;
    this.quoteId = options.quoteId;
  }
}

export type RfqConfirmationError =
  | ConnectionLostError
  | RfqConfirmationRejectedError
  | TimeoutError
  | TransportError;
export const RfqConfirmationError = makeErrorGuard(
  ConnectionLostError,
  RfqConfirmationRejectedError,
  TimeoutError,
  TransportError,
);

/**
 * Server request asking the market maker to provide a quote for an RFQ.
 */
export interface RfqQuoteRequestEvent extends RfqQuoteRequest {
  /** Requested RFQ size and unit. Share values are human-readable outcome-token amounts. */
  requestedSize: RfqRequestedSize;

  /**
   * Requested RFQ position side.
   *
   * @remarks
   * The current RFQ system only supports YES-side requests, so this is always
   * {@link RfqSide.Yes}. Use {@link RfqQuoteRequestEvent.direction} to determine
   * whether the requester wants to buy or sell that YES-side position.
   */
  side: RfqSide.Yes;

  /**
   * Sends a quote response for this RFQ request.
   *
   * @remarks
   * If this resolves, the server accepted the quote and assigned `quoteId`.
   *
   * @throws {@link RfqQuoteError}
   * Thrown when validation fails, signing fails, the websocket fails, the quote
   * acknowledgement times out, or the server rejects the quote.
   */
  quote(response: RfqQuoteResponse): Promise<RfqQuoteReference>;
}

/**
 * Server request asking the market maker to confirm or decline a selected quote.
 */
export interface RfqConfirmationRequestEvent extends RfqConfirmationRequest {
  /**
   * Requested RFQ position side.
   *
   * @remarks
   * The current RFQ system only supports YES-side requests, so this is always
   * {@link RfqSide.Yes}. Use {@link RfqConfirmationRequestEvent.direction} to
   * determine whether the requester wants to buy or sell that YES-side position.
   */
  side: RfqSide.Yes;

  /**
   * Confirms that the maker wants to proceed with the selected quote.
   *
   * @remarks
   * If this resolves, the server accepted the confirmation decision.
   *
   * @throws {@link RfqConfirmationError}
   * Thrown when the websocket fails, the acknowledgement times out, or the
   * server rejects the confirmation decision.
   */
  confirm(): Promise<RfqConfirmationAck>;

  /**
   * Declines the selected quote during the confirmation window.
   *
   * @remarks
   * If this resolves, the server accepted the decline decision.
   *
   * @throws {@link RfqConfirmationError}
   * Thrown when the websocket fails, the acknowledgement times out, or the
   * server rejects the decline decision.
   */
  decline(): Promise<RfqConfirmationAck>;
}

/**
 * Execution status update for an RFQ after acceptance and handoff.
 */
export interface RfqExecutionUpdateEvent extends RfqExecutionUpdate {}

/**
 * Confirmed combo trade broadcast visible to all authenticated quoters.
 */
export interface RfqTradeEvent extends RfqTrade {}

/**
 * Event emitted by an RFQ session.
 */
export type RfqEvent =
  | RfqQuoteRequestEvent
  | RfqConfirmationRequestEvent
  | RfqExecutionUpdateEvent
  | RfqTradeEvent;

export interface RfqSession extends AsyncIterable<RfqEvent> {
  /**
   * Requests cancellation of a submitted RFQ quote.
   *
   * @remarks
   * The returned ack means the backend processed the cancellation request; it
   * does not guarantee the quote was withdrawn from an already-selected RFQ.
   *
   * @throws {@link RfqCancelQuoteError}
   * Thrown when the websocket fails, the acknowledgement times out, or the
   * server rejects the cancellation request.
   */
  cancelQuote(reference: RfqQuoteReference): Promise<RfqCancelQuoteAck>;

  /**
   * Closes the RFQ quoter stream.
   */
  close(): Promise<void>;
}

export type OpenRfqSessionError = ConnectionLostError | TransportError;
export const OpenRfqSessionError = makeErrorGuard(
  ConnectionLostError,
  TransportError,
);

/**
 * Opens an RFQ event session.
 *
 * @remarks
 * The returned async iterator is a stream, not a worker queue. Await inside the
 * loop to process RFQ events sequentially, or dispatch handlers without awaiting
 * them to fan out handling when quote windows are tight.
 *
 * @throws {@link OpenRfqSessionError}
 * Thrown on failure.
 */
export async function openRfqSession(
  client: BaseSecureClient,
): Promise<RfqSession> {
  return client.webSockets.rfqQuoter.connect();
}

const BUILDER_RFQ_REQUESTS_PATH = '/v1/builder/rfq/requests';
// Quote requests are held through the quote competition and can take well
// beyond the transport's standard timeout.
const CREATE_QUOTE_TIMEOUT_MS = 30_000;
// Accept processing includes synchronous validation and reservation work before
// the gateway briefly holds the request for a maker last-look outcome.
const ACCEPT_QUOTE_TIMEOUT_MS = 30_000;
const ACCEPT_OUTCOME_TIMEOUT_MS = 30_000;
const ACCEPT_OUTCOME_POLL_INTERVAL_MS = 500;
const DEFAULT_FILL_TIMEOUT_MS = 30_000;
const DEFAULT_FILL_POLL_INTERVAL_MS = 1_000;
const BYTES32_ZERO =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export type RfqRequestRejectedErrorOptions = {
  /** HTTP status of the rejection. */
  status: number;
  /** Classified rejection reason. */
  code: RfqRejectionCode;
};

/**
 * Error thrown when an RFQ request or acceptance is rejected.
 *
 * @remarks
 * Inspect {@link RfqRequestRejectedError.code} to distinguish permanent input
 * problems (`INVALID_RFQ`, `CONTRADICTORY_LEGS`) from transient conditions
 * (`LEG_METADATA_UNAVAILABLE`) that may be retried.
 *
 * Wire codes not recognized by this SDK version map to
 * {@link RfqRejectionCode.RequestFailed}; the original error is preserved on
 * `cause`.
 */
export class RfqRequestRejectedError extends PolymarketError {
  override name = 'RfqRequestRejectedError' as const;

  /** HTTP status of the rejection. */
  readonly status: number;

  /** Classified rejection reason. */
  readonly code: RfqRejectionCode;

  constructor(
    message: string,
    options: ErrorOptions & RfqRequestRejectedErrorOptions,
  ) {
    super(message, options);
    this.status = options.status;
    this.code = options.code;
  }
}

type BuilderGatewayRequestError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;

function toRfqRequestRejection(
  error: BuilderGatewayRequestError,
):
  | RateLimitError
  | RfqRequestRejectedError
  | TransportError
  | UnexpectedResponseError {
  if (error instanceof RequestRejectedError) {
    return new RfqRequestRejectedError(error.message, {
      cause: error,
      code: toRfqRejectionCode(error.code),
      status: error.status,
    });
  }

  return error;
}

const RFQ_REJECTION_CODES = new Set<string>(Object.values(RfqRejectionCode));

function toRfqRejectionCode(code: string | undefined): RfqRejectionCode {
  if (code !== undefined && RFQ_REJECTION_CODES.has(code)) {
    return code as RfqRejectionCode;
  }

  return RfqRejectionCode.RequestFailed;
}

function assertBuilderAuthorization(client: BaseSecureClient): void {
  if (!client.hasBuilderApiKey) {
    throw new UserInputError(
      'Combo RFQ requests require a Builder API Key in the client configuration, via builderApiKey(...) or remoteBuilderSigning(...).',
    );
  }
}

const ComboLegPositionIdsSchema = z
  .array(
    z
      .string()
      .regex(/^\d+$/, 'Leg position IDs must be numeric strings.')
      .transform((value) => toPositionId(BigInt(value).toString())),
  )
  .min(2, 'Combo requests require at least 2 legs.')
  .max(50, 'Combo requests allow at most 50 legs.')
  .refine(
    (legs) => new Set(legs).size === legs.length,
    'Leg position IDs must not contain duplicates.',
  )
  .transform((legs) =>
    [...legs].sort((left, right) => {
      const leftPositionId = BigInt(left);
      const rightPositionId = BigInt(right);

      if (leftPositionId < rightPositionId) return -1;
      if (leftPositionId > rightPositionId) return 1;
      return 0;
    }),
  );

const ComboAmountToBaseUnitsSchema = z
  .union([z.number(), z.string()])
  .transform((value, context): string => {
    const match = /^(\d+)(?:\.(\d*))?$/.exec(String(value));

    if (match === null) {
      context.addIssue({
        code: 'custom',
        message: 'Value must be a valid decimal.',
      });
      return z.NEVER;
    }

    const [, whole = '', fraction = ''] = match;

    if (fraction.length > 6) {
      context.addIssue({
        code: 'custom',
        message: 'Value must have at most 6 decimal places.',
      });
      return z.NEVER;
    }

    const scaledValue = scaleE6DecimalParts(whole, fraction);

    if (scaledValue <= 0n) {
      context.addIssue({
        code: 'custom',
        message: 'Value must be greater than 0.',
      });
      return z.NEVER;
    }

    return scaledValue.toString();
  });

function scaleE6DecimalParts(whole: string, fraction: string): bigint {
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

type ComboQuoteFields = {
  /** RFQ identifier. */
  rfqId: RfqId;

  /** Winning quote identifier. */
  quoteId: RfqQuoteId;

  /** Builder code attached to the signed acceptance order. */
  builderCode: BuilderCode;

  /** Combo YES position traded by the acceptance order. */
  positionId: PositionId;

  /** Signed-order collateral for BUY, or position shares for SELL. */
  makerAmount: DecimalString;

  /** Signed-order shares for BUY, or gross collateral limit for SELL. */
  takerAmount: DecimalString;

  /** Blended price across legs, in collateral per outcome token. */
  blendedPrice: DecimalString;

  /** Total collateral including fees for BUY, or position shares for SELL. */
  totalRequired: DecimalString;

  /** Acceptance deadline (Unix ms). */
  expiresAt: EpochMilliseconds;
};

/**
 * A self-contained winning combo quote.
 *
 * @remarks
 * The quote is plain JSON data and carries every input needed to accept it.
 * It may be persisted or routed between processes before being passed to
 * {@link acceptComboQuote}.
 */
export type ComboQuote = ComboQuoteFields &
  (
    | {
        /** Trade direction of the original request. */
        direction: OrderSide.BUY;

        /** Net proceeds apply only to SELL quotes. */
        netReceive?: undefined;
      }
    | {
        /** Trade direction of the original request. */
        direction: OrderSide.SELL;

        /** Exact collateral proceeds for the quoted bundle after fees. */
        netReceive: DecimalString;
      }
  );

export type RequestComboQuoteParams = {
  /** Position IDs of the combo legs. Between 2 and 50, no duplicates. */
  legPositionIds: string[];

  /**
   * Combinatorial position side. Only `YES` is currently supported.
   *
   * @defaultValue {@link RfqSide.Yes}
   */
  side?: RfqSide.Yes;
} & (
  | {
      direction: OrderSide.BUY;

      /**
       * Collateral to spend, in USDC, including fees.
       *
       * This is the human-readable amount: `1` means one dollar, not one
       * 6-decimal base unit.
       */
      amount: number | string;
    }
  | {
      direction: OrderSide.SELL;

      /**
       * Size to sell, in outcome tokens.
       *
       * This is the human-readable token amount: `1` means one full share,
       * not one 6-decimal base unit.
       */
      size: number | string;
    }
);

export type RequestComboQuoteResult =
  | {
      rfqId: RfqId;

      /** The winning quote. */
      quote: ComboQuote;
    }
  | {
      rfqId: RfqId;

      /** No usable quote was returned. */
      quote: null;

      reason: ComboQuoteUnavailableReason;
    };

const RequestComboQuoteParamsSchema = z.discriminatedUnion('direction', [
  z.object({
    amount: ComboAmountToBaseUnitsSchema,
    direction: z.literal(OrderSide.BUY),
    legPositionIds: ComboLegPositionIdsSchema,
    side: z.literal(RfqSide.Yes).optional(),
  }),
  z.object({
    direction: z.literal(OrderSide.SELL),
    legPositionIds: ComboLegPositionIdsSchema,
    side: z.literal(RfqSide.Yes).optional(),
    size: ComboAmountToBaseUnitsSchema,
  }),
]);

export type RequestComboQuoteError =
  | RateLimitError
  | RfqRequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const RequestComboQuoteError = makeErrorGuard(
  RateLimitError,
  RfqRequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Requests a quote for a combo of positions.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * Resolves when the quote competition window closes. A request that attracts
 * no usable quotes is a normal outcome, returned as `quote: null` with a
 * reason rather than thrown.
 *
 * A winning quote is self-contained JSON data and may be persisted or routed
 * to another process before acceptance.
 *
 * @throws {@link RequestComboQuoteError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const result = await requestComboQuote(client, {
 *   legPositionIds: ['123', '456'],
 *   direction: OrderSide.BUY,
 *   amount: 100,
 * });
 *
 * if (result.quote !== null) {
 *   // result.quote.blendedPrice: DecimalString
 *   // result.quote.totalRequired: DecimalString
 *   // SELL quotes also carry result.quote.netReceive after fees.
 * }
 * ```
 */
export async function requestComboQuote(
  client: BaseSecureClient,
  params: RequestComboQuoteParams,
): Promise<RequestComboQuoteResult> {
  const input = parseUserInput(params, RequestComboQuoteParamsSchema);
  assertBuilderAuthorization(client);

  const identity = resolveOrderIdentity(client.account);
  const request: BuilderRfqCreateRequest = {
    direction:
      input.direction === OrderSide.BUY ? RfqDirection.Buy : RfqDirection.Sell,
    leg_position_ids: input.legPositionIds,
    maker_address: identity.maker,
    requested_size:
      input.direction === OrderSide.BUY
        ? { unit: RfqRequestedSizeUnit.Notional, value_e6: input.amount }
        : { unit: RfqRequestedSizeUnit.Shares, value_e6: input.size },
    side: RfqSide.Yes,
    signature_type: identity.signatureType,
    signer_address: identity.signer,
  };

  const response = await unwrap(
    client.builderGateway
      .post(BUILDER_RFQ_REQUESTS_PATH, {
        json: request,
        timeout: CREATE_QUOTE_TIMEOUT_MS,
      })
      .andThen(validateWith(BuilderRfqCreateResponseSchema))
      .mapErr(toRfqRequestRejection),
  );

  if ('quote' in response) {
    assertBuilderRfqResponseMatchesRequest(response, request);

    const direction =
      response.request.direction === RfqDirection.Buy
        ? OrderSide.BUY
        : OrderSide.SELL;
    const quote = {
      blendedPrice: response.quote.blendedPrice,
      builderCode: response.builderCode,
      expiresAt: response.expiresAt,
      makerAmount: response.quote.makerAmount,
      positionId: response.request.yesPositionId,
      quoteId: response.quote.quoteId,
      rfqId: response.rfqId,
      takerAmount: response.quote.takerAmount,
      totalRequired: response.quote.totalRequired,
    } satisfies ComboQuoteFields;

    if (direction === OrderSide.SELL) {
      if (response.quote.netReceive === undefined) {
        throw new UnexpectedResponseError(
          `SELL quote for RFQ ${response.rfqId} omitted net sell proceeds.`,
        );
      }

      return {
        quote: {
          ...quote,
          direction,
          netReceive: response.quote.netReceive,
        },
        rfqId: response.rfqId,
      };
    }

    return {
      quote: {
        ...quote,
        direction,
      },
      rfqId: response.rfqId,
    };
  }

  return toQuoteUnavailableResult(response);
}

function assertBuilderRfqResponseMatchesRequest(
  response: BuilderRfqQuoteReadyResponse,
  request: BuilderRfqCreateRequest,
): void {
  const echoed = response.request;
  const mismatchedFields: string[] = [];

  if (echoed.rfqId !== response.rfqId) mismatchedFields.push('rfq_id');
  if (echoed.direction !== request.direction) {
    mismatchedFields.push('direction');
  }
  if (echoed.side !== request.side) mismatchedFields.push('side');
  if (
    echoed.legPositionIds.length !== request.leg_position_ids.length ||
    echoed.legPositionIds.some(
      (positionId, index) => positionId !== request.leg_position_ids[index],
    )
  ) {
    mismatchedFields.push('leg_position_ids');
  }
  if (
    echoed.requestedSize.unit !== request.requested_size.unit ||
    echoed.requestedSize.valueE6 !== request.requested_size.value_e6
  ) {
    mismatchedFields.push('requested_size');
  }

  if (mismatchedFields.length > 0) {
    throw new UnexpectedResponseError(
      `Builder RFQ response did not echo the submitted ${mismatchedFields.join(', ')}.`,
    );
  }
}

function toQuoteUnavailableResult(
  response: BuilderRfqFinalStateResponse,
): RequestComboQuoteResult {
  switch (response.error?.code) {
    case RfqKnownErrorCode.NoQuotes:
      return {
        quote: null,
        reason: ComboQuoteUnavailableReason.NoQuotes,
        rfqId: response.rfqId,
      };
    case RfqKnownErrorCode.SizeTooLarge:
      return {
        quote: null,
        reason: ComboQuoteUnavailableReason.SizeTooLarge,
        rfqId: response.rfqId,
      };
    default:
      throw new RfqRequestRejectedError(
        response.error?.message ?? 'The combo quote request failed.',
        {
          code: toRfqRejectionCode(response.error?.code),
          status: 200,
          ...(response.error === undefined ? {} : { cause: response.error }),
        },
      );
  }
}

const AcceptComboQuoteDirectionSchema: z.ZodType<OrderSide, `${OrderSide}`> =
  OrderSideSchema;

const AcceptComboQuoteParamsSchema = z.object({
  blendedPrice: z.string(),
  builderCode: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'builderCode must be a 32-byte hex string.')
    .transform(toBuilderCode),
  direction: AcceptComboQuoteDirectionSchema,
  expiresAt: z.number().int().nonnegative(),
  makerAmount: ComboAmountToBaseUnitsSchema.transform(toBaseUnits),
  netReceive: z.string().optional(),
  positionId: z
    .string()
    .regex(/^\d+$/, 'positionId must be a numeric string.')
    .transform(toPositionId),
  quoteId: z.string().min(1).transform(toRfqQuoteId),
  rfqId: z.string().min(1).transform(toRfqId),
  takerAmount: ComboAmountToBaseUnitsSchema.transform(toBaseUnits),
  totalRequired: z.string(),
});

type AcceptComboQuoteParamsInput = z.input<typeof AcceptComboQuoteParamsSchema>;

type AcceptComboQuoteParamsFields = {
  /** RFQ identifier. */
  rfqId: string;

  /** Winning quote identifier. */
  quoteId: string;

  /** Builder code attached to the signed acceptance order. */
  builderCode: string;

  /** Trade direction of the original request. */
  direction: `${OrderSide}`;

  /** Combo YES position traded by the acceptance order. */
  positionId: string;

  /** Signed-order collateral for BUY, or position shares for SELL. */
  makerAmount: number | string;

  /** Signed-order shares for BUY, or gross collateral limit for SELL. */
  takerAmount: number | string;

  /** Exact collateral proceeds after fees for a SELL quote. */
  netReceive?: string;

  /** Blended price across legs, in collateral per outcome token. */
  blendedPrice: string;

  /** Total collateral including fees for BUY, or position shares for SELL. */
  totalRequired: string;

  /** Acceptance deadline (Unix ms). */
  expiresAt: number;
};

type AcceptComboQuoteParamsSchemaMatch =
  AcceptComboQuoteParamsFields extends AcceptComboQuoteParamsInput
    ? AcceptComboQuoteParamsInput extends AcceptComboQuoteParamsFields
      ? unknown
      : never
    : never;

/**
 * Plain JSON representation of a self-contained combo quote.
 *
 * @remarks
 * {@link ComboQuote} is assignable to this type, while quotes restored from a
 * typed transport or persistence boundary do not need to recreate the SDK's
 * branded return types. Its fields are checked against the runtime input
 * schema at compile time.
 */
export type AcceptComboQuoteParams = AcceptComboQuoteParamsInput &
  AcceptComboQuoteParamsFields &
  AcceptComboQuoteParamsSchemaMatch;

type ParsedAcceptComboQuoteParams = z.output<
  typeof AcceptComboQuoteParamsSchema
> &
  AcceptComboQuoteParamsSchemaMatch;

export type AcceptComboQuoteResult =
  | {
      status: 'executing';
      rfqId: RfqId;

      /**
       * Hash of the recorded acceptance order.
       *
       * Absent when a retry attached to an acceptance recorded by an earlier
       * attempt; the retried order was not the one recorded.
       */
      takerOrderHash?: string;
    }
  | {
      status: 'failed';
      rfqId: RfqId;
      reason: ComboAcceptFailureReason;

      /** Raw error behind the failure, when provided. */
      error?: BuilderRfqError;
    };

export type AcceptComboQuoteError =
  | CancelledSigningError
  | RateLimitError
  | RfqRequestRejectedError
  | SigningError
  | TimeoutError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const AcceptComboQuoteError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RfqRequestRejectedError,
  SigningError,
  TimeoutError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Accepts a self-contained combo quote, signing the acceptance order for the
 * authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * Resolves at the maker last-look outcome. A maker declining or the
 * acceptance window expiring is a normal outcome, returned as
 * `status: 'failed'`. `status: 'executing'` means the trade was handed off
 * for onchain execution; follow it with {@link waitForComboFill}.
 *
 * A transport failure or unrecognized acceptance response is retried once
 * automatically; this is safe because an already-accepted RFQ reports its
 * current status instead of executing twice. After such a retry
 * `takerOrderHash` is absent because the retried order was not the one
 * recorded.
 *
 * The quote is JSON-serializable and may cross process boundaries before
 * acceptance. The accepting client must represent the same account and
 * builder identity used to request it.
 * Treat the quote as signing-sensitive data: preserve its integrity across
 * process boundaries and do not accept fields modified by an untrusted client.
 *
 * @throws {@link AcceptComboQuoteError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const result = await requestComboQuote(client, {
 *   legPositionIds: ['123', '456'],
 *   direction: OrderSide.BUY,
 *   amount: 100,
 * });
 *
 * if (result.quote !== null) {
 *   const acceptance = await acceptComboQuote(client, result.quote);
 * }
 * ```
 */
export async function acceptComboQuote(
  client: BaseSecureClient,
  params: AcceptComboQuoteParams,
): Promise<AcceptComboQuoteResult> {
  const input = parseUserInput(params, AcceptComboQuoteParamsSchema);
  assertBuilderAuthorization(client);

  const domain = createExchangeV3OrderDomain({
    chainId: client.environment.chainId,
    exchange: client.environment.contracts.exchangeV3,
  });
  const order = createComboAcceptanceOrder(client, input);
  const signedOrder = await signComboAcceptanceOrder(client, domain, order);
  const request: BuilderRfqAcceptRequest = {
    quote_id: input.quoteId,
    signed_order: signedOrder,
  };

  function postAcceptance() {
    return client.builderGateway
      .post(
        `${BUILDER_RFQ_REQUESTS_PATH}/${encodeURIComponent(input.rfqId)}/accept`,
        { json: request, timeout: ACCEPT_QUOTE_TIMEOUT_MS },
      )
      .andThen(validateWith(BuilderRfqStatusResponseSchema));
  }

  let accepted = await postAcceptance();

  // Acceptance is idempotent server-side, so a single retry safely covers
  // both an interrupted request and a response that could not be validated.
  if (
    accepted.isErr() &&
    (accepted.error instanceof TransportError ||
      accepted.error instanceof UnexpectedResponseError)
  ) {
    accepted = await postAcceptance();
  }

  if (accepted.isErr()) {
    const expired = toAcceptanceExpiredResult(input.rfqId, accepted.error);

    if (expired !== undefined) {
      return expired;
    }

    throw toRfqRequestRejection(accepted.error);
  }

  let status = accepted.value;
  // Only the accept response carries the taker order hash; status polls do
  // not, so capture it before entering the poll loop.
  const takerOrderHash = accepted.value.takerOrderHash;
  const deadline = Date.now() + ACCEPT_OUTCOME_TIMEOUT_MS;

  // The gateway holds the accept through maker last look but responds with
  // AWAITING_MAKER_CONFIRMATION when the outcome is still pending after its
  // hold window; resume over the status endpoint until the outcome lands.
  while (status.status === RfqStatus.AwaitingMakerConfirmation) {
    if (Date.now() >= deadline) {
      throw new TimeoutError(
        `Timed out waiting for the acceptance outcome of RFQ ${input.rfqId}.`,
      );
    }

    await delay(ACCEPT_OUTCOME_POLL_INTERVAL_MS);
    status = await fetchRfqStatus(client, { rfqId: input.rfqId });
  }

  if (
    status.status === RfqStatus.Failed ||
    status.status === RfqStatus.Expired ||
    status.status === RfqStatus.Canceled
  ) {
    return {
      reason: toComboAcceptFailureReason(status.status, status.error?.code),
      rfqId: status.rfqId,
      status: 'failed',
      ...(status.error === undefined ? {} : { error: status.error }),
    };
  }

  return {
    rfqId: status.rfqId,
    status: 'executing',
    ...(takerOrderHash === undefined ? {} : { takerOrderHash }),
  };
}

function toAcceptanceExpiredResult(
  rfqId: RfqId,
  error: BuilderGatewayRequestError,
): AcceptComboQuoteResult | undefined {
  if (
    error instanceof RequestRejectedError &&
    error.code === RfqKnownErrorCode.ExpiredRfq
  ) {
    return {
      error: { code: RfqKnownErrorCode.ExpiredRfq, message: error.message },
      reason: ComboAcceptFailureReason.AcceptanceWindowExpired,
      rfqId,
      status: 'failed',
    };
  }

  return undefined;
}

function toComboAcceptFailureReason(
  status: RfqStatus,
  code: RfqErrorCode | undefined,
): ComboAcceptFailureReason {
  if (status === RfqStatus.Expired || code === RfqKnownErrorCode.ExpiredRfq) {
    return ComboAcceptFailureReason.AcceptanceWindowExpired;
  }

  if (code === RfqKnownErrorCode.MakerDeclined) {
    return ComboAcceptFailureReason.MakerDeclined;
  }

  return ComboAcceptFailureReason.ExecutionFailed;
}

function createComboAcceptanceOrder(
  client: BaseSecureClient,
  input: ParsedAcceptComboQuoteParams,
): Omit<RfqSignedOrder, 'signature'> {
  const identity = resolveOrderIdentity(client.account);

  return {
    builder: input.builderCode,
    maker: identity.maker,
    makerAmount: input.makerAmount,
    metadata: BYTES32_ZERO,
    salt: generateComboAcceptanceOrderSalt().toString(),
    side: encodeExchangeOrderSide(input.direction),
    signatureType: identity.signatureType,
    signer: identity.signer,
    takerAmount: input.takerAmount,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    tokenId: input.positionId,
  };
}

function generateComboAcceptanceOrderSalt(): bigint {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);

  // RFQ salts stay strings on the wire, so the full 64-bit value is lossless.
  return BigInt(
    `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
  );
}

async function signComboAcceptanceOrder(
  client: BaseSecureClient,
  domain: ExchangeOrderDomain,
  order: Omit<RfqSignedOrder, 'signature'>,
): Promise<RfqSignedOrder> {
  let signature: EvmSignature;

  try {
    signature = await client.signer.signTypedData(
      createExchangeOrderTypedDataPayload({ domain, order }),
    );
  } catch (error) {
    if (error instanceof CancelledSigningError) {
      throw error;
    }

    throw SigningError.fromError(
      error,
      'Could not sign the combo quote acceptance order.',
    );
  }

  return {
    ...order,
    signature: createExchangeOrderSignature({ domain, order, signature }),
  };
}

export type WaitForComboFillParams = {
  /** RFQ identifier of an accepted RFQ. */
  rfqId: string;

  /**
   * Give up after this long.
   *
   * @defaultValue 30_000
   */
  timeoutMs?: number;

  /** @defaultValue 1_000 */
  pollingIntervalMs?: number;
};

export type WaitForComboFillResult =
  | {
      status: RfqStatus.Filled;
      rfqId: RfqId;
      txHash: TxHash;
    }
  | {
      status: RfqStatus.Failed | RfqStatus.Expired | RfqStatus.Canceled;
      rfqId: RfqId;

      /** Raw error behind the failure, when provided. */
      error?: BuilderRfqError;
    };

const WaitForComboFillParamsSchema = z.object({
  pollingIntervalMs: z.number().int().positive().optional(),
  rfqId: z.string().min(1).transform(toRfqId),
  timeoutMs: z.number().int().positive().optional(),
});

export type WaitForComboFillError =
  | RateLimitError
  | RfqRequestRejectedError
  | TimeoutError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const WaitForComboFillError = makeErrorGuard(
  RateLimitError,
  RfqRequestRejectedError,
  TimeoutError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Waits for an accepted RFQ to reach a terminal state.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * Polls the RFQ status until it is filled (or confirmed onchain), `FAILED`,
 * `EXPIRED`, or `CANCELED`. Terminal failure is a normal outcome and is
 * returned, not thrown. A {@link TimeoutError} does not mean the trade
 * failed; resume with {@link fetchRfqStatus}.
 *
 * @throws {@link WaitForComboFillError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const fill = await waitForComboFill(client, { rfqId });
 *
 * if (fill.status === RfqStatus.Filled) {
 *   // fill.txHash: TxHash
 * }
 * ```
 */
export async function waitForComboFill(
  client: BaseSecureClient,
  params: WaitForComboFillParams,
): Promise<WaitForComboFillResult> {
  const input = parseUserInput(params, WaitForComboFillParamsSchema);
  const timeoutMs = input.timeoutMs ?? DEFAULT_FILL_TIMEOUT_MS;
  const pollingIntervalMs =
    input.pollingIntervalMs ?? DEFAULT_FILL_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const status = await fetchRfqStatus(client, { rfqId: input.rfqId });

    if (
      status.status === RfqStatus.Filled ||
      status.status === RfqExecutionStatus.Confirmed
    ) {
      if (status.txHash === undefined) {
        throw new UnexpectedResponseError(
          `RFQ ${status.rfqId} reached ${status.status} without a transaction hash.`,
        );
      }

      return {
        rfqId: status.rfqId,
        status: RfqStatus.Filled,
        txHash: status.txHash,
      };
    }

    if (
      status.status === RfqStatus.Failed ||
      status.status === RfqStatus.Expired ||
      status.status === RfqStatus.Canceled
    ) {
      return {
        rfqId: status.rfqId,
        status: status.status,
        ...(status.error === undefined ? {} : { error: status.error }),
      };
    }

    if (Date.now() >= deadline) {
      throw new TimeoutError(
        `Timed out after ${timeoutMs}ms waiting for RFQ ${input.rfqId} to reach a terminal state.`,
      );
    }

    await delay(pollingIntervalMs);
  }
}

export type FetchRfqStatusParams = {
  /** RFQ identifier of an accepted RFQ. */
  rfqId: string;
};

/**
 * Status projection for an accepted RFQ.
 *
 * @remarks
 * Onchain execution progress is merged into the top-level `status`:
 * {@link RfqExecutionStatus} values surface alongside the RFQ lifecycle.
 */
export type RfqStatusResult = BuilderRfqStatusResponse;

const FetchRfqStatusParamsSchema = z.object({
  rfqId: z.string().min(1).transform(toRfqId),
});

export type FetchRfqStatusError =
  | RateLimitError
  | RfqRequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchRfqStatusError = makeErrorGuard(
  RateLimitError,
  RfqRequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the status of an accepted RFQ.
 *
 * @remarks
 * Status is available once an acceptance has been recorded; earlier reads are
 * rejected.
 *
 * @throws {@link FetchRfqStatusError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const status = await fetchRfqStatus(client, { rfqId });
 * ```
 */
export function fetchRfqStatus(
  client: BaseSecureClient,
  params: FetchRfqStatusParams,
): Promise<RfqStatusResult> {
  const input = parseUserInput(params, FetchRfqStatusParamsSchema);

  return unwrap(
    client.builderGateway
      .get(`${BUILDER_RFQ_REQUESTS_PATH}/${encodeURIComponent(input.rfqId)}`)
      .andThen(validateWith(BuilderRfqStatusResponseSchema))
      .mapErr(toRfqRequestRejection),
  );
}

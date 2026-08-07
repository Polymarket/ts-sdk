import { z } from 'zod';
import type { SignatureType } from '../clob/signature-type';
import type {
  BuilderCode,
  ComboConditionId,
  DecimalString,
  EpochMilliseconds,
  EvmAddress,
  PositionId,
  RfqId,
  RfqQuoteId,
  TxHash,
} from '../shared';
import {
  BuilderCodeSchema,
  ComboConditionIdSchema,
  E6BigIntStringToDecimalStringSchema,
  EpochMillisecondsSchema,
  PositionIdSchema,
  RfqIdSchema,
  RfqQuoteIdSchema,
  TxHashSchema,
} from '../shared';
import {
  type RfqDirection,
  type RfqErrorCode,
  RfqExecutionStatus,
  type RfqRequestedSizeUnit,
  type RfqSide,
  type RfqSignedOrder,
} from './rfq';

/** Lifecycle status of an RFQ. */
export enum RfqStatus {
  AwaitingRequesterAcceptance = 'AWAITING_REQUESTER_ACCEPTANCE',
  AwaitingMakerConfirmation = 'AWAITING_MAKER_CONFIRMATION',
  Executing = 'EXECUTING',
  Filled = 'FILLED',
  Failed = 'FAILED',
  Expired = 'EXPIRED',
  Canceled = 'CANCELED',
}

/**
 * Machine-readable reason an RFQ request or acceptance was rejected.
 *
 * @remarks
 * Codes not enumerated in this SDK release are classified as
 * {@link RfqRejectionCode.InvalidRfq} with the original error preserved on
 * `cause`.
 */
export enum RfqRejectionCode {
  /** The request body could not be decoded as JSON. */
  InvalidJson = 'INVALID_JSON',
  /** The request message is malformed. */
  InvalidMessage = 'INVALID_MESSAGE',
  /** The authenticated role is not valid for this request. */
  InvalidRole = 'INVALID_ROLE',
  /** The authenticated role is not authorized for this request. */
  UnauthorizedRole = 'UNAUTHORIZED_ROLE',
  /** Authentication credentials are missing or invalid. */
  Unauthenticated = 'UNAUTHENTICATED',
  /** The authenticated address does not match the request. */
  AddressMismatch = 'ADDRESS_MISMATCH',
  /** The request is malformed or references invalid legs. */
  InvalidRfq = 'INVALID_RFQ',
  /** The legs are mutually exclusive (e.g. YES and NO on the same market). */
  ContradictoryLegs = 'CONTRADICTORY_LEGS',
  /** Leg metadata is temporarily unavailable; the request may be retried. */
  LegMetadataUnavailable = 'LEG_METADATA_UNAVAILABLE',
  /** The acceptance is invalid (unknown RFQ, wrong state, quote/builder mismatch). */
  InvalidAcceptance = 'INVALID_ACCEPTANCE',
  /** The referenced quote is invalid or no longer available. */
  InvalidQuote = 'INVALID_QUOTE',
  /** The order signature failed verification. */
  InvalidSignature = 'INVALID_SIGNATURE',
  /** The request identity is invalid. */
  InvalidIdentity = 'INVALID_IDENTITY',
  /** The RFQ does not exist for the authenticated requester. */
  UnknownRfq = 'UNKNOWN_RFQ',
  /** The RFQ acceptance window has expired. */
  ExpiredRfq = 'EXPIRED_RFQ',
  /** The RFQ is not in a state that permits this operation. */
  InvalidRfqState = 'INVALID_RFQ_STATE',
  /** The quote does not match the RFQ being accepted. */
  QuoteMismatch = 'QUOTE_MISMATCH',
  /** The submission window is closed. */
  SubmissionWindowClosed = 'SUBMISSION_WINDOW_CLOSED',
  /** A required service is temporarily unavailable. */
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
  /** Balance reservation failed before execution. */
  PreExecutionBalanceReservationFailed = 'PRE_EXECUTION_BALANCE_RESERVATION_FAILED',
  /** The requester does not have sufficient balance. */
  BalanceValidationFailed = 'BALANCE_VALIDATION_FAILED',
  /** The requester does not have sufficient allowance. */
  AllowanceValidationFailed = 'ALLOWANCE_VALIDATION_FAILED',
  /** The accepted trade could not be submitted for execution. */
  TradeSubmissionFailed = 'TRADE_SUBMISSION_FAILED',
  /** The request failed without a more specific classification. */
  RequestFailed = 'REQUEST_FAILED',
}

/** Reason no quote was returned for a combo quote request. */
export enum ComboQuoteUnavailableReason {
  NoQuotes = 'NO_QUOTES',
  SizeTooLarge = 'SIZE_TOO_LARGE',
}

/** Reason an accepted combo quote did not proceed to a fill. */
export enum ComboAcceptFailureReason {
  MakerDeclined = 'MAKER_DECLINED',
  AcceptanceWindowExpired = 'ACCEPTANCE_WINDOW_EXPIRED',
  /** The trade failed before or during onchain execution handoff. */
  ExecutionFailed = 'EXECUTION_FAILED',
}

export type BuilderRfqRequestedSize = {
  unit: RfqRequestedSizeUnit;
  value_e6: string;
};

export type BuilderRfqCreateRequest = {
  signer_address: EvmAddress;
  maker_address: EvmAddress;
  signature_type: SignatureType;
  leg_position_ids: string[];
  direction: RfqDirection;
  side: RfqSide;
  requested_size: BuilderRfqRequestedSize;
};

export type BuilderRfqAcceptRequest = {
  quote_id: string;
  signed_order: RfqSignedOrder;
};

/** Structured error carried inside combo RFQ responses. */
export type BuilderRfqError = {
  code: RfqErrorCode;
  message: string;
};

// Error codes evolve independently of released clients. Codes not yet
// enumerated in RfqKnownErrorCode must still parse and flow through as-is.
const BuilderRfqErrorSchema = z
  .object({
    code: z.string().transform((value): RfqErrorCode => value),
    message: z.string(),
  })
  .transform(
    (error): BuilderRfqError => ({
      code: error.code,
      message: error.message,
    }),
  );

/** The winning quote for an RFQ. */
export type BuilderRfqQuote = {
  quoteId: RfqQuoteId;
  /** Blended price across legs, in collateral per outcome token. */
  blendedPrice: DecimalString;
  /** Maker amount of the requester's acceptance order. */
  makerAmount: DecimalString;
  /** Taker amount of the requester's acceptance order. */
  takerAmount: DecimalString;
  /** Total collateral (BUY) or position-share (SELL) balance required to accept. */
  totalRequired: DecimalString;
};

const BuilderRfqQuoteSchema = z
  .object({
    quote_id: RfqQuoteIdSchema,
    blended_price_e6: E6BigIntStringToDecimalStringSchema,
    maker_amount_e6: E6BigIntStringToDecimalStringSchema,
    taker_amount_e6: E6BigIntStringToDecimalStringSchema,
    total_required_e6: E6BigIntStringToDecimalStringSchema,
  })
  .transform(
    (quote): BuilderRfqQuote => ({
      blendedPrice: quote.blended_price_e6,
      makerAmount: quote.maker_amount_e6,
      quoteId: quote.quote_id,
      takerAmount: quote.taker_amount_e6,
      totalRequired: quote.total_required_e6,
    }),
  );

export type BuilderRfqQuoteReadyResponse = {
  rfqId: RfqId;
  status: RfqStatus.AwaitingRequesterAcceptance;
  /** Acceptance deadline (Unix ms). */
  expiresAt: EpochMilliseconds;
  builderCode: BuilderCode;
  conditionId: ComboConditionId;
  yesPositionId: PositionId;
  noPositionId: PositionId;
  quote: BuilderRfqQuote;
};

const BuilderRfqQuoteReadyResponseSchema = z
  .object({
    rfq_id: RfqIdSchema,
    status: z.literal(RfqStatus.AwaitingRequesterAcceptance),
    expires_at: EpochMillisecondsSchema,
    builder_code: BuilderCodeSchema,
    request: z.object({
      condition_id: ComboConditionIdSchema,
      yes_position_id: PositionIdSchema,
      no_position_id: PositionIdSchema,
    }),
    quote: BuilderRfqQuoteSchema,
  })
  .transform(
    (response): BuilderRfqQuoteReadyResponse => ({
      builderCode: response.builder_code,
      conditionId: response.request.condition_id,
      expiresAt: response.expires_at,
      noPositionId: response.request.no_position_id,
      quote: response.quote,
      rfqId: response.rfq_id,
      status: response.status,
      yesPositionId: response.request.yes_position_id,
    }),
  );

export type BuilderRfqFinalStateResponse = {
  rfqId: RfqId;
  status: RfqStatus.Failed | RfqStatus.Expired | RfqStatus.Canceled;
  error?: BuilderRfqError;
};

const BuilderRfqFinalStateResponseSchema = z
  .object({
    rfq_id: RfqIdSchema,
    status: z.enum([RfqStatus.Failed, RfqStatus.Expired, RfqStatus.Canceled]),
    error: BuilderRfqErrorSchema.optional(),
  })
  .transform(
    (response): BuilderRfqFinalStateResponse => ({
      rfqId: response.rfq_id,
      status: response.status,
      ...(response.error === undefined ? {} : { error: response.error }),
    }),
  );

export const BuilderRfqCreateResponseSchema = z.union([
  BuilderRfqQuoteReadyResponseSchema,
  BuilderRfqFinalStateResponseSchema,
]);

export type BuilderRfqCreateResponse =
  | BuilderRfqQuoteReadyResponse
  | BuilderRfqFinalStateResponse;

/**
 * Status projection returned on accept responses and post-acceptance status
 * reads.
 *
 * @remarks
 * Onchain execution progress is merged into the top-level `status`:
 * {@link RfqExecutionStatus} values surface alongside the RFQ lifecycle
 * (`MATCHED` is reported as {@link RfqStatus.Executing}).
 */
export type BuilderRfqStatusResponse = {
  rfqId: RfqId;
  status: RfqStatus | RfqExecutionStatus;
  takerOrderHash?: string;
  txHash?: TxHash;
  error?: BuilderRfqError;
};

export const BuilderRfqStatusResponseSchema = z
  .object({
    rfq_id: RfqIdSchema,
    status: z.union([z.enum(RfqStatus), z.enum(RfqExecutionStatus)]),
    taker_order_hash: z.string().optional(),
    tx_hash: TxHashSchema.optional(),
    error: BuilderRfqErrorSchema.optional(),
  })
  .transform(
    (response): BuilderRfqStatusResponse => ({
      rfqId: response.rfq_id,
      status: response.status,
      ...(response.taker_order_hash === undefined
        ? {}
        : { takerOrderHash: response.taker_order_hash }),
      ...(response.tx_hash === undefined ? {} : { txHash: response.tx_hash }),
      ...(response.error === undefined ? {} : { error: response.error }),
    }),
  );

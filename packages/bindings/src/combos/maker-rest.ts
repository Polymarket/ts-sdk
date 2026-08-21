import { z } from 'zod';
import type { SignatureType } from '../clob/signature-type';
import type {
  ComboConditionId,
  DecimalString,
  EpochMilliseconds,
  EvmAddress,
  PositionId,
  RfqId,
  RfqQuoteId,
} from '../shared';
import {
  ComboConditionIdSchema,
  E6BigIntStringToDecimalStringSchema,
  EpochMillisecondsSchema,
  EvmAddressSchema,
  PositionIdSchema,
  RfqIdSchema,
  RfqQuoteIdSchema,
} from '../shared';
import {
  RfqConfirmationDecision,
  RfqDirection,
  type RfqRequestedSize,
  RfqRequestedSizeUnit,
  type RfqSignedOrder,
} from './rfq';

/**
 * Lifecycle status of an RFQ as reported by the maker quote endpoints.
 *
 * Strict on purpose: an unknown status is a contract change the SDK must
 * fail loudly on, unlike error codes which evolve independently.
 */
export enum MakerRfqStatus {
  Created = 'CREATED',
  CollectingQuotes = 'COLLECTING_QUOTES',
  AwaitingRequesterAcceptance = 'AWAITING_REQUESTER_ACCEPTANCE',
  AwaitingMakerConfirmation = 'AWAITING_MAKER_CONFIRMATION',
  Executing = 'EXECUTING',
  Filled = 'FILLED',
  Failed = 'FAILED',
  Expired = 'EXPIRED',
  Canceled = 'CANCELED',
  Rejected = 'REJECTED',
}

const MakerRfqStatusSchema = z.enum(MakerRfqStatus);

export type MakerRfqRequest = {
  rfqId: RfqId;
  direction: RfqDirection;
  legPositionIds: PositionId[];
  conditionId?: ComboConditionId;
  yesPositionId?: PositionId;
  noPositionId?: PositionId;
  requestedSize?: RfqRequestedSize;
  /** Whether the requested size already includes taker fees. */
  sizeIncludesFees?: boolean;
  createdAt?: EpochMilliseconds;
};

const RequestedSizeSchema = z
  .discriminatedUnion('unit', [
    z.object({
      unit: z.literal(RfqRequestedSizeUnit.Notional),
      value_e6: E6BigIntStringToDecimalStringSchema,
    }),
    z.object({
      unit: z.literal(RfqRequestedSizeUnit.Shares),
      value_e6: E6BigIntStringToDecimalStringSchema,
    }),
  ])
  .transform(
    (size): RfqRequestedSize => ({
      unit: size.unit,
      value: size.value_e6,
    }),
  );

const MakerRfqRequestSchema = z
  .object({
    rfq_id: RfqIdSchema,
    direction: z.enum(RfqDirection),
    leg_position_ids: z.array(PositionIdSchema),
    condition_id: ComboConditionIdSchema.optional(),
    yes_position_id: PositionIdSchema.optional(),
    no_position_id: PositionIdSchema.optional(),
    requested_size: RequestedSizeSchema.optional(),
    size_includes_fees: z.boolean().optional(),
    created_at: EpochMillisecondsSchema.optional(),
  })
  .transform(
    (request): MakerRfqRequest => ({
      direction: request.direction,
      legPositionIds: request.leg_position_ids,
      rfqId: request.rfq_id,
      ...(request.condition_id === undefined
        ? {}
        : { conditionId: request.condition_id }),
      ...(request.yes_position_id === undefined
        ? {}
        : { yesPositionId: request.yes_position_id }),
      ...(request.no_position_id === undefined
        ? {}
        : { noPositionId: request.no_position_id }),
      ...(request.requested_size === undefined
        ? {}
        : { requestedSize: request.requested_size }),
      ...(request.size_includes_fees === undefined
        ? {}
        : { sizeIncludesFees: request.size_includes_fees }),
      ...(request.created_at === undefined
        ? {}
        : { createdAt: request.created_at }),
    }),
  );

export type MakerFillAllocation = {
  makerQuoteId: RfqQuoteId;
  signerAddress: EvmAddress;
  makerAddress: EvmAddress;
  /** Accepted fill size in outcome shares. Can be below the quoted size. */
  size: DecimalString;
  price: DecimalString;
  receivedAt?: EpochMilliseconds;
};

const MakerFillAllocationSchema = z
  .object({
    maker_quote_id: RfqQuoteIdSchema,
    signer_address: EvmAddressSchema,
    maker_address: EvmAddressSchema,
    size_e6: E6BigIntStringToDecimalStringSchema,
    price_e6: E6BigIntStringToDecimalStringSchema,
    received_at: EpochMillisecondsSchema.optional(),
  })
  .transform(
    (allocation): MakerFillAllocation => ({
      makerAddress: allocation.maker_address,
      makerQuoteId: allocation.maker_quote_id,
      price: allocation.price_e6,
      signerAddress: allocation.signer_address,
      size: allocation.size_e6,
      ...(allocation.received_at === undefined
        ? {}
        : { receivedAt: allocation.received_at }),
    }),
  );

export type MakerFillBundle = {
  requestedShares: DecimalString;
  blendedPrice: DecimalString;
  requestedNotional?: DecimalString;
  /** Total collateral the requester must hold to accept, fees included. */
  totalRequired?: DecimalString;
  /** Exact collateral proceeds after fees. Present only for SELL requests. */
  netReceive?: DecimalString;
  allocations: MakerFillAllocation[];
};

const MakerFillBundleSchema = z
  .object({
    requested_shares_e6: E6BigIntStringToDecimalStringSchema,
    blended_price_e6: E6BigIntStringToDecimalStringSchema,
    requested_notional_e6: E6BigIntStringToDecimalStringSchema.optional(),
    total_required_e6: E6BigIntStringToDecimalStringSchema.optional(),
    net_receive_e6: E6BigIntStringToDecimalStringSchema.optional(),
    allocations: z.array(MakerFillAllocationSchema).nullish(),
  })
  .transform(
    (bundle): MakerFillBundle => ({
      allocations: bundle.allocations ?? [],
      blendedPrice: bundle.blended_price_e6,
      requestedShares: bundle.requested_shares_e6,
      ...(bundle.requested_notional_e6 === undefined
        ? {}
        : { requestedNotional: bundle.requested_notional_e6 }),
      ...(bundle.total_required_e6 === undefined
        ? {}
        : { totalRequired: bundle.total_required_e6 }),
      ...(bundle.net_receive_e6 === undefined
        ? {}
        : { netReceive: bundle.net_receive_e6 }),
    }),
  );

export type MakerConfirmationEntry = {
  quoteId: RfqQuoteId;
  signerAddress: EvmAddress;
  makerAddress: EvmAddress;
  /**
   * Absent while the maker has not responded. `TIMED_OUT` is assigned by the
   * server when the confirmation window lapses; it is never a valid input.
   */
  decision?: RfqConfirmationDecision | 'TIMED_OUT';
  reason?: string;
  respondedAt?: EpochMilliseconds;
};

const MakerConfirmationEntrySchema = z
  .object({
    quote_id: RfqQuoteIdSchema,
    signer_address: EvmAddressSchema,
    maker_address: EvmAddressSchema,
    decision: z
      .union([z.enum(RfqConfirmationDecision), z.literal('TIMED_OUT')])
      .optional(),
    reason: z.string().optional(),
    responded_at: EpochMillisecondsSchema.optional(),
  })
  .transform(
    (entry): MakerConfirmationEntry => ({
      makerAddress: entry.maker_address,
      quoteId: entry.quote_id,
      signerAddress: entry.signer_address,
      ...(entry.decision === undefined ? {} : { decision: entry.decision }),
      ...(entry.reason === undefined ? {} : { reason: entry.reason }),
      ...(entry.responded_at === undefined
        ? {}
        : { respondedAt: entry.responded_at }),
    }),
  );

export type MakerRfqSnapshot = {
  request: MakerRfqRequest;
  status: MakerRfqStatus;
  competitionStartedAt?: EpochMilliseconds;
  competitionEndsAt?: EpochMilliseconds;
  confirmationStartedAt?: EpochMilliseconds;
  confirmationEndsAt?: EpochMilliseconds;
  bundle?: MakerFillBundle;
  makerConfirmations?: MakerConfirmationEntry[];
};

/**
 * The engine snapshot returned by the maker quote submit and cancel
 * endpoints.
 *
 * The wire body also carries a top-level `quote_id`, which is a bundle-level
 * legacy field rather than the submitted quote's identifier; it is
 * deliberately not modeled so callers key on the id they generated.
 */
export const MakerRfqSnapshotSchema = z
  .object({
    request: MakerRfqRequestSchema,
    status: MakerRfqStatusSchema,
    competition_started_at: EpochMillisecondsSchema.optional(),
    competition_ends_at: EpochMillisecondsSchema.optional(),
    confirmation_started_at: EpochMillisecondsSchema.optional(),
    confirmation_ends_at: EpochMillisecondsSchema.optional(),
    bundle: MakerFillBundleSchema.optional(),
    maker_confirmations: z.array(MakerConfirmationEntrySchema).nullish(),
  })
  .transform(
    (snapshot): MakerRfqSnapshot => ({
      request: snapshot.request,
      status: snapshot.status,
      ...(snapshot.competition_started_at === undefined
        ? {}
        : { competitionStartedAt: snapshot.competition_started_at }),
      ...(snapshot.competition_ends_at === undefined
        ? {}
        : { competitionEndsAt: snapshot.competition_ends_at }),
      ...(snapshot.confirmation_started_at === undefined
        ? {}
        : { confirmationStartedAt: snapshot.confirmation_started_at }),
      ...(snapshot.confirmation_ends_at === undefined
        ? {}
        : { confirmationEndsAt: snapshot.confirmation_ends_at }),
      ...(snapshot.bundle === undefined ? {} : { bundle: snapshot.bundle }),
      ...(snapshot.maker_confirmations == null
        ? {}
        : { makerConfirmations: snapshot.maker_confirmations }),
    }),
  );

export type MakerExecutionHandoff = {
  executionId: string;
  quoteId: RfqQuoteId;
  bundle: MakerFillBundle;
  readyAt?: EpochMilliseconds;
};

/**
 * Execution handoff returned to the final confirming maker.
 *
 * The wire body additionally carries the raw request, the requester's
 * acceptance, every maker's signed quote order, and wallet reservations;
 * those are deliberately not modeled — they are engine-internal detail, and
 * exposing other makers' signed orders would invite coupling the SDK should
 * not encourage.
 */
export const MakerExecutionHandoffSchema = z
  .object({
    execution_id: z.string(),
    quote_id: RfqQuoteIdSchema,
    bundle: MakerFillBundleSchema,
    ready_at: EpochMillisecondsSchema.optional(),
  })
  .transform(
    (handoff): MakerExecutionHandoff => ({
      bundle: handoff.bundle,
      executionId: handoff.execution_id,
      quoteId: handoff.quote_id,
      ...(handoff.ready_at === undefined ? {} : { readyAt: handoff.ready_at }),
    }),
  );

export type MakerConfirmationResult = {
  /** Present on a non-final CONFIRM and on DECLINE (the failed RFQ). */
  snapshot?: MakerRfqSnapshot;
  /** Present only when this confirmation completed the bundle. */
  execution?: MakerExecutionHandoff;
};

export const MakerConfirmationResultSchema = z
  .object({
    snapshot: MakerRfqSnapshotSchema.optional(),
    execution: MakerExecutionHandoffSchema.optional(),
  })
  .transform(
    (result): MakerConfirmationResult => ({
      ...(result.snapshot === undefined ? {} : { snapshot: result.snapshot }),
      ...(result.execution === undefined
        ? {}
        : { execution: result.execution }),
    }),
  );

/** Wire body for `POST /v1/maker/quotes`. Constructed by the SDK. */
export type MakerQuoteSubmitRequest = {
  quote_id: string;
  rfq_id: RfqId;
  signer_address: EvmAddress;
  maker_address: EvmAddress;
  signature_type: SignatureType;
  price_e6: string;
  size_e6: string;
  valid_until?: number;
  signed_order: RfqSignedOrder;
};

/** Wire body for `POST /v1/maker/quotes/cancel`. Constructed by the SDK. */
export type MakerQuoteCancelRequest = {
  rfq_id: RfqId;
  quote_id: RfqQuoteId;
  signer_address: EvmAddress;
  maker_address: EvmAddress;
  signature_type: SignatureType;
};

/** Wire body for `POST /v1/maker/confirmations`. Constructed by the SDK. */
export type MakerConfirmationRequest = {
  rfq_id: RfqId;
  quote_id: RfqQuoteId;
  signer_address: EvmAddress;
  maker_address: EvmAddress;
  signature_type: SignatureType;
  decision: RfqConfirmationDecision;
};

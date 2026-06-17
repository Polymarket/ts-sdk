import type {
  Erc1271Signature,
  EvmSignature,
  HexString,
} from '@polymarket/types';
import { z } from 'zod';
import { type SignatureType, SignatureTypeSchema } from './clob/signature-type';
import type {
  BaseUnits,
  CtfConditionId,
  DecimalString,
  EvmAddress,
  MarketId,
  TokenId,
} from './shared';
import {
  ComboConditionIdSchema,
  CtfConditionIdSchema,
  DecimalStringSchema,
  E6BigIntStringToDecimalStringSchema,
  EpochMillisecondsSchema,
  EvmAddressSchema,
  MarketIdSchema,
  type OrderSide,
  PaginationCursorSchema,
  type PositionId,
  PositionIdSchema,
  type RfqId,
  RfqIdSchema,
  type RfqQuoteId,
  RfqQuoteIdSchema,
  RfqRequestorPublicIdSchema,
  TxHashSchema,
} from './shared';

export type {
  RfqId,
  RfqQuoteId,
  RfqRequestorPublicId,
} from './shared';

export enum RfqDirection {
  Buy = 'BUY',
  Sell = 'SELL',
}

export enum RfqSide {
  Yes = 'YES',
  No = 'NO',
}

export enum RfqConfirmationDecision {
  Confirm = 'CONFIRM',
  Decline = 'DECLINE',
}

export enum RfqExecutionStatus {
  Matched = 'MATCHED',
  Mined = 'MINED',
  Confirmed = 'CONFIRMED',
  Retrying = 'RETRYING',
  Failed = 'FAILED',
}

export enum RfqRequestedSizeUnit {
  Notional = 'notional',
  Shares = 'shares',
}

export enum RfqErrorCode {
  AddressMismatch = 'ADDRESS_MISMATCH',
  AllowanceValidationFailed = 'ALLOWANCE_VALIDATION_FAILED',
  BalanceValidationFailed = 'BALANCE_VALIDATION_FAILED',
  ContradictoryLegs = 'CONTRADICTORY_LEGS',
  ExpiredRfq = 'EXPIRED_RFQ',
  InvalidAcceptance = 'INVALID_ACCEPTANCE',
  InvalidConfirmation = 'INVALID_CONFIRMATION',
  InvalidExecutionResult = 'INVALID_EXECUTION_RESULT',
  InvalidIdentity = 'INVALID_IDENTITY',
  InvalidMessage = 'INVALID_MESSAGE',
  InvalidQuote = 'INVALID_QUOTE',
  InvalidRfq = 'INVALID_RFQ',
  InvalidRfqState = 'INVALID_RFQ_STATE',
  InvalidRole = 'INVALID_ROLE',
  LegMetadataUnavailable = 'LEG_METADATA_UNAVAILABLE',
  MakerAlreadyResponded = 'MAKER_ALREADY_RESPONDED',
  MakerNotRequired = 'MAKER_NOT_REQUIRED',
  PreExecutionBalanceReservationFailed = 'PRE_EXECUTION_BALANCE_RESERVATION_FAILED',
  QuoteMismatch = 'QUOTE_MISMATCH',
  QuoteUnavailable = 'QUOTE_UNAVAILABLE',
  RateLimited = 'RATE_LIMITED',
  RequestFailed = 'REQUEST_FAILED',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
  SubmissionWindowClosed = 'SUBMISSION_WINDOW_CLOSED',
  TradeSubmissionFailed = 'TRADE_SUBMISSION_FAILED',
  Unauthenticated = 'UNAUTHENTICATED',
  UnauthorizedRole = 'UNAUTHORIZED_ROLE',
  UnknownRfq = 'UNKNOWN_RFQ',
}

export const RfqDirectionSchema = z.enum(RfqDirection);
export const RfqSideSchema = z.literal(RfqSide.Yes);
export const RfqConfirmationDecisionSchema = z.enum(RfqConfirmationDecision);
export const RfqExecutionStatusSchema = z.enum(RfqExecutionStatus);
export const RfqRequestedSizeUnitSchema = z.enum(RfqRequestedSizeUnit);
export const RfqErrorCodeSchema = z.enum(RfqErrorCode);

export type ComboMarket = {
  id: MarketId;
  conditionId: CtfConditionId;
  slug: string;
  title: string;
  outcomes: ComboMarketOutcomes;
  image: string;
  volume: number;
  tags: string[];
};

export type ComboMarketOutcome = {
  label: string;
  positionId: PositionId;
  price: DecimalString;
};

export type ComboMarketOutcomes = {
  yes: ComboMarketOutcome;
  no: ComboMarketOutcome;
};

export const ComboMarketSchema = z
  .object({
    id: MarketIdSchema,
    condition_id: CtfConditionIdSchema,
    position_ids: z.array(PositionIdSchema),
    slug: z.string(),
    title: z.string(),
    outcomes: z.array(z.string()),
    outcome_prices: z.array(DecimalStringSchema),
    image: z.string(),
    volume: z.number(),
    tags: z.array(z.string()),
  })
  .superRefine((market, context) => {
    if (market.outcomes.length !== 2) {
      context.addIssue({
        code: 'custom',
        message: `Expected binary combo market outcomes, received ${market.outcomes.length}.`,
        path: ['outcomes'],
      });
    }

    if (market.position_ids.length !== market.outcomes.length) {
      context.addIssue({
        code: 'custom',
        message: 'Expected position_ids and outcomes to have matching lengths.',
        path: ['position_ids'],
      });
    }

    if (market.outcome_prices.length !== market.outcomes.length) {
      context.addIssue({
        code: 'custom',
        message:
          'Expected outcome_prices and outcomes to have matching lengths.',
        path: ['outcome_prices'],
      });
    }
  })
  .transform(
    (market): ComboMarket => ({
      conditionId: market.condition_id,
      id: market.id,
      image: market.image,
      outcomes: {
        yes: {
          label: market.outcomes[0] as string,
          positionId: market.position_ids[0] as PositionId,
          price: market.outcome_prices[0] as DecimalString,
        },
        no: {
          label: market.outcomes[1] as string,
          positionId: market.position_ids[1] as PositionId,
          price: market.outcome_prices[1] as DecimalString,
        },
      },
      slug: market.slug,
      tags: market.tags,
      title: market.title,
      volume: market.volume,
    }),
  );

export const ListComboMarketsResponseSchema = z
  .object({
    markets: z.array(ComboMarketSchema),
    next_cursor: PaginationCursorSchema.nullish(),
  })
  .transform((response) => ({
    markets: response.markets,
    nextCursor: response.next_cursor ?? undefined,
  }));

export type ListComboMarketsResponse = z.infer<
  typeof ListComboMarketsResponseSchema
>;

export type RfqRequestedSize =
  | {
      unit: RfqRequestedSizeUnit.Notional;
      value: DecimalString;
    }
  | {
      unit: RfqRequestedSizeUnit.Shares;
      value: DecimalString;
    };

const RfqRequestedSizeSchema = z
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
  ) satisfies z.ZodType<RfqRequestedSize>;

export type RfqSignedOrder = {
  salt: string;
  maker: EvmAddress;
  signer: EvmAddress;
  tokenId: PositionId | TokenId;
  makerAmount: BaseUnits;
  takerAmount: BaseUnits;
  side: RfqOrderSide;
  signatureType: SignatureType;
  timestamp: string;
  builder?: HexString;
  expiration?: string;
  metadata?: HexString;
  signature: EvmSignature | Erc1271Signature;
};

export type RfqOrderSide = OrderSide | 0 | 1;

export type RfqAuthMessage = {
  type: 'auth';
  auth: {
    apiKey: string;
    passphrase: string;
    secret: string;
  };
  identity: {
    signer_address: EvmAddress;
    maker_address: EvmAddress;
    signature_type: SignatureType;
  };
};

export enum RfqKnownInboundType {
  Auth = 'auth',
  QuoteRequest = 'RFQ_REQUEST',
  QuoteAck = 'ACK_RFQ_QUOTE',
  QuoteCancelAck = 'ACK_RFQ_QUOTE_CANCEL',
  ConfirmationRequest = 'RFQ_CONFIRMATION_REQUEST',
  ConfirmationAck = 'ACK_RFQ_CONFIRMATION_RESPONSE',
  ExecutionUpdate = 'RFQ_EXECUTION_UPDATE',
  Trade = 'RFQ_TRADE',
  Error = 'RFQ_ERROR',
}

export const RfqKnownInboundMessageSchema = z.object({
  type: z.enum(RfqKnownInboundType),
});

export const RfqAuthResponseMessageSchema = RfqKnownInboundMessageSchema.extend(
  {
    type: z.literal(RfqKnownInboundType.Auth),
    success: z.boolean(),
    address: EvmAddressSchema.optional(),
    role: z.string().optional(),
    error: z.string().optional(),
  },
);

export type RfqAuthResponseMessage = z.infer<
  typeof RfqAuthResponseMessageSchema
>;

export const RfqQuoteRequestSchema = RfqKnownInboundMessageSchema.extend({
  type: z.literal(RfqKnownInboundType.QuoteRequest),
  rfq_id: RfqIdSchema,
  requestor_public_id: RfqRequestorPublicIdSchema,
  leg_position_ids: z.array(PositionIdSchema),
  condition_id: ComboConditionIdSchema,
  yes_position_id: PositionIdSchema,
  no_position_id: PositionIdSchema,
  direction: RfqDirectionSchema,
  side: RfqSideSchema,
  requested_size: RfqRequestedSizeSchema,
  submission_deadline: EpochMillisecondsSchema,
}).transform((message) => ({
  conditionId: message.condition_id,
  direction: message.direction,
  legPositionIds: message.leg_position_ids,
  noPositionId: message.no_position_id,
  requestorPublicId: message.requestor_public_id,
  requestedSize: message.requested_size,
  rfqId: message.rfq_id,
  side: message.side,
  submissionDeadline: message.submission_deadline,
  type: 'quote_request' as const,
  yesPositionId: message.yes_position_id,
}));

export type RfqQuoteRequest = z.infer<typeof RfqQuoteRequestSchema>;

export type RfqQuoteMessage = {
  type: 'RFQ_QUOTE';
  rfq_id: RfqId;
  price_e6: string;
  size_e6: string;
  signed_order: RfqSignedOrder;
};

export type RfqQuoteCancelMessage = {
  type: 'RFQ_QUOTE_CANCEL';
  rfq_id: RfqId;
  quote_id: RfqQuoteId;
  signer_address: EvmAddress;
  maker_address: EvmAddress;
};

export const RfqQuoteAckSchema = RfqKnownInboundMessageSchema.extend({
  type: z.literal(RfqKnownInboundType.QuoteAck),
  rfq_id: RfqIdSchema,
  quote_id: RfqQuoteIdSchema,
}).transform((message) => ({
  quoteId: message.quote_id,
  rfqId: message.rfq_id,
  type: 'quote_ack' as const,
}));

export type RfqQuoteAck = z.infer<typeof RfqQuoteAckSchema>;

export const RfqQuoteCancelAckSchema = RfqKnownInboundMessageSchema.extend({
  type: z.literal(RfqKnownInboundType.QuoteCancelAck),
  rfq_id: RfqIdSchema,
  quote_id: RfqQuoteIdSchema,
}).transform((message) => ({
  quoteId: message.quote_id,
  rfqId: message.rfq_id,
  type: 'quote_cancel_ack' as const,
}));

export type RfqQuoteCancelAck = z.infer<typeof RfqQuoteCancelAckSchema>;

export const RfqConfirmationRequestSchema = RfqKnownInboundMessageSchema.extend(
  {
    type: z.literal(RfqKnownInboundType.ConfirmationRequest),
    rfq_id: RfqIdSchema,
    quote_id: RfqQuoteIdSchema,
    signer_address: EvmAddressSchema,
    maker_address: EvmAddressSchema,
    signature_type: SignatureTypeSchema,
    leg_position_ids: z.array(PositionIdSchema),
    condition_id: ComboConditionIdSchema,
    yes_position_id: PositionIdSchema,
    no_position_id: PositionIdSchema,
    direction: RfqDirectionSchema,
    side: RfqSideSchema,
    fill_size_e6: E6BigIntStringToDecimalStringSchema,
    price_e6: E6BigIntStringToDecimalStringSchema,
    confirm_by: EpochMillisecondsSchema,
  },
).transform((message) => ({
  conditionId: message.condition_id,
  confirmBy: message.confirm_by,
  direction: message.direction,
  fillSize: message.fill_size_e6,
  legPositionIds: message.leg_position_ids,
  makerAddress: message.maker_address,
  noPositionId: message.no_position_id,
  price: message.price_e6,
  quoteId: message.quote_id,
  rfqId: message.rfq_id,
  side: message.side,
  signatureType: message.signature_type,
  signerAddress: message.signer_address,
  type: 'confirmation_request' as const,
  yesPositionId: message.yes_position_id,
}));

export type RfqConfirmationRequest = z.infer<
  typeof RfqConfirmationRequestSchema
>;

export type RfqConfirmationResponseMessage = {
  type: 'RFQ_CONFIRMATION_RESPONSE';
  rfq_id: RfqId;
  quote_id: RfqQuoteId;
  decision: RfqConfirmationDecision;
};

export const RfqConfirmationAckSchema = RfqKnownInboundMessageSchema.extend({
  type: z.literal(RfqKnownInboundType.ConfirmationAck),
  rfq_id: RfqIdSchema,
  quote_id: RfqQuoteIdSchema,
  decision: RfqConfirmationDecisionSchema,
}).transform((message) => ({
  decision: message.decision,
  quoteId: message.quote_id,
  rfqId: message.rfq_id,
  type: 'confirmation_ack' as const,
}));

export type RfqConfirmationAck = z.infer<typeof RfqConfirmationAckSchema>;

export const RfqExecutionUpdateSchema = RfqKnownInboundMessageSchema.extend({
  type: z.literal(RfqKnownInboundType.ExecutionUpdate),
  rfq_id: RfqIdSchema,
  status: RfqExecutionStatusSchema,
  tx_hash: TxHashSchema.optional(),
}).transform((message) => ({
  rfqId: message.rfq_id,
  status: message.status,
  ...(message.tx_hash === undefined ? {} : { txHash: message.tx_hash }),
  type: 'execution_update' as const,
}));

export type RfqExecutionUpdate = z.infer<typeof RfqExecutionUpdateSchema>;

export const RfqTradeSchema = RfqKnownInboundMessageSchema.extend({
  type: z.literal(RfqKnownInboundType.Trade),
  rfq_id: RfqIdSchema,
  requestor_public_id: RfqRequestorPublicIdSchema,
  condition_id: ComboConditionIdSchema,
  leg_position_ids: z.array(PositionIdSchema),
  direction: RfqDirectionSchema,
  side: RfqSideSchema,
  price_e6: E6BigIntStringToDecimalStringSchema,
  size_e6: E6BigIntStringToDecimalStringSchema,
  tx_hash: TxHashSchema,
  executed_at: EpochMillisecondsSchema,
}).transform((message) => ({
  conditionId: message.condition_id,
  direction: message.direction,
  executedAt: message.executed_at,
  legPositionIds: message.leg_position_ids,
  price: message.price_e6,
  requestorPublicId: message.requestor_public_id,
  rfqId: message.rfq_id,
  side: message.side,
  size: message.size_e6,
  txHash: message.tx_hash,
  type: 'trade' as const,
}));

export type RfqTrade = z.infer<typeof RfqTradeSchema>;

export const RfqErrorMessageSchema = RfqKnownInboundMessageSchema.extend({
  type: z.literal(RfqKnownInboundType.Error),
  request_type: z.string().optional(),
  rfq_id: RfqIdSchema.optional(),
  quote_id: RfqQuoteIdSchema.optional(),
  code: RfqErrorCodeSchema,
  error: z.string(),
  request: z.unknown().optional(),
}).transform((message) => ({
  code: message.code,
  message: message.error,
  quoteId: message.quote_id,
  requestType: message.request_type,
  rfqId: message.rfq_id,
  type: 'rfq_error' as const,
}));

export type RfqErrorMessage = z.infer<typeof RfqErrorMessageSchema>;

export const RfqQuoterInboundMessageSchema = z.discriminatedUnion('type', [
  RfqAuthResponseMessageSchema,
  RfqQuoteRequestSchema,
  RfqQuoteAckSchema,
  RfqQuoteCancelAckSchema,
  RfqConfirmationRequestSchema,
  RfqConfirmationAckSchema,
  RfqExecutionUpdateSchema,
  RfqTradeSchema,
  RfqErrorMessageSchema,
]);

export type RfqQuoterInboundMessage = z.infer<
  typeof RfqQuoterInboundMessageSchema
>;

export type RfqQuoterOutboundMessage =
  | RfqQuoteMessage
  | RfqQuoteCancelMessage
  | RfqConfirmationResponseMessage;

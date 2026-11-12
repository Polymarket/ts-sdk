import { z } from 'zod';
import {
  type ClobAssetId,
  ClobAssetIdSchema,
  type ConditionId,
  ConditionIdSchema,
  type DecimalString,
  type EventId,
  toDecimalString,
  toEventId,
} from '../shared';
import { dataEnvelopeSchema } from './envelope';

/** Contract family that issued an outcome asset. */
export enum TokenModule {
  V1Ctf = 'v1_ctf',
  Binary = 'binary',
  NegRisk = 'neg_risk',
  Combo = 'combo',
}

export const TokenModuleSchema = z.enum(TokenModule);

/** Reference facts and current settlement metadata for an outcome asset. */
export type TokenReference = {
  /** Decimal ERC-1155 identifier, including structured protocol v2 assets. */
  assetId: ClobAssetId;
  /** Market condition in its 32-byte representation. */
  conditionId: ConditionId;
  /** On-chain protocol v2 condition in its 32-byte form; null for v1 assets. */
  structuralConditionId: ConditionId | null;
  module: TokenModule;
  /** On-chain outcome slot; this can differ from the market's order-book slot. */
  outcomeIndex: number;
  /** Order-book token-list slot; null before registration or outside v1. */
  clobIndex: number | null;
  /** Outcome label, which can lag by up to a minute. */
  outcome: string | null;
  /** The other asset of a two-outcome condition; otherwise null. */
  oppositeAssetId: ClobAssetId | null;
  /** Whether an on-chain payout exists; this can lag by up to a minute. */
  resolved: boolean;
  /** Payout rate, including fractional split payouts; null while unresolved. */
  finalPrice: DecimalString | null;
  title: string | null;
  marketSlug: string | null;
  /** Market closure state, which can lag by up to a minute. */
  closed: boolean | null;
  negRisk: boolean | null;
  /** Identifier of the containing neg-risk structure. */
  negRiskMarketId: ConditionId | null;
  /** Market's question index within its neg-risk structure. */
  questionIndex: number | null;
  /** Lowest event ID associated with the market. */
  eventId: EventId | null;
  eventSlug: string | null;
};

const DecimalAssetIdSchema = z
  .string()
  .regex(/^[0-9]{1,78}$/)
  .pipe(ClobAssetIdSchema);
const Bytes32ConditionIdSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .pipe(ConditionIdSchema);
const Int16Schema = z.number().int().min(-32768).max(32767);
const Int32Schema = z.number().int().min(-2147483648).max(2147483647);

export const TokenReferenceSchema = z
  .object({
    token_id: DecimalAssetIdSchema,
    condition_id: Bytes32ConditionIdSchema,
    structural_condition_id: Bytes32ConditionIdSchema.nullable(),
    module: TokenModuleSchema,
    outcome_index: Int16Schema,
    clob_index: Int16Schema.nullable(),
    outcome: z.string().nullable(),
    opposite_token_id: DecimalAssetIdSchema.nullable(),
    resolved: z.boolean(),
    final_price: z
      .number()
      .transform((value) => toDecimalString(String(value)))
      .nullable(),
    title: z.string().nullable(),
    market_slug: z.string().nullable(),
    closed: z.boolean().nullable(),
    neg_risk: z.boolean().nullable(),
    neg_risk_market_id: Bytes32ConditionIdSchema.nullable(),
    question_index: Int32Schema.nullable(),
    event_id: Int32Schema.transform((value) =>
      toEventId(String(value)),
    ).nullable(),
    event_slug: z.string().nullable(),
  })
  .transform((row) => ({
    assetId: row.token_id,
    conditionId: row.condition_id,
    structuralConditionId: row.structural_condition_id,
    module: row.module,
    outcomeIndex: row.outcome_index,
    clobIndex: row.clob_index,
    outcome: row.outcome,
    oppositeAssetId: row.opposite_token_id,
    resolved: row.resolved,
    finalPrice: row.final_price,
    title: row.title,
    marketSlug: row.market_slug,
    closed: row.closed,
    negRisk: row.neg_risk,
    negRiskMarketId: row.neg_risk_market_id,
    questionIndex: row.question_index,
    eventId: row.event_id,
    eventSlug: row.event_slug,
  })) satisfies z.ZodType<TokenReference>;

export const FetchTokenReferencesResponseSchema = dataEnvelopeSchema(
  z.array(TokenReferenceSchema),
);
export type FetchTokenReferencesResponse = z.infer<
  typeof FetchTokenReferencesResponseSchema
>;

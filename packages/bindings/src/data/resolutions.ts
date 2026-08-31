import { z } from 'zod';
import {
  type ConditionId,
  ConditionIdSchema,
  type IsoDateTimeString,
  IsoDateTimeStringSchema,
  type MixedDateTimeString,
  MixedDateTimeStringSchema,
  type QuestionId,
  QuestionIdSchema,
} from '../shared';
import { dataEnvelopeSchema } from './envelope';

/** Lifecycle state of a market resolution. */
export enum ResolutionStatus {
  Initialized = 'initialized',
  Posed = 'posed',
  Proposed = 'proposed',
  Challenged = 'challenged',
  Reproposed = 'reproposed',
  Disputed = 'disputed',
  Active = 'active',
  Arbitration = 'arbitration',
  Resolved = 'resolved',
}

export const ResolutionStatusSchema = z.enum(ResolutionStatus);

/** Market structure associated with a condition-keyed resolution. */
export enum ResolutionMarketType {
  Binary = 'BINARY',
  IncrementalNegRisk = 'INCREMENTAL_NEGRISK',
  AtomicNegRisk = 'ATOMIC_NEGRISK',
}

export const ResolutionMarketTypeSchema = z.enum(ResolutionMarketType);

/** How a condition's final payout was obtained. */
export enum ResolutionSource {
  Reported = 'reported',
  Derived = 'derived',
}

export const ResolutionSourceSchema = z.enum(ResolutionSource);

/** Reporter family that supplied a condition's resolution. */
export enum ResolutionReporter {
  UmaOptimisticOracle = 'UMA_OO',
  Chainlink = 'CHAINLINK',
  Eoa = 'EOA',
}

export const ResolutionReporterSchema = z.enum(ResolutionReporter);

export type Resolution = {
  /** Oracle question identifier, when the resolution has one. */
  questionId?: QuestionId;
  /** Market condition identifier, when selected by condition or event. */
  conditionId?: ConditionId;
  status: ResolutionStatus;
  /** Whether a managed proposal is in extended review. */
  extendedReview: boolean;
  /** Whether the resolution was disputed at any point. */
  wasDisputed: boolean;
  /** Whether the question rules were updated after the question was posed. */
  questionRulesUpdated: boolean;
  /** First proposed oracle price, omitted until set. */
  proposedPrice?: string;
  /** Second proposed oracle price, omitted until set. */
  reproposedPrice?: string;
  /** Final oracle settlement price, omitted until set. */
  price?: string;
  /** Transaction for the latest lifecycle event, when available. */
  transactionHash?: string;
  /** Log index for `transactionHash`, when available. */
  logIndex?: string;
  /** Latest lifecycle change, represented as epoch seconds or RFC3339 UTC. */
  lastUpdatedAt: MixedDateTimeString;
  marketType?: ResolutionMarketType;
  /** Per-outcome payout in micro collateral units per share. */
  payouts?: number[];
  resolutionSource?: ResolutionSource;
  reporter?: ResolutionReporter;
  wasArbitrated?: boolean;
  resolvedBlock?: number;
  resolvedAt?: IsoDateTimeString;
};

export const ResolutionSchema = z
  .object({
    question_id: QuestionIdSchema.optional(),
    condition_id: ConditionIdSchema.refine(
      (conditionId) => conditionId.length === 66,
      'Expected a 32-byte condition ID',
    ).optional(),
    status: ResolutionStatusSchema,
    extended_review: z.boolean(),
    was_disputed: z.boolean(),
    new_version_q: z.boolean(),
    proposed_price: z.string().optional(),
    reproposed_price: z.string().optional(),
    price: z.string().optional(),
    transaction_hash: z.string(),
    log_index: z.string(),
    last_update_timestamp: MixedDateTimeStringSchema,
    market_type: ResolutionMarketTypeSchema.optional(),
    payouts: z.array(z.number().int()).optional(),
    resolution_source: ResolutionSourceSchema.optional(),
    reporter: ResolutionReporterSchema.optional(),
    was_arbitrated: z.boolean().optional(),
    resolved_block: z.number().int().min(0).optional(),
    resolved_at: IsoDateTimeStringSchema.optional(),
  })
  .transform((wire): Resolution => {
    const resolution: Resolution = {
      status: wire.status,
      extendedReview: wire.extended_review,
      wasDisputed: wire.was_disputed,
      questionRulesUpdated: wire.new_version_q,
      lastUpdatedAt: wire.last_update_timestamp,
    };

    if (wire.question_id !== undefined)
      resolution.questionId = wire.question_id;
    if (wire.condition_id !== undefined)
      resolution.conditionId = wire.condition_id;
    if (wire.proposed_price !== undefined && wire.proposed_price !== '69') {
      resolution.proposedPrice = wire.proposed_price;
    }
    if (wire.reproposed_price !== undefined && wire.reproposed_price !== '69') {
      resolution.reproposedPrice = wire.reproposed_price;
    }
    if (wire.price !== undefined && wire.price !== '69') {
      resolution.price = wire.price;
    }
    if (wire.transaction_hash !== '') {
      resolution.transactionHash = wire.transaction_hash;
    }
    if (wire.log_index !== '') resolution.logIndex = wire.log_index;
    if (wire.market_type !== undefined)
      resolution.marketType = wire.market_type;
    if (wire.payouts !== undefined) resolution.payouts = wire.payouts;
    if (wire.resolution_source !== undefined) {
      resolution.resolutionSource = wire.resolution_source;
    }
    if (wire.reporter !== undefined) resolution.reporter = wire.reporter;
    if (wire.was_arbitrated !== undefined) {
      resolution.wasArbitrated = wire.was_arbitrated;
    }
    if (wire.resolved_block !== undefined) {
      resolution.resolvedBlock = wire.resolved_block;
    }
    if (wire.resolved_at !== undefined)
      resolution.resolvedAt = wire.resolved_at;

    return resolution;
  }) satisfies z.ZodType<Resolution>;

export const FetchResolutionsResponseSchema = dataEnvelopeSchema(
  z.array(ResolutionSchema),
);

export type FetchResolutionsResponse = z.infer<
  typeof FetchResolutionsResponseSchema
>;

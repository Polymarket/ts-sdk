import { z } from 'zod';
import {
  ClobAssetIdSchema,
  type ConditionId,
  ConditionIdSchema,
  type DecimalString,
  DecimalStringSchema,
  EpochLikeToIsoDateTimeStringSchema,
  EpochMillisecondsToIsoDateTimeStringSchema,
  type IsoDateTimeString,
  type OrderSide,
  OrderSideSchema,
  type PositionId,
  type TokenId,
} from '../shared';

export type BuilderTrade = {
  id: string;
  /** Exchange asset identifier for a CTF token or Polymarket V2 position. */
  assetId: TokenId | PositionId;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId;
  tradeType: string;
  takerOrderHash: string;
  builder: string;
  /** Condition ID for the market associated with this trade. */
  conditionId: ConditionId;
  side: OrderSide;
  size: DecimalString;
  sizeUsdc: DecimalString;
  price: DecimalString;
  status: string;
  outcome: string;
  outcomeIndex: number;
  owner: string;
  maker: string;
  transactionHash: string;
  matchedAt: IsoDateTimeString;
  bucketIndex: number;
  fee: DecimalString;
  feeUsdc: DecimalString;
  errMsg: string | null | undefined;
  createdAt?: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
};

export const BuilderTradeSchema = z
  .object({
    id: z.string(),
    tradeType: z.string(),
    takerOrderHash: z.string(),
    builder: z.string(),
    market: ConditionIdSchema,
    assetId: ClobAssetIdSchema,
    side: OrderSideSchema,
    size: DecimalStringSchema,
    sizeUsdc: DecimalStringSchema,
    price: DecimalStringSchema,
    status: z.string(),
    outcome: z.string(),
    outcomeIndex: z.number().int(),
    owner: z.string(),
    maker: z.string(),
    transactionHash: z.string(),
    matchTime: EpochLikeToIsoDateTimeStringSchema,
    bucketIndex: z.number().int(),
    fee: DecimalStringSchema,
    feeUsdc: DecimalStringSchema,
    err_msg: z.string().nullable().optional(),
    createdAt: EpochMillisecondsToIsoDateTimeStringSchema.optional(),
    updatedAt: EpochMillisecondsToIsoDateTimeStringSchema.optional(),
  })
  .transform(({ err_msg, assetId, market, matchTime, ...rest }) => ({
    ...rest,
    conditionId: market,
    assetId,
    tokenId: assetId,
    errMsg: err_msg,
    matchedAt: matchTime,
  })) satisfies z.ZodType<BuilderTrade>;

export const PaginatedBuilderTradesSchema = z
  .object({
    limit: z.number().int(),
    count: z.number().int(),
    next_cursor: z.string(),
    data: z.array(BuilderTradeSchema),
  })
  .transform(({ next_cursor, ...rest }) => ({
    ...rest,
    nextCursor: next_cursor,
  }));
export type PaginatedBuilderTrades = z.infer<
  typeof PaginatedBuilderTradesSchema
>;

const BUILDER_FEES_BPS = 10_000;

export const BuilderFeeRatesSchema = z
  .object({
    builder_maker_fee_rate_bps: z.number(),
    builder_taker_fee_rate_bps: z.number(),
  })
  .transform(({ builder_maker_fee_rate_bps, builder_taker_fee_rate_bps }) => ({
    maker: builder_maker_fee_rate_bps / BUILDER_FEES_BPS,
    taker: builder_taker_fee_rate_bps / BUILDER_FEES_BPS,
  }));

export const FetchBuilderFeeRatesResponseSchema = BuilderFeeRatesSchema;

export type BuilderFeeRates = z.infer<typeof BuilderFeeRatesSchema>;
export type FetchBuilderFeeRatesResponse = z.infer<
  typeof FetchBuilderFeeRatesResponseSchema
>;

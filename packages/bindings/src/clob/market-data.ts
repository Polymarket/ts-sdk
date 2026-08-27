import { z } from 'zod';
import {
  ClobAssetIdSchema,
  ConditionIdSchema,
  type DecimalString,
  DecimalStringSchema,
  type OrderSide,
  OrderSideSchema,
  type PositionId,
  type TickSizeValue,
  TickSizeValueSchema,
  type TokenId,
} from '../shared';

export enum PriceHistoryInterval {
  MAX = 'max',
  ONE_WEEK = '1w',
  ONE_DAY = '1d',
  SIX_HOURS = '6h',
  ONE_HOUR = '1h',
}

export const PriceHistoryIntervalSchema = z.enum(PriceHistoryInterval);

export const MidpointSchema = z.object({
  mid: DecimalStringSchema,
});
export type Midpoint = z.infer<typeof MidpointSchema>;

export const MidpointsSchema = z.record(ClobAssetIdSchema, DecimalStringSchema);
export type Midpoints = z.infer<typeof MidpointsSchema>;

export const PriceSchema = z.object({
  price: DecimalStringSchema,
});
export type Price = z.infer<typeof PriceSchema>;

const PricesBySideSchema = z.partialRecord(
  OrderSideSchema,
  DecimalStringSchema,
);
export type PricesBySide = z.infer<typeof PricesBySideSchema>;

export const PricesSchema = z.record(ClobAssetIdSchema, PricesBySideSchema);
export type Prices = z.infer<typeof PricesSchema>;

export const SpreadSchema = z.object({
  spread: DecimalStringSchema,
});
export type Spread = z.infer<typeof SpreadSchema>;

export const SpreadsSchema = z.record(ClobAssetIdSchema, DecimalStringSchema);
export type Spreads = z.infer<typeof SpreadsSchema>;

const LastTradePriceValueSchema = z.object({
  price: DecimalStringSchema,
  side: OrderSideSchema,
});
export type LastTradePrice = z.infer<typeof LastTradePriceValueSchema>;

export const LastTradePriceSchema = LastTradePriceValueSchema.extend({
  side: z.union([OrderSideSchema, z.literal('')]),
}).transform((lastTrade): LastTradePrice | null =>
  lastTrade.side === ''
    ? null
    : { price: lastTrade.price, side: lastTrade.side },
);

const LastTradePriceForTokenResponseSchema = z
  .object({
    price: DecimalStringSchema,
    side: OrderSideSchema,
    token_id: ClobAssetIdSchema,
  })
  .transform(({ token_id, price, side }) => ({
    assetId: token_id,
    tokenId: token_id,
    price,
    side,
  })) satisfies z.ZodType<LastTradePriceForAssetResponse>;
export type LastTradePriceForAssetResponse = {
  assetId: TokenId | PositionId;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId;
  price: DecimalString;
  side: OrderSide;
};

/** @deprecated Use `LastTradePriceForAssetResponse`. */
export type LastTradePriceForTokenResponse = LastTradePriceForAssetResponse;

export type LastTradePriceForAsset = {
  assetId: TokenId | PositionId;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId;
  price: DecimalString;
  side: OrderSide;
};

/** @deprecated Use `LastTradePriceForAsset`. */
export type LastTradePriceForToken = LastTradePriceForAsset;

export const LastTradePricesSchema = z.array(
  LastTradePriceForTokenResponseSchema,
);
export type LastTradePrices = z.infer<typeof LastTradePricesSchema>;

const PriceHistoryPointSchema = z.object({
  t: z.number().int(),
  // CLOB price history is intentionally approximate and emitted as JSON numbers.
  p: z.number(),
});
export type PriceHistoryPoint = z.infer<typeof PriceHistoryPointSchema>;

export const PriceHistorySchema = z.object({
  history: z.array(PriceHistoryPointSchema),
});
export type PriceHistory = z.infer<typeof PriceHistorySchema>;

export const ConditionByTokenSchema = z
  .object({
    condition_id: ConditionIdSchema,
  })
  .transform(({ condition_id }) => condition_id);

export const ResolveConditionByTokenResponseSchema = ConditionByTokenSchema;

export type ConditionByToken = z.infer<typeof ConditionByTokenSchema>;
export type ResolveConditionByTokenResponse = z.infer<
  typeof ResolveConditionByTokenResponseSchema
>;

export const MarketFeeInfoSchema = z
  .object({
    r: z.number().default(0),
    e: z.number().default(0),
  })
  .transform(({ r, e }) => ({
    rate: r,
    exponent: e,
  }));

export const MarketTokenSchema = z
  .object({
    t: ClobAssetIdSchema,
    o: z.string(),
  })
  .transform(({ t, o }) => ({
    assetId: t,
    tokenId: t,
    outcome: o,
  })) satisfies z.ZodType<MarketToken>;

export const MarketInfoSchema = z
  .object({
    fd: MarketFeeInfoSchema.nullish(),
    mts: TickSizeValueSchema,
    nr: z.boolean().optional(),
    t: z.array(MarketTokenSchema),
  })
  .transform(({ fd, mts, nr, t }) => ({
    feeInfo: fd ?? { rate: 0, exponent: 0 },
    negRisk: nr ?? false,
    tickSize: mts,
    tokens: t,
  })) satisfies z.ZodType<MarketInfo>;

export const FetchMarketInfoResponseSchema = MarketInfoSchema;

export type MarketFeeInfo = z.infer<typeof MarketFeeInfoSchema>;
export type MarketToken = {
  assetId: TokenId | PositionId;
  /** @deprecated Use `assetId`. */
  tokenId: TokenId | PositionId;
  outcome: string;
};
export type MarketInfo = {
  feeInfo: MarketFeeInfo;
  negRisk: boolean;
  tickSize: TickSizeValue;
  tokens: MarketToken[];
};
export type FetchMarketInfoResponse = MarketInfo;

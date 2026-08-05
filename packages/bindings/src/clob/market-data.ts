import { z } from 'zod';
import {
  CtfConditionIdSchema,
  DecimalStringSchema,
  OrderSideSchema,
  TickSizeValueSchema,
  TokenIdSchema,
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

export const MidpointsSchema = z.record(TokenIdSchema, DecimalStringSchema);
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

export const PricesSchema = z.record(TokenIdSchema, PricesBySideSchema);
export type Prices = z.infer<typeof PricesSchema>;

export const SpreadSchema = z.object({
  spread: DecimalStringSchema,
});
export type Spread = z.infer<typeof SpreadSchema>;

export const SpreadsSchema = z.record(TokenIdSchema, DecimalStringSchema);
export type Spreads = z.infer<typeof SpreadsSchema>;

export const LastTradePriceSchema = z.object({
  price: DecimalStringSchema,
  side: OrderSideSchema,
});
export type LastTradePrice = z.infer<typeof LastTradePriceSchema>;

const LastTradePriceForTokenResponseSchema = z
  .object({
    price: DecimalStringSchema,
    side: OrderSideSchema,
    token_id: TokenIdSchema,
  })
  .transform(({ token_id, price, side }) => ({
    tokenId: token_id,
    price,
    side,
  }));
export type LastTradePriceForTokenResponse = z.infer<
  typeof LastTradePriceForTokenResponseSchema
>;

const LastTradePriceForTokenSchema = z.object({
  tokenId: TokenIdSchema,
  price: DecimalStringSchema,
  side: OrderSideSchema,
});
export type LastTradePriceForToken = z.infer<
  typeof LastTradePriceForTokenSchema
>;

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
    condition_id: CtfConditionIdSchema,
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
    t: TokenIdSchema,
    o: z.string(),
  })
  .transform(({ t, o }) => ({
    tokenId: t,
    outcome: o,
  }));

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
  }));

export const FetchMarketInfoResponseSchema = MarketInfoSchema;

export type MarketFeeInfo = z.infer<typeof MarketFeeInfoSchema>;
export type MarketToken = z.infer<typeof MarketTokenSchema>;
export type MarketInfo = z.infer<typeof MarketInfoSchema>;
export type FetchMarketInfoResponse = z.infer<
  typeof FetchMarketInfoResponseSchema
>;

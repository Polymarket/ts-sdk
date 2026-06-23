import { z } from 'zod';
import {
  type CtfConditionId,
  CtfConditionIdSchema,
  DecimalishSchema,
  type DecimalString,
  DecimalStringSchema,
  type EventId,
  EventIdSchema,
  type EvmAddress,
  EvmAddressSchema,
  emptyStringToNull,
  IsoCalendarDateStringSchema,
  type IsoDateTimeString,
  IsoDateTimeStringSchema,
  type MarketId,
  MarketIdSchema,
  MixedDateTimeStringSchema,
  PaginationCursorSchema,
  type PositionId,
  PositionIdSchema,
  type QuestionId,
  QuestionIdSchema,
  type ResolutionRequestId,
  ResolutionRequestIdSchema,
  type TagId,
  type TickSizeValue,
  TickSizeValueSchema,
  type TokenId,
  TokenIdSchema,
} from '../shared';
import {
  type ClobRewards,
  ClobRewardsSchema,
  type FeeSchedule,
  FeeScheduleSchema,
  ImageOptimizationSchema,
  InternalUserSchema,
  RelatedMarketSchema,
  TagReferenceSchema,
} from './common';

const GammaMarketEventSchema = z.object({
  id: EventIdSchema,
  slug: z.string().nullish(),
  title: z.string().nullish(),
});

const OutcomeArraySchema = z
  .preprocess(parseJsonString, z.array(z.string()).nullish())
  .transform((value) => value ?? []);

const OutcomePriceArraySchema = z
  .preprocess(parseJsonString, z.array(DecimalStringSchema).nullish())
  .transform((value) => value ?? []);

const TokenIdArraySchema = z
  .preprocess(parseJsonString, z.array(TokenIdSchema).nullish())
  .transform((value) => value ?? []);

const PositionIdArraySchema = z
  .preprocess(parseJsonString, z.array(PositionIdSchema).nullish())
  .transform((value) => value ?? []);

export enum UmaResolutionStatus {
  Disputed = 'disputed',
  Proposed = 'proposed',
  Requested = 'requested',
  Resolved = 'resolved',
  Settled = 'settled',
}

const UmaResolutionStatusSchema = z.enum(UmaResolutionStatus);

export type MarketState = {
  active?: boolean | null;
  closed?: boolean | null;
  archived?: boolean | null;
  acceptingOrders?: boolean | null;
  enableOrderBook?: boolean | null;
  negRisk?: boolean | null;
  startDate?: IsoDateTimeString | null;
  endDate?: IsoDateTimeString | null;
  closedTime?: IsoDateTimeString | null;
};

export type MarketOutcome = {
  label: string;
  tokenId: TokenId | null;
  price: DecimalString | null;
};

export type MarketOutcomes = {
  yes: MarketOutcome;
  no: MarketOutcome;
};

export type MarketMetrics = {
  volume?: DecimalString | null;
  volumeNum?: DecimalString | null;
  volume24hr?: DecimalString | null;
  volume1wk?: DecimalString | null;
  volume1mo?: DecimalString | null;
  volume1yr?: DecimalString | null;
  volumeAmm?: DecimalString | null;
  volumeClob?: DecimalString | null;
  liquidity?: DecimalString | null;
  liquidityNum?: DecimalString | null;
  liquidityClob?: DecimalString | null;
};

export type MarketPrices = {
  bestBid?: DecimalString | null;
  bestAsk?: DecimalString | null;
  lastTradePrice?: DecimalString | null;
  spread?: DecimalString | null;
  oneHourPriceChange?: DecimalString | null;
  oneDayPriceChange?: DecimalString | null;
  oneWeekPriceChange?: DecimalString | null;
  oneMonthPriceChange?: DecimalString | null;
  oneYearPriceChange?: DecimalString | null;
};

export type MarketTrading = {
  minimumOrderSize?: DecimalString | null;
  minimumTickSize?: TickSizeValue | null;
  secondsDelay?: number | null;
  feesEnabled?: boolean | null;
  feeType?: string | null;
  feeSchedule?: FeeSchedule | null;
};

export type MarketResolution = {
  questionId: QuestionId | null;
  negRiskRequestId: ResolutionRequestId | null;
  umaResolutionStatus: UmaResolutionStatus | null;
  source?: string | null;
  resolvedBy: EvmAddress | null;
};

export type MarketRewards = {
  clobRewards?: ClobRewards[] | null;
  rewardsMinSize?: DecimalString | null;
  rewardsMaxSpread?: number | null;
  holdingRewardsEnabled?: boolean | null;
};

export type MarketSportsMetadata = {
  sportsMarketType?: string | null;
  line?: number | null;
  gameId?: string | null;
  gameStartTime?: IsoDateTimeString | null;
};

export type MarketEvent = {
  id: EventId;
  slug: string | null;
  title: string | null;
};

export type MarketTag = {
  id: TagId;
  slug?: string | null;
  label?: string | null;
};

export type Market = {
  id: MarketId;
  slug?: string | null;
  conditionId: CtfConditionId | null;
  question?: string | null;
  groupItemTitle?: string | null;
  description?: string | null;
  category?: string | null;
  image?: string | null;
  icon?: string | null;
  state: MarketState;
  outcomes: MarketOutcomes;
  metrics: MarketMetrics;
  prices: MarketPrices;
  trading: MarketTrading;
  resolution: MarketResolution;
  rewards: MarketRewards;
  sports: MarketSportsMetadata;
  events: MarketEvent[];
  tags: MarketTag[];
  positionIds: PositionId[];
};

export const GammaMarketSchema = z.object({
  id: MarketIdSchema,
  question: z.string().nullish(),
  conditionId: z
    .preprocess(emptyStringToNull, CtfConditionIdSchema.nullish())
    .transform(nullishToNull),
  slug: z.string().nullish(),
  twitterCardImage: z.string().nullish(),
  resolutionSource: z.string().nullish(),
  endDate: IsoDateTimeStringSchema.nullish(),
  category: z.string().nullish(),
  ammType: z.string().nullish(),
  liquidity: DecimalStringSchema.nullish(),
  sponsorName: z.string().nullish(),
  sponsorImage: z.string().nullish(),
  startDate: IsoDateTimeStringSchema.nullish(),
  xAxisValue: z.string().nullish(),
  yAxisValue: z.string().nullish(),
  denominationToken: z.string().nullish(),
  fee: DecimalStringSchema.nullish(),
  image: z.string().nullish(),
  icon: z.string().nullish(),
  lowerBound: DecimalStringSchema.nullish(),
  upperBound: DecimalStringSchema.nullish(),
  description: z.string().nullish(),
  outcomes: OutcomeArraySchema,
  outcomePrices: OutcomePriceArraySchema,
  volume: DecimalStringSchema.nullish(),
  active: z.boolean().nullish(),
  marketType: z.string().nullish(),
  formatType: z.string().nullish(),
  lowerBoundDate: IsoCalendarDateStringSchema.nullish(),
  upperBoundDate: IsoCalendarDateStringSchema.nullish(),
  closed: z.boolean().nullish(),
  marketMakerAddress: z.string(),
  createdBy: z.number().int().nullish(),
  updatedBy: z.number().int().nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  updatedAt: IsoDateTimeStringSchema.nullish(),
  closedTime: IsoDateTimeStringSchema.nullish(),
  wideFormat: z.boolean().nullish(),
  new: z.boolean().nullish(),
  sentDiscord: z.boolean().nullish(),
  mailchimpTag: z.string().nullish(),
  featured: z.boolean().nullish(),
  submitted_by: z.string().nullish(),
  subcategory: z.string().nullish(),
  categoryMailchimpTag: z.string().nullish(),
  twitterCardLocation: z.string().nullish(),
  twitterCardLastRefreshed: IsoDateTimeStringSchema.nullish(),
  twitterCardLastValidated: IsoDateTimeStringSchema.nullish(),
  archived: z.boolean().nullish(),
  resolvedBy: z
    .preprocess(emptyStringToNull, EvmAddressSchema.nullish())
    .transform(nullishToNull),
  restricted: z.boolean().nullish(),
  marketGroup: z.number().int().nullish(),
  groupItemTitle: z.string().nullish(),
  groupItemThreshold: DecimalStringSchema.nullish(),
  questionID: z
    .preprocess(emptyStringToNull, QuestionIdSchema.nullish())
    .transform(nullishToNull),
  umaEndDate: MixedDateTimeStringSchema.nullish(),
  enableOrderBook: z.boolean().nullish(),
  orderPriceMinTickSize: TickSizeValueSchema.nullish(),
  orderMinSize: DecimalishSchema.nullish(),
  umaResolutionStatus: z
    .preprocess(emptyStringToNull, UmaResolutionStatusSchema.nullish())
    .transform(nullishToNull),
  curationOrder: z.number().int().nullish(),
  volumeNum: DecimalishSchema.nullish(),
  liquidityNum: DecimalishSchema.nullish(),
  endDateIso: IsoCalendarDateStringSchema.nullish(),
  startDateIso: IsoCalendarDateStringSchema.nullish(),
  umaEndDateIso: IsoCalendarDateStringSchema.nullish(),
  hasReviewedDates: z.boolean().nullish(),
  readyForCron: z.boolean().nullish(),
  commentsEnabled: z.boolean().nullish(),
  volume24hr: DecimalishSchema.nullish(),
  volume1wk: DecimalishSchema.nullish(),
  volume1mo: DecimalishSchema.nullish(),
  volume1yr: DecimalishSchema.nullish(),
  gameStartTime: IsoDateTimeStringSchema.nullish(),
  secondsDelay: z.number().int().nullish(),
  clobTokenIds: TokenIdArraySchema,
  positionIds: PositionIdArraySchema,
  disqusThread: z.string().nullish(),
  shortOutcomes: z.string().nullish(),
  teamAID: z.string().nullish(),
  teamBID: z.string().nullish(),
  umaBond: DecimalStringSchema.nullish(),
  umaReward: DecimalStringSchema.nullish(),
  fpmmLive: z.boolean().nullish(),
  volume24hrAmm: DecimalishSchema.nullish(),
  volume1wkAmm: DecimalishSchema.nullish(),
  volume1moAmm: DecimalishSchema.nullish(),
  volume1yrAmm: DecimalishSchema.nullish(),
  volume24hrClob: DecimalishSchema.nullish(),
  volume1wkClob: DecimalishSchema.nullish(),
  volume1moClob: DecimalishSchema.nullish(),
  volume1yrClob: DecimalishSchema.nullish(),
  volumeAmm: DecimalishSchema.nullish(),
  volumeClob: DecimalishSchema.nullish(),
  liquidityAmm: DecimalishSchema.nullish(),
  liquidityClob: DecimalishSchema.nullish(),
  makerBaseFee: z.number().nullish(),
  takerBaseFee: z.number().nullish(),
  customLiveness: z.number().int().nullish(),
  acceptingOrders: z.boolean().nullish(),
  negRisk: z.boolean().nullish(),
  negRiskMarketID: z.string().nullish(),
  negRiskRequestID: z
    .preprocess(emptyStringToNull, ResolutionRequestIdSchema.nullish())
    .transform(nullishToNull),
  notificationsEnabled: z.boolean().nullish(),
  score: z.number().int().nullish(),
  imageOptimized: ImageOptimizationSchema.nullish(),
  iconOptimized: ImageOptimizationSchema.nullish(),
  events: z.array(GammaMarketEventSchema).nullish(),
  // Parsed for raw Gamma compatibility; normalized Market intentionally uses category/tags only.
  categories: z.array(z.unknown()).nullish(),
  markets: z.array(RelatedMarketSchema).nullish(),
  creator: z.string().nullish(),
  ready: z.boolean().nullish(),
  funded: z.boolean().nullish(),
  pastSlugs: z.string().nullish(),
  readyTimestamp: IsoDateTimeStringSchema.nullish(),
  fundedTimestamp: IsoDateTimeStringSchema.nullish(),
  acceptingOrdersTimestamp: IsoDateTimeStringSchema.nullish(),
  tags: z.array(TagReferenceSchema).nullish(),
  cyom: z.boolean().nullish(),
  competitive: z.number().nullish(),
  pagerDutyNotificationEnabled: z.boolean().nullish(),
  approved: z.boolean().nullish(),
  clobRewards: z.array(ClobRewardsSchema).nullish(),
  rewardsMinSize: DecimalishSchema.nullish(),
  rewardsMaxSpread: z.number().nullish(),
  spread: DecimalishSchema.nullish(),
  automaticallyResolved: z.boolean().nullish(),
  oneDayPriceChange: DecimalishSchema.nullish(),
  oneHourPriceChange: DecimalishSchema.nullish(),
  oneWeekPriceChange: DecimalishSchema.nullish(),
  oneMonthPriceChange: DecimalishSchema.nullish(),
  oneYearPriceChange: DecimalishSchema.nullish(),
  lastTradePrice: DecimalishSchema.nullish(),
  bestBid: DecimalishSchema.nullish(),
  bestAsk: DecimalishSchema.nullish(),
  automaticallyActive: z.boolean().nullish(),
  clearBookOnStart: z.boolean().nullish(),
  chartColor: z.string().nullish(),
  seriesColor: z.string().nullish(),
  showGmpSeries: z.boolean().nullish(),
  showGmpOutcome: z.boolean().nullish(),
  manualActivation: z.boolean().nullish(),
  negRiskOther: z.boolean().nullish(),
  gameId: z.string().nullish(),
  groupItemRange: z.string().nullish(),
  sportsMarketType: z.string().nullish(),
  line: z.number().nullish(),
  umaResolutionStatuses: z.string().nullish(),
  pendingDeployment: z.boolean().nullish(),
  deploying: z.boolean().nullish(),
  deployingTimestamp: IsoDateTimeStringSchema.nullish(),
  scheduledDeploymentTimestamp: IsoDateTimeStringSchema.nullish(),
  rfqEnabled: z.boolean().nullish(),
  eventStartTime: IsoDateTimeStringSchema.nullish(),
  internalUsers: z.array(InternalUserSchema).nullish(),
  holdingRewardsEnabled: z.boolean().nullish(),
  feesEnabled: z.boolean().nullish(),
  requiresTranslation: z.boolean().nullish(),
  makerRebatesFeeShareBps: z.number().nullish(),
  // Legacy raw fee fields are superseded by feeSchedule in normalized output.
  // feeRate: DecimalishSchema.nullish(),
  // feeExponent: z.number().nullish(),
  feeType: z.string().nullish(),
  feeSchedule: FeeScheduleSchema.nullish(),
});

/**
 * Parses a single market into the normalized binary {@link Market} model.
 *
 * Markets without exactly two outcomes cannot be represented by the binary
 * model and fail validation instead of throwing during normalization.
 */
export const MarketSchema = GammaMarketSchema.transform(
  (market, ctx): Market => {
    if (!hasBinaryOutcomes(market)) {
      ctx.addIssue({
        code: 'custom',
        message: `Expected binary market outcomes, received ${market.outcomes.length}`,
      });

      return z.NEVER;
    }

    return normalizeMarket(market);
  },
) satisfies z.ZodType<Market>;

// Legacy multi-outcome markets cannot be represented by the binary Market
// model, so list responses skip them instead of failing the whole page.
const SkippableMarketSchema = GammaMarketSchema.transform((market) =>
  hasBinaryOutcomes(market) ? normalizeMarket(market) : null,
);

export const ListMarketsResponseSchema = z
  .array(SkippableMarketSchema)
  .transform((markets) => markets.filter((market) => market !== null));
export const ListMarketsKeysetResponseSchema = z
  .object({
    markets: z.array(SkippableMarketSchema),
    next_cursor: PaginationCursorSchema.optional(),
  })
  .transform(({ markets, next_cursor }) => ({
    items: markets.filter((market) => market !== null),
    nextCursor: next_cursor,
  }));
export const FetchMarketTagsResponseSchema = z.array(TagReferenceSchema);

export type GammaMarket = z.infer<typeof GammaMarketSchema>;
export type ListMarketsResponse = z.infer<typeof ListMarketsResponseSchema>;
export type ListMarketsKeysetResponse = z.infer<
  typeof ListMarketsKeysetResponseSchema
>;
export type FetchMarketTagsResponse = z.infer<
  typeof FetchMarketTagsResponseSchema
>;

export function normalizeMarket(market: GammaMarket): Market {
  return {
    id: market.id,
    slug: market.slug,
    conditionId: market.conditionId,
    question: market.question,
    groupItemTitle: market.groupItemTitle,
    description: market.description,
    category: market.category,
    image: market.image,
    icon: market.icon,
    state: {
      active: market.active,
      closed: market.closed,
      archived: market.archived,
      acceptingOrders: market.acceptingOrders,
      enableOrderBook: market.enableOrderBook,
      negRisk: market.negRisk,
      startDate: market.startDate,
      endDate: market.endDate,
      closedTime: market.closedTime,
    },
    outcomes: normalizeOutcomes(market),
    metrics: {
      volume: market.volume,
      volumeNum: market.volumeNum,
      volume24hr: market.volume24hr,
      volume1wk: market.volume1wk,
      volume1mo: market.volume1mo,
      volume1yr: market.volume1yr,
      volumeAmm: market.volumeAmm,
      volumeClob: market.volumeClob,
      liquidity: market.liquidity,
      liquidityNum: market.liquidityNum,
      liquidityClob: market.liquidityClob,
    },
    prices: {
      bestBid: market.bestBid,
      bestAsk: market.bestAsk,
      lastTradePrice: market.lastTradePrice,
      spread: market.spread,
      oneHourPriceChange: market.oneHourPriceChange,
      oneDayPriceChange: market.oneDayPriceChange,
      oneWeekPriceChange: market.oneWeekPriceChange,
      oneMonthPriceChange: market.oneMonthPriceChange,
      oneYearPriceChange: market.oneYearPriceChange,
    },
    trading: {
      minimumOrderSize: market.orderMinSize,
      minimumTickSize: market.orderPriceMinTickSize,
      secondsDelay: market.secondsDelay,
      feesEnabled: market.feesEnabled,
      feeType: market.feeType,
      feeSchedule: market.feeSchedule,
    },
    resolution: {
      questionId: market.questionID,
      negRiskRequestId: market.negRiskRequestID,
      umaResolutionStatus: market.umaResolutionStatus,
      source: market.resolutionSource,
      resolvedBy: market.resolvedBy,
    },
    rewards: {
      clobRewards: market.clobRewards,
      rewardsMinSize: market.rewardsMinSize,
      rewardsMaxSpread: market.rewardsMaxSpread,
      holdingRewardsEnabled: market.holdingRewardsEnabled,
    },
    sports: {
      sportsMarketType: market.sportsMarketType,
      line: market.line,
      gameId: market.gameId,
      gameStartTime: market.gameStartTime,
    },
    events: (market.events ?? []).map((event) => ({
      id: event.id,
      slug: event.slug ?? null,
      title: event.title ?? null,
    })),
    positionIds: market.positionIds,
    tags: (market.tags ?? []).map((tag) => ({
      id: tag.id,
      slug: tag.slug,
      label: tag.label,
    })),
  };
}

function nullishToNull<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

function parseJsonString(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

/**
 * Whether a raw market has exactly the two outcomes required by the binary
 * {@link Market} model. Callers must check this before {@link normalizeMarket}.
 */
export function hasBinaryOutcomes(market: GammaMarket): boolean {
  return market.outcomes.length === 2;
}

function normalizeOutcomes(market: GammaMarket) {
  if (!hasBinaryOutcomes(market)) {
    throw new TypeError(
      `Expected binary market outcomes, received ${market.outcomes.length}`,
    );
  }

  const [yesLabel, noLabel] = market.outcomes as [string, string];

  return {
    yes: {
      label: yesLabel,
      tokenId: market.clobTokenIds[0] ?? null,
      price: market.outcomePrices[0] ?? null,
    },
    no: {
      label: noLabel,
      tokenId: market.clobTokenIds[1] ?? null,
      price: market.outcomePrices[1] ?? null,
    },
  };
}

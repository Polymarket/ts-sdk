import { z } from 'zod';
import {
  CategoryIdSchema,
  ClobRewardIdSchema,
  ConditionIdResponseSchema,
  DecimalishSchema,
  DecimalStringSchema,
  EventIdSchema,
  ImageOptimizationIdSchema,
  InternalUserIdSchema,
  IsoCalendarDateStringSchema,
  IsoDateTimeStringSchema,
  MarketIdSchema,
  TagIdSchema,
} from '../shared';

const OptionalConditionIdResponseSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  ConditionIdResponseSchema.optional(),
);

export const ImageOptimizationSchema = z.object({
  id: ImageOptimizationIdSchema,
  imageUrlSource: z.string().nullish(),
  imageUrlOptimized: z.string().nullish(),
  imageSizeKbSource: z.number().nullish(),
  imageSizeKbOptimized: z.number().nullish(),
  imageOptimizedComplete: z.boolean().nullish(),
  imageOptimizedLastUpdated: IsoDateTimeStringSchema.nullish(),
  relID: z.number().int().nullish(),
  field: z.string().nullish(),
  relname: z.string().nullish(),
});

export const FeeScheduleSchema = z.object({
  exponent: z.number(),
  rate: DecimalishSchema,
  takerOnly: z.boolean(),
  rebateRate: DecimalishSchema,
});

export const EventReferenceSchema = z.object({ id: EventIdSchema });

export const CategoryReferenceSchema = z.object({
  id: CategoryIdSchema,
  label: z.string().nullish(),
  parentCategory: z.string().nullish(),
  slug: z.string().nullish(),
  publishedAt: IsoDateTimeStringSchema.nullish(),
  createdBy: z.string().nullish(),
  updatedBy: z.string().nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  updatedAt: IsoDateTimeStringSchema.nullish(),
});

export const TagReferenceSchema = z.object({
  id: TagIdSchema,
  label: z.string().nullish(),
  slug: z.string().nullish(),
  forceShow: z.boolean().nullish(),
  publishedAt: IsoDateTimeStringSchema.nullish(),
  createdBy: z.number().int().nullish(),
  updatedBy: z.number().int().nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  updatedAt: IsoDateTimeStringSchema.nullish(),
  forceHide: z.boolean().nullish(),
  isCarousel: z.boolean().nullish(),
  activeEventsCount: z.number().int().nullish(),
});

export const RelatedMarketSchema = z.object({
  id: MarketIdSchema,
  conditionId: OptionalConditionIdResponseSchema,
  slug: z.string().nullish(),
  image: z.string().nullish(),
  volume: DecimalStringSchema.nullish(),
  question: z.string().nullish(),
  outcomes: z.string().nullish(),
  outcomePrices: z.string().nullish(),
  startDate: IsoDateTimeStringSchema.nullish(),
  eventSlug: z.string().nullish(),
});

export const ClobRewardsSchema = z.object({
  id: ClobRewardIdSchema,
  conditionId: ConditionIdResponseSchema,
  assetAddress: z.string(),
  rewardsAmount: DecimalishSchema,
  rewardsDailyRate: DecimalishSchema,
  startDate: IsoCalendarDateStringSchema,
  endDate: IsoCalendarDateStringSchema.nullish(),
});

export const InternalUserSchema = z.object({
  id: InternalUserIdSchema,
  username: z.string().nullish(),
});

export type ImageOptimization = z.infer<typeof ImageOptimizationSchema>;
export type FeeSchedule = z.infer<typeof FeeScheduleSchema>;
export type EventReference = z.infer<typeof EventReferenceSchema>;
export type CategoryReference = z.infer<typeof CategoryReferenceSchema>;
export type TagReference = z.infer<typeof TagReferenceSchema>;
export type RelatedMarket = z.infer<typeof RelatedMarketSchema>;
export type ClobRewards = z.infer<typeof ClobRewardsSchema>;
export type InternalUser = z.infer<typeof InternalUserSchema>;

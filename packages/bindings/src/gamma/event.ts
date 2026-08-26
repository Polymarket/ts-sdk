import { z } from 'zod';
import {
  DecimalishSchema,
  type DecimalString,
  DecimalStringSchema,
  type EventCreatorId,
  type EventExternalPartnerMappingId,
  type EventId,
  EventIdSchema,
  type IsoCalendarDateString,
  IsoCalendarDateStringSchema,
  type IsoDateTimeString,
  IsoDateTimeStringSchema,
  PaginationCursorSchema,
  type PartnerId,
  type SeriesId,
  type TagId,
  toBestLineId,
  toChatId,
  toCollectionId,
  toEventCreatorId,
  toEventExternalPartnerMappingId,
  toEventId,
  toPartnerId,
  toSeriesId,
  toSportId,
  toTeamId,
  toTemplateId,
} from '../shared';
import {
  CategoryReferenceSchema,
  type ImageOptimization,
  ImageOptimizationSchema,
  InternalUserSchema,
  TagReferenceSchema,
} from './common';
import {
  GammaMarketSchema,
  hasBinaryOutcomes,
  type Market,
  normalizeMarket,
} from './market';

const BestLineIdSchema = z.string().transform(toBestLineId);
const ChatIdSchema = z.string().transform(toChatId);
const CollectionIdSchema = z.string().transform(toCollectionId);
const EventCreatorIdSchema = z.string().transform(toEventCreatorId);
const EventExternalPartnerMappingIdSchema = z
  .number()
  .int()
  .transform(toEventExternalPartnerMappingId);
const EventPartnerEventIdSchema = z.union([
  EventIdSchema,
  z
    .number()
    .int()
    .transform((value) => toEventId(String(value))),
]);
const PartnerIdSchema = z.number().int().transform(toPartnerId);
export const SeriesIdSchema = z
  .union([z.string(), z.number().int().transform(String)])
  .transform(toSeriesId);
const SportIdSchema = z.number().int().transform(toSportId);
const TeamIdSchema = z.number().int().transform(toTeamId);
const TemplateIdSchema = z.string().transform(toTemplateId);

export const CollectionReferenceSchema = z.object({
  id: CollectionIdSchema,
  ticker: z.string().nullish(),
  slug: z.string().nullish(),
  title: z.string().nullish(),
  subtitle: z.string().nullish(),
  collectionType: z.string().nullish(),
  description: z.string().nullish(),
  tags: z.string().nullish(),
  image: z.string().nullish(),
  icon: z.string().nullish(),
  headerImage: z.string().nullish(),
  layout: z.string().nullish(),
  active: z.boolean().nullish(),
  closed: z.boolean().nullish(),
  archived: z.boolean().nullish(),
  new: z.boolean().nullish(),
  featured: z.boolean().nullish(),
  restricted: z.boolean().nullish(),
  isTemplate: z.boolean().nullish(),
  templateVariables: z.string().nullish(),
  publishedAt: IsoDateTimeStringSchema.nullish(),
  createdBy: z.string().nullish(),
  updatedBy: z.string().nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  updatedAt: IsoDateTimeStringSchema.nullish(),
  disqusThread: z.string().nullish(),
  commentsEnabled: z.boolean().nullish(),
});

export const SeriesReferenceSchema = z.object({
  id: SeriesIdSchema,
  ticker: z.string().nullish(),
  slug: z.string().nullish(),
  title: z.string().nullish(),
  subtitle: z.string().nullish(),
  seriesType: z.string().nullish(),
  recurrence: z.string().nullish(),
  description: z.string().nullish(),
  image: z.string().nullish(),
  icon: z.string().nullish(),
  layout: z.string().nullish(),
  active: z.boolean().nullish(),
  closed: z.boolean().nullish(),
  archived: z.boolean().nullish(),
  new: z.boolean().nullish(),
  featured: z.boolean().nullish(),
  restricted: z.boolean().nullish(),
  isTemplate: z.boolean().nullish(),
  templateVariables: z.boolean().nullish(),
  publishedAt: IsoDateTimeStringSchema.nullish(),
  createdBy: z.string().nullish(),
  updatedBy: z.string().nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  updatedAt: IsoDateTimeStringSchema.nullish(),
  commentsEnabled: z.boolean().nullish(),
  competitive: z.string().nullish(),
  volume24hr: DecimalishSchema.nullish(),
  volume: DecimalishSchema.nullish(),
  liquidity: DecimalishSchema.nullish(),
  startDate: IsoDateTimeStringSchema.nullish(),
  pythTokenID: z.string().nullish(),
  cgAssetName: z.string().nullish(),
  score: z.number().int().nullish(),
  commentCount: z.number().int().nullish(),
  requiresTranslation: z.boolean().nullish(),
});

export const TemplateReferenceSchema = z.object({
  id: TemplateIdSchema,
  displayName: z.string().nullish(),
  eventTitle: z.string().nullish(),
  eventSlug: z.string().nullish(),
  description: z.string().nullish(),
  resolutionSource: z.string().nullish(),
  marketsOrder: z.string().nullish(),
  marketsNegRisk: z.boolean().nullish(),
  marketsAugmentedNegRisk: z.boolean().nullish(),
  marketsShowImages: z.boolean().nullish(),
  markets: z.string().nullish(),
  userVariables: z.string().nullish(),
  creatorUserId: z.string().nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  updatedAt: IsoDateTimeStringSchema.nullish(),
});

export const ChatSchema = z.object({
  id: ChatIdSchema,
  channelId: z.string().nullish(),
  channelName: z.string().nullish(),
  channelImage: z.string().nullish(),
  live: z.boolean().nullish(),
  startTime: IsoDateTimeStringSchema.nullish(),
  endTime: IsoDateTimeStringSchema.nullish(),
});

export const EventCreatorSchema = z.object({
  id: EventCreatorIdSchema,
  creatorName: z.string().nullish(),
  creatorHandle: z.string().nullish(),
  creatorUrl: z.string().nullish(),
  creatorURL: z.string().nullish(),
  creatorImage: z.string().nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  updatedAt: IsoDateTimeStringSchema.nullish(),
});

export const PartnerSchema = z.object({
  id: PartnerIdSchema,
  slug: z.string(),
  name: z.string(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  updatedAt: IsoDateTimeStringSchema.nullish(),
});

export const EventExternalPartnerMappingSchema = z.object({
  id: EventExternalPartnerMappingIdSchema,
  eventId: EventPartnerEventIdSchema,
  partnerId: PartnerIdSchema,
  externalId: z.string(),
  partner: PartnerSchema.nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  updatedAt: IsoDateTimeStringSchema.nullish(),
});

export const BestLineSchema = z.object({
  id: BestLineIdSchema,
  lineType: z.string().nullish(),
  line: z.number().nullish(),
});

export const TeamSchema = z.object({
  id: TeamIdSchema,
  name: z.string().nullish(),
  league: z.string().nullish(),
  record: z.string().nullish(),
  logo: z.string().nullish(),
  abbreviation: z.string().nullish(),
  alias: z.string().nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  updatedAt: IsoDateTimeStringSchema.nullish(),
  providerId: z.number().int().nullish(),
  color: z.string().nullish(),
  ordering: z.string().nullish(),
});

export const SportsMetadataSchema = z.object({
  id: SportIdSchema,
  sport: z.string(),
  image: z.string(),
  resolution: z.string(),
  ordering: z.string(),
  tags: z.string(),
  series: z.string(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  updatedAt: IsoDateTimeStringSchema.nullish(),
});

export const ListTeamsResponseSchema = z.array(TeamSchema);
export const ListSportsMetadataResponseSchema = z.array(SportsMetadataSchema);
export const SportsMarketTypesResponseSchema = z.object({
  marketTypes: z.array(z.string()).nullish(),
});
const EventMarketSchema = GammaMarketSchema.transform((market) =>
  hasBinaryOutcomes(market) ? normalizeMarket(market) : null,
);
const EventMarketsSchema = z
  .array(EventMarketSchema)
  .transform((markets) => markets.filter((market) => market !== null));

export type EventState = {
  active?: boolean | null;
  closed?: boolean | null;
  archived?: boolean | null;
  new?: boolean | null;
  featured?: boolean | null;
  restricted?: boolean | null;
  cyom?: boolean | null;
  live?: boolean | null;
  ended?: boolean | null;
  automaticallyActive?: boolean | null;
  commentsEnabled?: boolean | null;
  requiresTranslation?: boolean | null;
};

export type EventSchedule = {
  startDate?: IsoDateTimeString | null;
  creationDate?: IsoDateTimeString | null;
  endDate?: IsoDateTimeString | null;
  closedTime?: IsoDateTimeString | null;
  startTime?: IsoDateTimeString | null;
  eventDate?: IsoCalendarDateString | null;
  eventWeek?: number | null;
  finishedAt?: IsoDateTimeString | null;
};

export type EventMetrics = {
  liquidity?: DecimalString | null;
  liquidityAmm?: DecimalString | null;
  liquidityClob?: DecimalString | null;
  volume?: DecimalString | null;
  volume24hr?: DecimalString | null;
  volume1wk?: DecimalString | null;
  volume1mo?: DecimalString | null;
  volume1yr?: DecimalString | null;
  openInterest?: DecimalString | null;
  competitive?: number | null;
  commentCount?: number | null;
  tweetCount?: number | null;
};

export type EventDisplay = {
  sortBy?: string | null;
  showAllOutcomes?: boolean | null;
  showMarketImages?: boolean | null;
  gmpChartMode?: string | null;
  color?: string | null;
  featuredOrder?: number | null;
  countryName?: string | null;
  electionType?: string | null;
  imageOptimized?: ImageOptimization | null;
  iconOptimized?: ImageOptimization | null;
  featuredImageOptimized?: ImageOptimization | null;
};

export type EventTrading = {
  enableOrderBook?: boolean | null;
  negRisk?: boolean | null;
  negRiskMarketId?: string | null;
  negRiskFeeBips?: number | null;
  enableNegRisk?: boolean | null;
  negRiskAugmented?: boolean | null;
  cumulativeMarkets?: boolean | null;
};

export type EventResolution = {
  source?: string | null;
  automaticallyResolved?: boolean | null;
};

export type EventEstimation = {
  estimateValue?: boolean | null;
  cantEstimate?: boolean | null;
  estimatedValue?: DecimalString | null;
};

export type EventSportsMetadata = {
  seriesSlug?: string | null;
  score?: string | null;
  elapsed?: string | null;
  period?: string | null;
  gameStatus?: string | null;
  gameId?: number | null;
  rescheduledFromGameId?: number | null;
  sportsradarMatchId?: string | null;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  spreadsMainLine?: number | null;
  totalsMainLine?: number | null;
  bestLines: BestLine[];
  teams: Team[];
  sport?: SportsMetadata | null;
  lastHighlight?: string | null;
  lastHighlightType?: string | null;
  lastHighlightAt?: IsoDateTimeString | null;
};

export type EventSeries = {
  id: SeriesId;
  slug?: string | null;
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  image?: string | null;
  icon?: string | null;
  active?: boolean | null;
  closed?: boolean | null;
  archived?: boolean | null;
  volume?: DecimalString | null;
  liquidity?: DecimalString | null;
  startDate?: IsoDateTimeString | null;
};

export type EventTag = {
  id: TagId;
  slug?: string | null;
  label?: string | null;
};

export type EventCreator = {
  id: EventCreatorId;
  name?: string | null;
  handle?: string | null;
  url?: string | null;
  image?: string | null;
  createdAt?: IsoDateTimeString | null;
  updatedAt?: IsoDateTimeString | null;
};

export type EventPartner = {
  id: EventExternalPartnerMappingId;
  externalId: string;
  partner: {
    id: PartnerId;
    slug: string;
    name: string;
  } | null;
  createdAt?: IsoDateTimeString | null;
  updatedAt?: IsoDateTimeString | null;
};

export type Event = {
  id: EventId;
  parentEventId?: EventId | null;
  ticker?: string | null;
  slug?: string | null;
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  image?: string | null;
  icon?: string | null;
  featuredImage?: string | null;
  createdAt?: IsoDateTimeString | null;
  updatedAt?: IsoDateTimeString | null;
  publishedAt?: IsoDateTimeString | null;
  state: EventState;
  schedule: EventSchedule;
  metrics: EventMetrics;
  display: EventDisplay;
  trading: EventTrading;
  resolution: EventResolution;
  estimation: EventEstimation;
  sports: EventSportsMetadata;
  partners: EventPartner[];
  metadata: Record<string, unknown> | null;
  markets: Market[];
  series: EventSeries[];
  tags: EventTag[];
  creators: EventCreator[];
};

export const GammaEventSchema = z.object({
  id: EventIdSchema,
  ticker: z.string().nullish(),
  slug: z.string().nullish(),
  title: z.string().nullish(),
  subtitle: z.string().nullish(),
  description: z.string().nullish(),
  resolutionSource: z.string().nullish(),
  startDate: IsoDateTimeStringSchema.nullish(),
  creationDate: IsoDateTimeStringSchema.nullish(),
  endDate: IsoDateTimeStringSchema.nullish(),
  image: z.string().nullish(),
  icon: z.string().nullish(),
  active: z.boolean().nullish(),
  closed: z.boolean().nullish(),
  archived: z.boolean().nullish(),
  new: z.boolean().nullish(),
  featured: z.boolean().nullish(),
  restricted: z.boolean().nullish(),
  liquidity: DecimalishSchema.nullish(),
  volume: DecimalishSchema.nullish(),
  openInterest: DecimalishSchema.nullish(),
  sortBy: z.string().nullish(),
  category: z.string().nullish(),
  subcategory: z.string().nullish(),
  isTemplate: z.boolean().nullish(),
  templateVariables: z.string().nullish(),
  published_at: IsoDateTimeStringSchema.nullish(),
  createdBy: z.string().nullish(),
  updatedBy: z.string().nullish(),
  createdAt: IsoDateTimeStringSchema.nullish(),
  updatedAt: IsoDateTimeStringSchema.nullish(),
  commentsEnabled: z.boolean().nullish(),
  competitive: z.number().nullish(),
  volume24hr: DecimalishSchema.nullish(),
  volume1wk: DecimalishSchema.nullish(),
  volume1mo: DecimalishSchema.nullish(),
  volume1yr: DecimalishSchema.nullish(),
  featuredImage: z.string().nullish(),
  disqusThread: z.string().nullish(),
  parentEventId: EventIdSchema.nullish(),
  enableOrderBook: z.boolean().nullish(),
  liquidityAmm: DecimalishSchema.nullish(),
  liquidityClob: DecimalishSchema.nullish(),
  negRisk: z.boolean().nullish(),
  negRiskMarketID: z.string().nullish(),
  negRiskFeeBips: z.number().nullish(),
  commentCount: z.number().int().nullish(),
  imageOptimized: ImageOptimizationSchema.nullish(),
  iconOptimized: ImageOptimizationSchema.nullish(),
  featuredImageOptimized: ImageOptimizationSchema.nullish(),
  subEvents: z.array(z.string()).nullish(),
  markets: EventMarketsSchema.nullish(),
  series: z.array(SeriesReferenceSchema).nullish(),
  categories: z.array(CategoryReferenceSchema).nullish(),
  collections: z.array(CollectionReferenceSchema).nullish(),
  tags: z.array(TagReferenceSchema).nullish(),
  tag_labels: z.array(z.string()).nullish(),
  tag_slugs: z.array(z.string()).nullish(),
  cyom: z.boolean().nullish(),
  closedTime: IsoDateTimeStringSchema.nullish(),
  showAllOutcomes: z.boolean().nullish(),
  showMarketImages: z.boolean().nullish(),
  automaticallyResolved: z.boolean().nullish(),
  enableNegRisk: z.boolean().nullish(),
  automaticallyActive: z.boolean().nullish(),
  eventDate: IsoCalendarDateStringSchema.nullish(),
  startTime: IsoDateTimeStringSchema.nullish(),
  eventWeek: z.number().int().nullish(),
  seriesSlug: z.string().nullish(),
  score: z.string().nullish(),
  elapsed: z.string().nullish(),
  period: z.string().nullish(),
  live: z.boolean().nullish(),
  ended: z.boolean().nullish(),
  finishedTimestamp: IsoDateTimeStringSchema.nullish(),
  gmpChartMode: z.string().nullish(),
  eventCreators: z.array(EventCreatorSchema).nullish(),
  negRiskAugmented: z.boolean().nullish(),
  countryName: z.string().nullish(),
  electionType: z.string().nullish(),
  color: z.string().nullish(),
  tweetCount: z.number().int().nullish(),
  chats: z.array(ChatSchema).nullish(),
  featuredOrder: z.number().int().nullish(),
  estimateValue: z.boolean().nullish(),
  cantEstimate: z.boolean().nullish(),
  estimatedValue: DecimalStringSchema.nullish(),
  cumulativeMarkets: z.boolean().nullish(),
  templates: z.array(TemplateReferenceSchema).nullish(),
  spreadsMainLine: z.number().nullish(),
  totalsMainLine: z.number().nullish(),
  carouselMap: z.string().nullish(),
  pendingDeployment: z.boolean().nullish(),
  deploying: z.boolean().nullish(),
  deployingTimestamp: IsoDateTimeStringSchema.nullish(),
  scheduledDeploymentTimestamp: IsoDateTimeStringSchema.nullish(),
  gameStatus: z.string().nullish(),
  internalUsers: z.array(InternalUserSchema).nullish(),
  gameId: z.number().int().nullish(),
  rescheduledFromGameId: z.number().int().nullish(),
  sportsradarMatchId: z.string().nullish(),
  bestLines: z.array(BestLineSchema).nullish(),
  homeTeamName: z.string().nullish(),
  awayTeamName: z.string().nullish(),
  requiresTranslation: z.boolean().nullish(),
  turnProviderId: z.string().nullish(),
  lastHighlight: z.string().nullish(),
  lastHighlightType: z.string().nullish(),
  lastHighlightAt: IsoDateTimeStringSchema.nullish(),
  eventMetadata: z.record(z.string(), z.unknown()).nullish(),
  teams: z.array(TeamSchema).nullish(),
  sport: SportsMetadataSchema.nullish(),
  externalPartners: z.array(EventExternalPartnerMappingSchema).nullish(),
});

export const EventSchema = GammaEventSchema.transform(
  normalizeEvent,
) satisfies z.ZodType<Event>;

export const ListEventsResponseSchema = z.array(EventSchema);
export const ListEventsKeysetResponseSchema = z
  .object({
    events: z.array(EventSchema),
    next_cursor: PaginationCursorSchema.optional(),
  })
  .transform(({ events, next_cursor }) => ({
    items: events,
    nextCursor: next_cursor,
  }));
export const FetchEventTagsResponseSchema = z.array(TagReferenceSchema);

export type GammaEvent = z.infer<typeof GammaEventSchema>;
export type ListEventsResponse = z.infer<typeof ListEventsResponseSchema>;
export type ListEventsKeysetResponse = z.infer<
  typeof ListEventsKeysetResponseSchema
>;
export type FetchEventTagsResponse = z.infer<
  typeof FetchEventTagsResponseSchema
>;
export type ListTeamsResponse = z.infer<typeof ListTeamsResponseSchema>;
export type ListSportsMetadataResponse = z.infer<
  typeof ListSportsMetadataResponseSchema
>;
export type SportsMarketTypesResponse = z.infer<
  typeof SportsMarketTypesResponseSchema
>;
export type CollectionReference = z.infer<typeof CollectionReferenceSchema>;
export type SeriesReference = z.infer<typeof SeriesReferenceSchema>;
export type TemplateReference = z.infer<typeof TemplateReferenceSchema>;
export type Chat = z.infer<typeof ChatSchema>;
export type Partner = z.infer<typeof PartnerSchema>;
export type EventExternalPartnerMapping = z.infer<
  typeof EventExternalPartnerMappingSchema
>;
export type BestLine = z.infer<typeof BestLineSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type SportsMetadata = z.infer<typeof SportsMetadataSchema>;

function normalizeEvent(event: GammaEvent): Event {
  return {
    id: event.id,
    parentEventId: event.parentEventId,
    ticker: event.ticker,
    slug: event.slug,
    title: event.title,
    subtitle: event.subtitle,
    description: event.description,
    category: event.category,
    subcategory: event.subcategory,
    image: event.image,
    icon: event.icon,
    featuredImage: event.featuredImage,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    publishedAt: event.published_at,
    state: {
      active: event.active,
      closed: event.closed,
      archived: event.archived,
      new: event.new,
      featured: event.featured,
      restricted: event.restricted,
      cyom: event.cyom,
      live: event.live,
      ended: event.ended,
      automaticallyActive: event.automaticallyActive,
      commentsEnabled: event.commentsEnabled,
      requiresTranslation: event.requiresTranslation,
    },
    schedule: {
      startDate: event.startDate,
      creationDate: event.creationDate,
      endDate: event.endDate,
      closedTime: event.closedTime,
      startTime: event.startTime,
      eventDate: event.eventDate,
      eventWeek: event.eventWeek,
      finishedAt: event.finishedTimestamp,
    },
    metrics: {
      liquidity: event.liquidity,
      liquidityAmm: event.liquidityAmm,
      liquidityClob: event.liquidityClob,
      volume: event.volume,
      volume24hr: event.volume24hr,
      volume1wk: event.volume1wk,
      volume1mo: event.volume1mo,
      volume1yr: event.volume1yr,
      openInterest: event.openInterest,
      competitive: event.competitive,
      commentCount: event.commentCount,
      tweetCount: event.tweetCount,
    },
    display: {
      sortBy: event.sortBy,
      showAllOutcomes: event.showAllOutcomes,
      showMarketImages: event.showMarketImages,
      gmpChartMode: event.gmpChartMode,
      color: event.color,
      featuredOrder: event.featuredOrder,
      countryName: event.countryName,
      electionType: event.electionType,
      imageOptimized: event.imageOptimized,
      iconOptimized: event.iconOptimized,
      featuredImageOptimized: event.featuredImageOptimized,
    },
    trading: {
      enableOrderBook: event.enableOrderBook,
      negRisk: event.negRisk,
      negRiskMarketId: event.negRiskMarketID,
      negRiskFeeBips: event.negRiskFeeBips,
      enableNegRisk: event.enableNegRisk,
      negRiskAugmented: event.negRiskAugmented,
      cumulativeMarkets: event.cumulativeMarkets,
    },
    resolution: {
      source: event.resolutionSource,
      automaticallyResolved: event.automaticallyResolved,
    },
    estimation: {
      estimateValue: event.estimateValue,
      cantEstimate: event.cantEstimate,
      estimatedValue: event.estimatedValue,
    },
    sports: {
      seriesSlug: event.seriesSlug,
      score: event.score,
      elapsed: event.elapsed,
      period: event.period,
      gameStatus: event.gameStatus,
      gameId: event.gameId,
      rescheduledFromGameId: event.rescheduledFromGameId,
      sportsradarMatchId: event.sportsradarMatchId,
      homeTeamName: event.homeTeamName,
      awayTeamName: event.awayTeamName,
      spreadsMainLine: event.spreadsMainLine,
      totalsMainLine: event.totalsMainLine,
      bestLines: event.bestLines ?? [],
      teams: event.teams ?? [],
      sport: event.sport,
      lastHighlight: event.lastHighlight,
      lastHighlightType: event.lastHighlightType,
      lastHighlightAt: event.lastHighlightAt,
    },
    partners: (event.externalPartners ?? []).map((partner) => ({
      id: partner.id,
      externalId: partner.externalId,
      partner: partner.partner
        ? {
            id: partner.partner.id,
            slug: partner.partner.slug,
            name: partner.partner.name,
          }
        : null,
      createdAt: partner.createdAt,
      updatedAt: partner.updatedAt,
    })),
    metadata: event.eventMetadata ?? null,
    markets: event.markets ?? [],
    series: (event.series ?? []).map((series) => ({
      id: series.id,
      slug: series.slug,
      title: series.title,
      subtitle: series.subtitle,
      description: series.description,
      image: series.image,
      icon: series.icon,
      active: series.active,
      closed: series.closed,
      archived: series.archived,
      volume: series.volume,
      liquidity: series.liquidity,
      startDate: series.startDate,
    })),
    tags: (event.tags ?? []).map((tag) => ({
      id: tag.id,
      slug: tag.slug,
      label: tag.label,
    })),
    creators: (event.eventCreators ?? []).map((creator) => ({
      id: creator.id,
      name: creator.creatorName,
      handle: creator.creatorHandle,
      url: creator.creatorUrl ?? creator.creatorURL,
      image: creator.creatorImage,
      createdAt: creator.createdAt,
      updatedAt: creator.updatedAt,
    })),
  };
}

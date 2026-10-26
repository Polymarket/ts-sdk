import { z } from 'zod';
import { TagIdSchema } from '../shared';
import { type Event, GammaEventSchema, normalizeEvent } from './event';
import {
  GammaMarketSchema,
  hasBinaryOutcomes,
  normalizeMarket,
  type SearchMarket,
} from './market';
import { ProfileSchema } from './profile';

export const SearchTagSchema = z
  .object({
    id: TagIdSchema,
    event_count: z.number().int().nullish(),
    label: z.string().nullish(),
    slug: z.string().nullish(),
  })
  .transform(({ event_count, ...rest }) => ({
    ...rest,
    eventCount: event_count,
  }));

export const SearchPaginationSchema = z.object({
  hasMore: z.boolean().nullish(),
  totalResults: z.number().int().nullish(),
});

/** Search events contain market summaries whose identifiers may be omitted. */
export type SearchEvent = Omit<Event, 'markets'> & { markets: SearchMarket[] };

const SearchMarketSchema = GammaMarketSchema.extend({
  id: GammaMarketSchema.shape.id.optional(),
}).transform((market) =>
  hasBinaryOutcomes(market) ? normalizeMarket(market) : null,
);

export const SearchEventSchema = GammaEventSchema.omit({ markets: true })
  .extend({ markets: z.array(SearchMarketSchema).nullish() })
  .transform(
    ({ markets, ...event }): SearchEvent => ({
      ...normalizeEvent(event),
      markets: markets?.filter((market) => market !== null) ?? [],
    }),
  );

export const PublicSearchResponseSchema = z
  .object({
    events: z.array(SearchEventSchema).nullish(),
    tags: z.array(SearchTagSchema).nullish(),
    profiles: z.array(ProfileSchema).nullish(),
    hasMore: z.boolean().optional(),
    pagination: SearchPaginationSchema.nullish(),
  })
  .transform(({ hasMore, pagination, ...response }) => ({
    ...response,
    pagination: hasMore === undefined ? pagination : { ...pagination, hasMore },
  }));

export type SearchTag = z.infer<typeof SearchTagSchema>;
export type SearchPagination = z.infer<typeof SearchPaginationSchema>;
export type PublicSearchResponse = z.infer<typeof PublicSearchResponseSchema>;

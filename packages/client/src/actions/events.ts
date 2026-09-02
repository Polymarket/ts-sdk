import {
  IsoCalendarDateStringSchema,
  IsoDateTimeStringSchema,
  PaginationCursorSchema,
  QuestionIdSchema,
} from '@polymarket/bindings';
import {
  FetchEventLiveVolumeResponseSchema,
  FetchResolutionsResponseSchema,
  type LiveVolume,
  type Resolution,
} from '@polymarket/bindings/data';
import {
  type Event,
  EventSchema,
  FetchEventTagsResponseSchema,
  ListEventsKeysetResponseSchema,
  type TagReference,
} from '@polymarket/bindings/gamma';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseClient } from '../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import { PageSizeSchema, type Paginated, paginate } from '../pagination';
import { parsePolymarketSlugUrl } from '../polymarket-url';
import { validateWith } from '../response';
import { withRateLimitRetry } from '../retry';
import {
  CanonicalMarketConditionIdSchema,
  PositiveInt32EventIdSchema,
  snakeCase,
  toDataSearchParams,
  toSearchParams,
} from './params';

export {
  ResolutionMarketType,
  ResolutionReporter,
  ResolutionSource,
  ResolutionStatus,
} from '@polymarket/bindings/data';

const ListEventsRequestSchema = z.object({
  ascending: z.boolean().optional(),
  closed: z.boolean().default(false),
  cursor: PaginationCursorSchema.optional(),
  pageSize: PageSizeSchema.optional(),
  cyom: z.boolean().optional(),
  endDateMax: IsoDateTimeStringSchema.optional(),
  endDateMin: IsoDateTimeStringSchema.optional(),
  ended: z.boolean().optional(),
  eventDate: IsoCalendarDateStringSchema.optional(),
  eventWeek: z.number().int().optional(),
  excludeTagIds: z.array(z.number().int()).optional(),
  featured: z.boolean().optional(),
  featuredOrder: z.boolean().optional(),
  gameIds: z.array(z.number().int()).optional(),
  ids: z.array(z.number().int()).optional(),
  includeBestLines: z.boolean().optional(),
  includeChat: z.boolean().optional(),
  includeChildren: z.boolean().optional(),
  includeTemplate: z.boolean().optional(),
  liquidityMax: z.number().optional(),
  liquidityMin: z.number().optional(),
  live: z.boolean().optional(),
  locale: z.string().optional(),
  order: z.string().optional(),
  parentEventId: z.number().int().optional(),
  partnerSlug: z.string().optional(),
  recurrence: z.enum(['daily', 'weekly', 'monthly']).optional(),
  relatedTags: z.boolean().optional(),
  seriesIds: z.array(z.number().int()).optional(),
  slug: z.array(z.string()).optional(),
  startDateMax: IsoDateTimeStringSchema.optional(),
  startDateMin: IsoDateTimeStringSchema.optional(),
  startTimeMax: IsoDateTimeStringSchema.optional(),
  startTimeMin: IsoDateTimeStringSchema.optional(),
  tagIds: z.array(z.number().int()).optional(),
  tagMatch: z.enum(['any', 'all']).optional(),
  tagSlug: z.string().optional(),
  titleSearch: z.string().optional(),
  volumeMax: z.number().optional(),
  volumeMin: z.number().optional(),
});

export type ListEventsRequest = z.input<typeof ListEventsRequestSchema>;

const FetchEventRequestSchema = z.union([
  z.object({
    id: z.string(),
    includeBestLines: z.boolean().optional(),
    includeChat: z.boolean().optional(),
    includeTemplate: z.boolean().optional(),
    locale: z.string().optional(),
  }),
  z.object({
    slug: z.string(),
    includeBestLines: z.boolean().optional(),
    includeChat: z.boolean().optional(),
    includeTemplate: z.boolean().optional(),
    locale: z.string().optional(),
  }),
  z.object({
    url: z.string(),
    includeBestLines: z.boolean().optional(),
    includeChat: z.boolean().optional(),
    includeTemplate: z.boolean().optional(),
    locale: z.string().optional(),
  }),
]);

export type FetchEventRequest = z.input<typeof FetchEventRequestSchema>;

const FetchEventTagsRequestSchema = z.object({
  id: z.string(),
});

export type FetchEventTagsRequest = z.input<typeof FetchEventTagsRequestSchema>;

type ListEventsParams = z.output<typeof ListEventsRequestSchema>;

export type ListEventsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListEventsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists events.
 *
 * Defaults to open events. Pass `closed: true` to list settled events.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListEventsError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listEvents(client, {
 *   closed: false,
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: Event[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listEvents(client, {
 *   closed: false,
 *   pageSize: 10,
 * });
 *
 * for await (const page of result) {
 *   // page.items: Event[]
 * }
 * ```
 */
export function listEvents(
  client: BaseClient,
  request: ListEventsRequest = {},
): Paginated<Event[]> {
  const params = parseUserInput(request, ListEventsRequestSchema);

  return paginate(
    (cursor) =>
      client.gamma
        .get('/events/keyset', {
          params: toEventsSearchParams({
            ...params,
            cursor: cursor ?? params.cursor,
          }),
        })
        .andThen(validateWith(ListEventsKeysetResponseSchema))
        .map((response) => ({
          items: response.items,
          hasMore: response.nextCursor !== undefined,
          nextCursor: response.nextCursor,
        })),
    params.cursor,
  );
}

export type FetchEventError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchEventError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches an event.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchEventError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const event = await fetchEvent(client, {
 *   id: '12345',
 * });
 *
 * const eventBySlug = await fetchEvent(client, {
 *   slug: 'presidential-election-2028',
 * });
 *
 * const eventByUrl = await fetchEvent(client, {
 *   url: 'https://polymarket.com/event/presidential-election-2028',
 * });
 *
 * // event === Event
 * ```
 */
export async function fetchEvent(
  client: BaseClient,
  request: FetchEventRequest,
): Promise<Event> {
  const params = parseUserInput(request, FetchEventRequestSchema);

  if ('id' in params) {
    return unwrap(
      client.gamma
        .get(`events/${params.id}`, {
          params: toFetchEventByIdSearchParams(params),
        })
        .andThen(validateWith(EventSchema)),
    );
  }

  const slug =
    'url' in params ? parsePolymarketSlugUrl(params.url, 'event') : params.slug;

  return unwrap(
    client.gamma
      .get(`events/slug/${slug}`, {
        params: toFetchEventBySlugSearchParams(params),
      })
      .andThen(validateWith(EventSchema)),
  );
}

export type FetchEventTagsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchEventTagsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches an event's tags.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchEventTagsError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const tags = await fetchEventTags(client, {
 *   id: '12345',
 * });
 *
 * // tags: TagReference[]
 * ```
 */
export async function fetchEventTags(
  client: BaseClient,
  request: FetchEventTagsRequest,
): Promise<TagReference[]> {
  const params = parseUserInput(request, FetchEventTagsRequestSchema);

  return unwrap(
    client.gamma
      .get(`events/${params.id}/tags`)
      .andThen(validateWith(FetchEventTagsResponseSchema)),
  );
}

const ResolutionConditionIdsSchema = z
  .array(CanonicalMarketConditionIdSchema)
  .min(1)
  .transform((conditionIds) => [...new Set(conditionIds)])
  .refine(
    (conditionIds) => conditionIds.length <= 20,
    'At most 20 distinct condition ids',
  );

const ResolutionEventIdsSchema = z
  .array(PositiveInt32EventIdSchema)
  .min(1)
  .transform((eventIds) => [...new Set(eventIds)])
  .refine((eventIds) => eventIds.length <= 20, 'At most 20 distinct event ids');

const FetchResolutionsRequestSchema = z.union([
  z.object({
    questionId: QuestionIdSchema,
    conditionIds: z.never().optional(),
    eventIds: z.never().optional(),
  }),
  z.object({
    questionId: z.never().optional(),
    conditionIds: ResolutionConditionIdsSchema,
    eventIds: z.never().optional(),
  }),
  z.object({
    questionId: z.never().optional(),
    conditionIds: z.never().optional(),
    eventIds: ResolutionEventIdsSchema,
  }),
]);

export type FetchResolutionsByQuestionRequest = {
  questionId: string;
  conditionIds?: never;
  eventIds?: never;
};

export type FetchResolutionsByConditionRequest = {
  questionId?: never;
  conditionIds: string[];
  eventIds?: never;
};

export type FetchResolutionsByEventRequest = {
  questionId?: never;
  conditionIds?: never;
  eventIds: Array<number | string>;
};

export type FetchResolutionsRequest =
  | FetchResolutionsByQuestionRequest
  | FetchResolutionsByConditionRequest
  | FetchResolutionsByEventRequest;

export type FetchResolutionsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchResolutionsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches resolution lifecycle rows by question, condition, or event.
 *
 * Provide exactly one selector. Condition and event lookups accept at most 20
 * distinct IDs and return one row per matching condition. Missing resolutions
 * return an empty array. A 31-byte protocol v2 market condition ID is
 * right-padded to its canonical 32-byte form. A 31-byte combo condition ID is
 * rejected.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchResolutionsError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const resolutions = await fetchResolutions(client, {
 *   eventIds: ['903193'],
 * });
 *
 * // resolutions: Resolution[]
 * ```
 */
export async function fetchResolutions(
  client: BaseClient,
  request: FetchResolutionsRequest,
): Promise<Resolution[]> {
  const { conditionIds, eventIds, questionId } = parseUserInput(
    request,
    FetchResolutionsRequestSchema,
  );

  return unwrap(
    withRateLimitRetry(() =>
      client.data.get('/v2/resolutions', {
        params: toDataSearchParams({
          questionId,
          condition: conditionIds,
          eventId: eventIds,
        }),
      }),
    ).andThen(validateWith(FetchResolutionsResponseSchema)),
  );
}

const FetchEventLiveVolumeRequestSchema = z.object({
  eventIds: z
    .array(PositiveInt32EventIdSchema)
    .min(1)
    .transform((eventIds) => [...new Set(eventIds)]),
});

export type FetchEventLiveVolumeRequest = z.input<
  typeof FetchEventLiveVolumeRequestSchema
>;

export type FetchEventLiveVolumeError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchEventLiveVolumeError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches cumulative taker volume for one or more events.
 *
 * Results contain one row per market, ordered by taker volume descending, and
 * a total across all returned markets. Volume is measured in shares. Event IDs
 * must be positive 32-bit integers. Transient rate limits are retried
 * automatically.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchEventLiveVolumeError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const volume = await fetchEventLiveVolume(client, {
 *   eventIds: ['160707'],
 * });
 *
 * // volume: LiveVolume
 * ```
 */
export async function fetchEventLiveVolume(
  client: BaseClient,
  request: FetchEventLiveVolumeRequest,
): Promise<LiveVolume> {
  const { eventIds } = parseUserInput(
    request,
    FetchEventLiveVolumeRequestSchema,
  );

  return unwrap(
    withRateLimitRetry(() =>
      client.data.get('/v2/live-volume', {
        params: toDataSearchParams({ eventId: eventIds }),
      }),
    ).andThen(validateWith(FetchEventLiveVolumeResponseSchema)),
  );
}

function toEventsSearchParams(params: ListEventsParams): URLSearchParams {
  return toSearchParams(
    params,
    snakeCase<ListEventsParams>({
      cursor: 'after_cursor',
      excludeTagIds: 'exclude_tag_id',
      gameIds: 'game_id',
      ids: 'id',
      pageSize: 'limit',
      seriesIds: 'series_id',
      tagIds: 'tag_id',
    }),
  );
}

function toFetchEventByIdSearchParams(
  params: Extract<z.output<typeof FetchEventRequestSchema>, { id: string }>,
): URLSearchParams {
  return toSearchParams(
    {
      includeBestLines: params.includeBestLines,
      includeChat: params.includeChat,
      includeTemplate: params.includeTemplate,
      locale: params.locale,
    },
    snakeCase(),
  );
}

function toFetchEventBySlugSearchParams(
  params: Extract<
    z.output<typeof FetchEventRequestSchema>,
    { slug: string } | { url: string }
  >,
): URLSearchParams {
  return toSearchParams(
    {
      includeBestLines: params.includeBestLines,
      includeChat: params.includeChat,
      includeTemplate: params.includeTemplate,
      locale: params.locale,
    },
    snakeCase(),
  );
}

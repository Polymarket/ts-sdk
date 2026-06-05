import {
  ConditionIdSchema,
  IsoDateTimeStringSchema,
  PaginationCursorSchema,
  PositionIdSchema,
} from '@polymarket/bindings';
import {
  ListMarketHoldersResponseSchema,
  ListMarketPositionsResponseSchema,
  ListOpenInterestResponseSchema,
  type MetaHolder,
  type MetaMarketPosition,
  type OpenInterest,
} from '@polymarket/bindings/data';
import {
  FetchMarketTagsResponseSchema,
  ListMarketsKeysetResponseSchema,
  type Market,
  MarketSchema,
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
import {
  decodeOffsetCursor,
  encodeOffsetCursor,
  PageSizeSchema,
  type Paginated,
  paginate,
} from '../pagination';
import { parsePolymarketSlugUrl } from '../polymarket-url';
import { validateWith } from '../response';
import { snakeCase, toDataSearchParams, toSearchParams } from './params';

// The public markets endpoint forces active=true and archived=false server-side.
const ListMarketsRequestSchema = z.object({
  ascending: z.boolean().optional(),
  closed: z.boolean().optional(),
  clobTokenIds: z.array(z.string()).optional(),
  cursor: PaginationCursorSchema.optional(),
  pageSize: PageSizeSchema.optional(),
  conditionIds: z.array(ConditionIdSchema).optional(),
  cyom: z.boolean().optional(),
  decimalized: z.boolean().optional(),
  endDateMax: IsoDateTimeStringSchema.optional(),
  endDateMin: IsoDateTimeStringSchema.optional(),
  gameId: z.string().optional(),
  ids: z.array(z.number().int()).optional(),
  includeTag: z.boolean().optional(),
  liquidityNumMax: z.number().optional(),
  liquidityNumMin: z.number().optional(),
  locale: z.string().optional(),
  marketMakerAddresses: z.array(z.string()).optional(),
  order: z.string().optional(),
  positionIds: z.array(PositionIdSchema).optional(),
  questionIds: z.array(z.string()).optional(),
  relatedTags: z.boolean().optional(),
  rfqEnabled: z.boolean().optional(),
  rewardsMinSize: z.number().optional(),
  slug: z.array(z.string()).optional(),
  sportsMarketTypes: z.array(z.string()).optional(),
  startDateMax: IsoDateTimeStringSchema.optional(),
  startDateMin: IsoDateTimeStringSchema.optional(),
  tagId: z.number().int().optional(),
  tagMatch: z.enum(['any', 'all']).optional(),
  umaResolutionStatus: z.string().optional(),
  volumeNumMax: z.number().optional(),
  volumeNumMin: z.number().optional(),
});

export type ListMarketsRequest = z.input<typeof ListMarketsRequestSchema>;

const FetchMarketByIdRequestSchema = z.object({
  id: z.string(),
  includeTag: z.boolean().optional(),
  locale: z.string().optional(),
});

const FetchMarketBySlugRequestSchema = z.object({
  slug: z.string(),
  includeTag: z.boolean().optional(),
  locale: z.string().optional(),
});

const FetchMarketByUrlRequestSchema = z.object({
  url: z.string(),
  includeTag: z.boolean().optional(),
  locale: z.string().optional(),
});

const FetchMarketRequestSchema = z.union([
  FetchMarketByIdRequestSchema,
  FetchMarketBySlugRequestSchema,
  FetchMarketByUrlRequestSchema,
]);

export type FetchMarketRequest = z.input<typeof FetchMarketRequestSchema>;

const FetchMarketTagsRequestSchema = z.object({
  id: z.string(),
});

export type FetchMarketTagsRequest = z.input<
  typeof FetchMarketTagsRequestSchema
>;

const ListMarketHoldersRequestSchema = z.object({
  limit: z.number().int().optional(),
  market: z.array(z.string()),
  minBalance: z.number().int().optional(),
});

const ListOpenInterestRequestSchema = z.object({
  market: z.array(z.string()).optional(),
});

const MarketPositionStatusSchema = z.enum(['OPEN', 'CLOSED', 'ALL']);
const MarketPositionSortBySchema = z.enum([
  'TOKENS',
  'CASH_PNL',
  'REALIZED_PNL',
  'TOTAL_PNL',
]);
const MarketPositionSortDirectionSchema = z.enum(['ASC', 'DESC']);

const ListMarketPositionsRequestSchema = z.object({
  cursor: PaginationCursorSchema.optional(),
  market: z.string(),
  pageSize: PageSizeSchema.default(20),
  user: z.string().optional(),
  status: MarketPositionStatusSchema.optional(),
  sortBy: MarketPositionSortBySchema.optional(),
  sortDirection: MarketPositionSortDirectionSchema.optional(),
});

export type ListMarketHoldersRequest = z.input<
  typeof ListMarketHoldersRequestSchema
>;
export type ListOpenInterestRequest = z.input<
  typeof ListOpenInterestRequestSchema
>;
export type ListMarketPositionsRequest = z.input<
  typeof ListMarketPositionsRequestSchema
>;

type ListMarketsParams = z.output<typeof ListMarketsRequestSchema>;

export type ListMarketsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListMarketsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists markets.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListMarketsError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listMarkets(client, {
 *   closed: false,
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: Market[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listMarkets(client, {
 *   closed: false,
 *   pageSize: 10,
 * });
 *
 * for await (const page of result) {
 *   // page.items: Market[]
 * }
 * ```
 */
export function listMarkets(
  client: BaseClient,
  request: ListMarketsRequest = {},
): Paginated<Market[]> {
  const params = parseUserInput(request, ListMarketsRequestSchema);

  return paginate(
    (cursor) =>
      client.gamma
        .get('/markets/keyset', {
          params: toMarketsSearchParams({
            ...params,
            cursor: cursor ?? params.cursor,
          }),
        })
        .andThen(validateWith(ListMarketsKeysetResponseSchema))
        .map((response) => ({
          items: response.items,
          hasMore: response.nextCursor !== undefined,
          nextCursor: response.nextCursor,
        })),
    params.cursor,
  );
}

export type FetchMarketError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchMarketError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches a market.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchMarketError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const market = await fetchMarket(client, {
 *   id: '12345',
 * });
 *
 * const marketBySlug = await fetchMarket(client, {
 *   slug: 'some-market-slug',
 * });
 *
 * const marketByUrl = await fetchMarket(client, {
 *   url: 'https://polymarket.com/event/some-market-slug',
 * });
 *
 * // market === Market
 * ```
 */
export async function fetchMarket(
  client: BaseClient,
  request: FetchMarketRequest,
): Promise<Market> {
  const params = parseUserInput(request, FetchMarketRequestSchema);

  if ('id' in params) {
    return fetchMarketById(client, params);
  }

  if ('url' in params) {
    return fetchMarketBySlug(client, {
      includeTag: params.includeTag,
      locale: params.locale,
      slug: parsePolymarketSlugUrl(params.url, 'market'),
    });
  }

  return fetchMarketBySlug(client, params);
}

export type FetchMarketTagsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchMarketTagsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches a market's tags.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchMarketTagsError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const tags = await fetchMarketTags(client, {
 *   id: '12345',
 * });
 *
 * // tags: TagReference[]
 * ```
 */
export async function fetchMarketTags(
  client: BaseClient,
  request: FetchMarketTagsRequest,
): Promise<TagReference[]> {
  const params = parseUserInput(request, FetchMarketTagsRequestSchema);

  return unwrap(
    client.gamma
      .get(`markets/${params.id}/tags`)
      .andThen(validateWith(FetchMarketTagsResponseSchema)),
  );
}

export type ListMarketHoldersError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListMarketHoldersError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists the top holders for one or more markets.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListMarketHoldersError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const holders = await listMarketHolders(client, {
 *   market: ['0xe546672750517f62c45a5a00067481981e62b9c20fa8220203232c9dc8fd2093'],
 *   limit: 5,
 * });
 *
 * // holders: MetaHolder[]
 * ```
 */
export async function listMarketHolders(
  client: BaseClient,
  request: ListMarketHoldersRequest,
): Promise<MetaHolder[]> {
  const params = parseUserInput(request, ListMarketHoldersRequestSchema);

  return unwrap(
    client.data
      .get('/holders', {
        params: toDataSearchParams(params),
      })
      .andThen(validateWith(ListMarketHoldersResponseSchema)),
  );
}

export type ListOpenInterestError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListOpenInterestError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists open interest for one or more markets.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListOpenInterestError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const openInterest = await listOpenInterest(client, {
 *   market: ['0xe546672750517f62c45a5a00067481981e62b9c20fa8220203232c9dc8fd2093'],
 * });
 *
 * // openInterest: OpenInterest[]
 * ```
 */
export async function listOpenInterest(
  client: BaseClient,
  request: ListOpenInterestRequest = {},
): Promise<OpenInterest[]> {
  const params = parseUserInput(request, ListOpenInterestRequestSchema);

  return unwrap(
    client.data
      .get('/oi', {
        params: toDataSearchParams(params),
      })
      .andThen(validateWith(ListOpenInterestResponseSchema)),
  );
}

export type ListMarketPositionsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListMarketPositionsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists positions for a market.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListMarketPositionsError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listMarketPositions(client, {
 *   market: '0xe546672750517f62c45a5a00067481981e62b9c20fa8220203232c9dc8fd2093',
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: MetaMarketPosition[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listMarketPositions(client, {
 *   market: '0xe546672750517f62c45a5a00067481981e62b9c20fa8220203232c9dc8fd2093',
 *   pageSize: 10,
 * });
 *
 * for await (const page of result) {
 *   // page.items: MetaMarketPosition[]
 * }
 * ```
 */
export function listMarketPositions(
  client: BaseClient,
  request: ListMarketPositionsRequest,
): Paginated<MetaMarketPosition[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListMarketPositionsRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize);

    return client.data
      .get('/v1/market-positions', {
        params: toDataSearchParams({
          ...params,
          limit: decoded.pageSize + 1,
          offset: decoded.offset,
        }),
      })
      .andThen(validateWith(ListMarketPositionsResponseSchema))
      .map((positions) => {
        const hasMore = positions.length > decoded.pageSize;

        return {
          items: positions.slice(0, decoded.pageSize),
          hasMore,
          nextCursor: hasMore
            ? encodeOffsetCursor({
                offset: decoded.offset + decoded.pageSize,
                pageSize: decoded.pageSize,
              })
            : undefined,
        };
      });
  }, cursor);
}

function toMarketsSearchParams(params: ListMarketsParams): URLSearchParams {
  return toSearchParams(
    params,
    snakeCase<ListMarketsParams>({
      cursor: 'after_cursor',
      ids: 'id',
      marketMakerAddresses: 'market_maker_address',
      pageSize: 'limit',
    }),
  );
}

async function fetchMarketBySlug(
  client: BaseClient,
  params: z.output<typeof FetchMarketBySlugRequestSchema>,
): Promise<Market> {
  return unwrap(
    client.gamma
      .get(`markets/slug/${params.slug}`, {
        params: toSearchParams(
          {
            includeTag: params.includeTag,
            locale: params.locale,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(MarketSchema)),
  );
}

async function fetchMarketById(
  client: BaseClient,
  params: z.output<typeof FetchMarketByIdRequestSchema>,
): Promise<Market> {
  return unwrap(
    client.gamma
      .get(`markets/${params.id}`, {
        params: toSearchParams(
          {
            includeTag: params.includeTag,
            locale: params.locale,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(MarketSchema)),
  );
}

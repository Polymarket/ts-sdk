import {
  ConditionIdSchema,
  IsoDateTimeStringSchema,
  PaginationCursorSchema,
  PositionIdSchema,
} from '@polymarket/bindings';
import {
  type ComboMarket,
  ListComboMarketsResponseSchema,
} from '@polymarket/bindings/combos';
import {
  FetchOpenInterestResponseSchema,
  ListMarketHoldersResponseSchema,
  type MetaHolder,
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
import { PageSizeSchema, type Paginated, paginate } from '../pagination';
import { parsePolymarketSlugUrl } from '../polymarket-url';
import { validateWith } from '../response';
import { withRateLimitRetry } from '../retry';
import {
  CanonicalMarketConditionIdSchema,
  distinctIdList,
  snakeCase,
  toDataSearchParams,
  toLegacyDataSearchParams,
  toSearchParams,
} from './params';

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

export type ListMarketHoldersRequest = z.input<
  typeof ListMarketHoldersRequestSchema
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
 * Legacy multi-outcome markets cannot be represented by the binary
 * {@link Market} model and are omitted from results.
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

const ListComboMarketsRequestSchema = z.object({
  cursor: PaginationCursorSchema.optional(),
  pageSize: PageSizeSchema.max(100).optional(),
  exclude: z.array(ConditionIdSchema).optional(),
});

export type ListComboMarketsRequest = z.input<
  typeof ListComboMarketsRequestSchema
>;

export type ListComboMarketsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListComboMarketsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists markets available for Combos.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListComboMarketsError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listComboMarkets(client, {
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: ComboMarket[]
 * }
 * ```
 *
 * @example
 * Omit markets the caller has already displayed:
 * ```ts
 * const result = listComboMarkets(client, {
 *   exclude: ['0x4cd77d456c83e7d8c569a8fb8f6396c3f40154f657e6d970733e2b1b6a7110ff'],
 *   pageSize: 10,
 * });
 * ```
 */
export function listComboMarkets(
  client: BaseClient,
  request: ListComboMarketsRequest = {},
): Paginated<ComboMarket[]> {
  const params = parseUserInput(request, ListComboMarketsRequestSchema);

  return paginate(
    (cursor) =>
      client.rfq
        .get('/v1/rfq/combo-markets', {
          params: toComboMarketsSearchParams({
            ...params,
            cursor: cursor ?? params.cursor,
          }),
        })
        .andThen(validateWith(ListComboMarketsResponseSchema))
        .map((response) => ({
          items: response.markets,
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
 * Legacy multi-outcome markets cannot be represented by the binary
 * {@link Market} model, so fetching one fails with an
 * {@link UnexpectedResponseError}.
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
        params: toLegacyDataSearchParams(params),
      })
      .andThen(validateWith(ListMarketHoldersResponseSchema)),
  );
}

const FetchOpenInterestRequestSchema = z.object({
  conditionId: z
    .union([
      CanonicalMarketConditionIdSchema,
      distinctIdList(CanonicalMarketConditionIdSchema, 20),
    ])
    .optional(),
});

export type FetchOpenInterestRequest = z.input<
  typeof FetchOpenInterestRequestSchema
>;

export type FetchOpenInterestError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchOpenInterestError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches priced gross open interest for selected markets or globally.
 *
 * `conditionId` accepts one or up to 20 distinct market condition IDs. Omit it
 * for the global aggregate. A requested servable market with no holdings has a
 * zero value; an absent row means the market is not servable. Values are in
 * USDC. Transient rate limits are retried automatically.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchOpenInterestError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const openInterest = await fetchOpenInterest(client, {
 *   conditionId: '0xe546672750517f62c45a5a00067481981e62b9c20fa8220203232c9dc8fd2093',
 * });
 *
 * // openInterest: OpenInterest[]
 * ```
 */
export async function fetchOpenInterest(
  client: BaseClient,
  request: FetchOpenInterestRequest = {},
): Promise<OpenInterest[]> {
  const { conditionId } = parseUserInput(
    request,
    FetchOpenInterestRequestSchema,
  );

  return unwrap(
    withRateLimitRetry(() =>
      client.data.get('/v2/oi', {
        params: toDataSearchParams({ condition: conditionId }),
      }),
    ).andThen(validateWith(FetchOpenInterestResponseSchema)),
  );
}

function toMarketsSearchParams(params: ListMarketsParams): URLSearchParams {
  return toSearchParams(
    params,
    snakeCase<ListMarketsParams>({
      cursor: 'after_cursor',
      ids: 'id',
      pageSize: 'limit',
    }),
  );
}

type ListComboMarketsParams = z.output<typeof ListComboMarketsRequestSchema>;

function toComboMarketsSearchParams(
  params: ListComboMarketsParams,
): URLSearchParams {
  return toSearchParams(
    {
      cursor: params.cursor,
      exclude: params.exclude?.join(','),
      pageSize: params.pageSize,
    },
    {
      cursor: 'cursor',
      exclude: 'exclude',
      pageSize: 'limit',
    },
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

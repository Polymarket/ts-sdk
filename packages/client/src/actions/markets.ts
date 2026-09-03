import {
  ClobAssetIdSchema,
  ConditionIdSchema,
  IsoDateTimeStringSchema,
  type PaginationCursor,
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
  ListPriceHistoryResponseSchema,
  type MetaHolder,
  type OpenInterest,
  PriceHistoryInterval,
  PriceHistoryIntervalSchema,
  type PriceHistoryPoint,
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
  EpochSecondsLikeSchema,
  snakeCase,
  toDataSearchParams,
  toSearchParams,
} from './params';

export { PriceHistoryInterval };

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

const ListMarketHoldersRequestSchema = z
  .object({
    conditionIds: distinctIdList(CanonicalMarketConditionIdSchema, 20),
    cursor: PaginationCursorSchema.optional(),
    includePnl: z.boolean().optional(),
    minBalance: z.number().nonnegative().optional(),
    pageSize: PageSizeSchema.max(1000).default(100),
  })
  .superRefine(({ conditionIds, includePnl, pageSize }, context) => {
    if (!includePnl) return;

    if (conditionIds.length !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'includePnl requires exactly one conditionId',
        path: ['conditionIds'],
      });
    }

    if (pageSize > 100) {
      context.addIssue({
        code: 'custom',
        message: 'includePnl supports pageSize at most 100',
        path: ['pageSize'],
      });
    }
  });

export type ListMarketHoldersRequest = z.input<
  typeof ListMarketHoldersRequestSchema
>;
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
 * Lists top holders grouped by outcome for one or more markets.
 *
 * `conditionIds` accepts up to 20 distinct market condition IDs. `pageSize`
 * defaults to 100 (max 1000) and applies separately to each outcome. Merge
 * matching `assetId` groups across pages rather than relying on array position.
 * `minBalance` is measured in shares and defaults to `0`.
 * Amounts are net holdings by default. `includePnl` switches to per-outcome
 * gross holdings and adds position economics; it requires one condition ID and
 * a page size of at most 100. Transient rate limits are retried automatically.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListMarketHoldersError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const result = listMarketHolders(client, {
 *   conditionIds: ['0xe546672750517f62c45a5a00067481981e62b9c20fa8220203232c9dc8fd2093'],
 *   pageSize: 5,
 * });
 *
 * for await (const page of result) {
 *   // page.items: MetaHolder[]
 * }
 * ```
 */
export function listMarketHolders(
  client: BaseClient,
  request: ListMarketHoldersRequest,
): Paginated<MetaHolder[]> {
  const { conditionIds, cursor, includePnl, minBalance, pageSize } =
    parseUserInput(request, ListMarketHoldersRequestSchema);

  return paginate(
    (cursor) =>
      withRateLimitRetry(() =>
        client.data.get('/v2/holders', {
          params: toDataSearchParams({
            condition: conditionIds,
            limit: pageSize,
            cursor,
            includePnl,
            minBalance,
          }),
        }),
      ).andThen(validateWith(ListMarketHoldersResponseSchema)),
    cursor,
  );
}

export type ListPriceHistoryRequest =
  | {
      assetId: string;
      interval: PriceHistoryInterval;
      bucketSeconds?: number;
      cursor?: PaginationCursor;
      pageSize?: number;
      start?: never;
      end?: never;
      asOf?: never;
    }
  | {
      assetId: string;
      start: number | Date;
      end?: number | Date;
      bucketSeconds?: number;
      cursor?: PaginationCursor;
      pageSize?: number;
      interval?: never;
      asOf?: never;
    }
  | {
      assetId: string;
      asOf: number | Date;
      interval?: never;
      start?: never;
      end?: never;
      bucketSeconds?: never;
      cursor?: never;
      pageSize?: never;
    };

const MAX_PRICE_HISTORY_WINDOW_SECONDS = 15 * 24 * 60 * 60;

const PriceHistoryTimestampSchema = EpochSecondsLikeSchema.pipe(
  z.number().int().positive(),
);

const PriceHistoryAssetIdSchema = z.string().min(1).pipe(ClobAssetIdSchema);

const PriceHistorySeriesRequestFields = {
  assetId: PriceHistoryAssetIdSchema,
  bucketSeconds: z.number().int().min(60).max(86_400).optional(),
  cursor: PaginationCursorSchema.optional(),
  pageSize: PageSizeSchema.max(10_000).default(10_000),
};

const PriceHistoryIntervalRequestSchema = z
  .object({
    ...PriceHistorySeriesRequestFields,
    interval: PriceHistoryIntervalSchema,
    start: z.never().optional(),
    end: z.never().optional(),
    asOf: z.never().optional(),
  })
  .superRefine(({ bucketSeconds, interval }, context) => {
    const minimumBucketSeconds =
      interval === PriceHistoryInterval.Max ||
      interval === PriceHistoryInterval.OneMonth
        ? 600
        : interval === PriceHistoryInterval.OneWeek
          ? 300
          : 60;

    if (bucketSeconds !== undefined && bucketSeconds < minimumBucketSeconds) {
      context.addIssue({
        code: 'custom',
        message: `bucketSeconds must be at least ${minimumBucketSeconds} for this interval`,
        path: ['bucketSeconds'],
      });
    }
  });

const PriceHistoryRangeRequestSchema = z
  .object({
    ...PriceHistorySeriesRequestFields,
    start: PriceHistoryTimestampSchema,
    end: PriceHistoryTimestampSchema.optional(),
    interval: z.never().optional(),
    asOf: z.never().optional(),
  })
  .superRefine(({ end, start }, context) => {
    if (end !== undefined && end < start) {
      context.addIssue({
        code: 'custom',
        message: 'end must not precede start',
        path: ['end'],
      });
      return;
    }

    const upperBound = end ?? Math.floor(Date.now() / 1_000);
    if (upperBound - start > MAX_PRICE_HISTORY_WINDOW_SECONDS) {
      context.addIssue({
        code: 'custom',
        message: 'start to end must span at most 15 days',
        path: ['end'],
      });
    }
  });

const PriceHistoryAsOfRequestSchema = z.object({
  assetId: PriceHistoryAssetIdSchema,
  asOf: PriceHistoryTimestampSchema,
  interval: z.never().optional(),
  start: z.never().optional(),
  end: z.never().optional(),
  bucketSeconds: z.never().optional(),
  cursor: z.never().optional(),
  pageSize: z.never().optional(),
});

const ListPriceHistoryRequestSchema = z.union([
  PriceHistoryIntervalRequestSchema,
  PriceHistoryRangeRequestSchema,
  PriceHistoryAsOfRequestSchema,
]) satisfies z.ZodType<ListPriceHistoryRequest, ListPriceHistoryRequest>;

export type ListPriceHistoryError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListPriceHistoryError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists historical price observations for an exchange asset.
 *
 * Select exactly one time form: a relative `interval`, an explicit `start`
 * with optional `end`, or the latest observation at or before an `asOf`
 * instant. Time inputs accept Unix epoch seconds or `Date` values. Prices are
 * decimal strings and returned timestamps are Unix epoch milliseconds. Series
 * pages are ordered oldest first; an `asOf` request returns at most one item.
 * Series page sizes default to and are capped at 10,000 points. Transient rate
 * limits are retried automatically.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListPriceHistoryError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const history = listPriceHistory(client, {
 *   assetId: '17023124228269928849020611259015948850061676830917875073785033885105715180702',
 *   interval: PriceHistoryInterval.OneDay,
 *   bucketSeconds: 3600,
 * });
 *
 * for await (const page of history) {
 *   // page.items: PriceHistoryPoint[]
 * }
 * ```
 */
export function listPriceHistory(
  client: BaseClient,
  request: ListPriceHistoryRequest,
): Paginated<PriceHistoryPoint[]> {
  const { assetId, cursor, pageSize, ...params } = parseUserInput(
    request,
    ListPriceHistoryRequestSchema,
  );

  return paginate(
    (cursor) =>
      withRateLimitRetry(() =>
        client.data.get('/v2/prices-history', {
          params: toDataSearchParams({
            ...params,
            tokenId: assetId,
            limit: pageSize,
            cursor,
          }),
        }),
      ).andThen(validateWith(ListPriceHistoryResponseSchema)),
    cursor,
  );
}

const FetchOpenInterestRequestSchema = z.object({
  conditionIds: distinctIdList(CanonicalMarketConditionIdSchema, 20).optional(),
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
 * `conditionIds` accepts up to 20 distinct market condition IDs. Omit it for
 * the global aggregate, whose `conditionId` is `null`. A requested servable
 * market with no holdings has a zero value; an absent row means the market is
 * not servable. Values are in USDC. Transient rate limits are retried
 * automatically.
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
 *   conditionIds: ['0xe546672750517f62c45a5a00067481981e62b9c20fa8220203232c9dc8fd2093'],
 * });
 *
 * // openInterest: OpenInterest[]
 * ```
 */
export async function fetchOpenInterest(
  client: BaseClient,
  request: FetchOpenInterestRequest = {},
): Promise<OpenInterest[]> {
  const { conditionIds } = parseUserInput(
    request,
    FetchOpenInterestRequestSchema,
  );

  return unwrap(
    withRateLimitRetry(() =>
      client.data.get('/v2/oi', {
        params: toDataSearchParams({ condition: conditionIds }),
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

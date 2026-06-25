import { PaginationCursorSchema } from '@polymarket/bindings';
import {
  type Event,
  type Profile,
  type PublicSearchResponse,
  PublicSearchResponseSchema,
  type SearchTag,
} from '@polymarket/bindings/gamma';
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
import { validateWith } from '../response';
import { snakeCase, toSearchParams } from './params';

export enum SearchSort {
  Volume = 'volume',
  Volume24Hr = 'volume_24hr',
  Liquidity = 'liquidity',
  Competitive = 'competitive',
  ClosedTime = 'closed_time',
  StartDate = 'start_date',
  EndDate = 'end_date',
}

const SearchRequestSchema = z.object({
  q: z.string().trim().min(1),
  ascending: z.boolean().optional(),
  cache: z.boolean().optional(),
  cursor: PaginationCursorSchema.optional(),
  eventsStatus: z.string().min(1).optional(),
  eventsTag: z.array(z.string()).optional(),
  excludeTagIds: z.array(z.number().int()).optional(),
  keepClosedMarkets: z.number().int().optional(),
  optimized: z.boolean().optional(),
  pageSize: PageSizeSchema.default(10),
  presets: z.array(z.string()).optional(),
  recurrence: z.enum(['daily', 'weekly', 'monthly']).optional(),
  searchProfiles: z.boolean().optional(),
  searchTags: z.boolean().optional(),
  sort: z.enum(SearchSort).optional(),
});

export type SearchRequest = z.input<typeof SearchRequestSchema>;

type SearchParams = z.output<typeof SearchRequestSchema>;

type PublicSearchParams = Omit<SearchParams, 'cursor' | 'pageSize'> & {
  limitPerType: number;
  page: number;
};

export type SearchResults = {
  events: Event[];
  profiles: Profile[];
  tags: SearchTag[];
};

export type SearchError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const SearchError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Runs a public full-text search.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 * `keepClosedMarkets` is an hour window for including recently closed markets
 * when searching active events.
 *
 * @throws {@link SearchError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = search(client, {
 *   q: 'trump',
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items.events: Event[]
 *   // page.items.tags: SearchTag[]
 *   // page.items.profiles: Profile[]
 * }
 * ```
 */
export function search(
  client: BaseClient,
  request: SearchRequest,
): Paginated<SearchResults> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    SearchRequestSchema,
  );

  return paginate(
    (cursor) => {
      const decoded = decodeOffsetCursor(cursor, pageSize);

      return client.gamma
        .get('/public-search', {
          params: toSearchParams(
            {
              ...params,
              limitPerType: decoded.pageSize,
              page: decoded.offset,
            },
            snakeCase<PublicSearchParams>({
              excludeTagIds: 'exclude_tag_id',
            }),
          ),
        })
        .andThen(validateWith(PublicSearchResponseSchema))
        .map((response) => ({
          items: toSearchResults(response),
          hasMore: response.pagination?.hasMore ?? false,
          totalCount: response.pagination?.totalResults ?? undefined,
          nextCursor: response.pagination?.hasMore
            ? encodeOffsetCursor({
                offset: decoded.offset + 1,
                pageSize: decoded.pageSize,
              })
            : undefined,
        }));
    },
    cursor ?? encodeOffsetCursor({ offset: 1, pageSize }),
    { events: [], profiles: [], tags: [] },
  );
}

function toSearchResults(response: PublicSearchResponse): SearchResults {
  return {
    events: response.events ?? [],
    profiles: response.profiles ?? [],
    tags: response.tags ?? [],
  };
}

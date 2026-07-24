import { PaginationCursorSchema } from '@polymarket/bindings';
import {
  ListSeriesResponseSchema,
  type Series,
  SeriesSchema,
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
import { validateWith } from '../response';
import { snakeCase, toSearchParams } from './params';

const ListSeriesRequestSchema = z.object({
  ascending: z.boolean().optional(),
  closed: z.boolean().optional(),
  cursor: PaginationCursorSchema.optional(),
  excludeEvents: z.boolean().optional(),
  locale: z.string().optional(),
  order: z.string().optional(),
  // Matches the upstream per-request limit cap.
  pageSize: PageSizeSchema.max(50).default(20),
  recurrence: z.enum(['daily', 'weekly', 'monthly']).optional(),
  slug: z.array(z.string()).optional(),
});

const FetchSeriesRequestSchema = z.object({
  id: z.string(),
  locale: z.string().optional(),
});

export type ListSeriesRequest = z.input<typeof ListSeriesRequestSchema>;
export type FetchSeriesRequest = z.input<typeof FetchSeriesRequestSchema>;

export type ListSeriesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListSeriesError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists series.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListSeriesError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listSeries(client, {
 *   closed: false,
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: Series[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listSeries(client, {
 *   closed: false,
 *   pageSize: 10,
 * });
 *
 * for await (const page of result) {
 *   // page.items: Series[]
 * }
 * ```
 */
export function listSeries(
  client: BaseClient,
  request: ListSeriesRequest = {},
): Paginated<Series[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListSeriesRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize);

    return client.gamma
      .get('/series', {
        params: toSearchParams(
          {
            ...params,
            limit: decoded.pageSize,
            offset: decoded.offset,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(ListSeriesResponseSchema))
      .map((series) => {
        const hasMore = series.length >= decoded.pageSize;

        return {
          items: series,
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

export type FetchSeriesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchSeriesError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches a series.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchSeriesError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const series = await fetchSeries(client, {
 *   id: 'fed-daily-series',
 *   locale: 'en',
 * });
 *
 * // series === Series
 * ```
 */
export async function fetchSeries(
  client: BaseClient,
  request: FetchSeriesRequest,
): Promise<Series> {
  const params = parseUserInput(request, FetchSeriesRequestSchema);

  return unwrap(
    client.gamma
      .get(`series/${params.id}`, {
        params: toSearchParams(
          {
            locale: params.locale,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(SeriesSchema)),
  );
}

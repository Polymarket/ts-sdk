import { PaginationCursorSchema } from '@polymarket/bindings';
import {
  type BuilderStanding,
  BuilderVolumeIntervalSchema,
  type BuilderVolumePoint,
  FetchBuilderVolumeResponseSchema,
  LeaderboardCategorySchema,
  LeaderboardOrderBySchema,
  LeaderboardWindowSchema,
  ListBuilderLeaderboardResponseSchema,
  ListTraderLeaderboardResponseSchema,
  TimePeriodSchema,
  type TraderLeaderboardEntry,
} from '@polymarket/bindings/data';
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
import { withRateLimitRetry } from '../retry';
import { toDataSearchParams, toLegacyDataSearchParams } from './params';

export {
  BuilderVolumeInterval,
  LeaderboardWindow,
} from '@polymarket/bindings/data';

const ListBuilderLeaderboardRequestSchema = z.object({
  cursor: PaginationCursorSchema.optional(),
  // The first-page default and cap; continuation cursors retain their page size.
  pageSize: PageSizeSchema.max(1000).default(100),
  window: LeaderboardWindowSchema.optional(),
});

export type ListBuilderLeaderboardRequest = z.input<
  typeof ListBuilderLeaderboardRequestSchema
>;

export type ListBuilderLeaderboardError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListBuilderLeaderboardError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists builder leaderboard rankings.
 *
 * Builders are ranked by attributed share volume within `window`, which
 * defaults to one day. `builderCode` is the stable identifier; names and
 * profile images are display metadata. `pageSize` defaults to 100 (max 1000).
 * Transient rate limits are retried automatically.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListBuilderLeaderboardError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listBuilderLeaderboard(client, {
 *   pageSize: 10,
 *   window: LeaderboardWindow.Day,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: BuilderStanding[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listBuilderLeaderboard(client, {
 *   pageSize: 10,
 *   window: LeaderboardWindow.Day,
 * });
 *
 * for await (const page of result) {
 *   // page.items: BuilderStanding[]
 * }
 * ```
 */
export function listBuilderLeaderboard(
  client: BaseClient,
  request: ListBuilderLeaderboardRequest = {},
): Paginated<BuilderStanding[]> {
  const { cursor, pageSize, window } = parseUserInput(
    request,
    ListBuilderLeaderboardRequestSchema,
  );

  return paginate(
    (cursor) =>
      withRateLimitRetry(() =>
        client.data.get('/v2/builders/leaderboard', {
          // Retain the original window across the cursor walk. The cursor pins
          // it, while the server rejects a contradictory window explicitly.
          params: toDataSearchParams({
            timePeriod: window,
            limit: pageSize,
            cursor,
          }),
        }),
      ).andThen(validateWith(ListBuilderLeaderboardResponseSchema)),
    cursor,
  );
}

const FetchBuilderVolumeRequestSchema = z.object({
  interval: BuilderVolumeIntervalSchema.optional(),
  // This bounds complete time buckets, not individual builder rows.
  bucketLimit: z.number().int().positive().max(90).optional(),
});

export type FetchBuilderVolumeRequest = z.input<
  typeof FetchBuilderVolumeRequestSchema
>;

export type FetchBuilderVolumeError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchBuilderVolumeError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the per-builder volume time series.
 *
 * `interval` controls bucket width and defaults to daily; `all` means one
 * bucket per calendar year. `bucketLimit` returns that many complete recent
 * buckets (default 30, max 90), not that many builder rows. Results are newest
 * bucket first, and volume is measured in shares. Transient rate limits are
 * retried automatically.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchBuilderVolumeError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const volume = await fetchBuilderVolume(client, {
 *   interval: BuilderVolumeInterval.Day,
 *   bucketLimit: 7,
 * });
 *
 * // volume: BuilderVolumePoint[]
 * ```
 */
export async function fetchBuilderVolume(
  client: BaseClient,
  request: FetchBuilderVolumeRequest = {},
): Promise<BuilderVolumePoint[]> {
  const { interval, bucketLimit } = parseUserInput(
    request,
    FetchBuilderVolumeRequestSchema,
  );

  return unwrap(
    withRateLimitRetry(() =>
      client.data.get('/v2/builders/volume', {
        params: toDataSearchParams({ interval, limit: bucketLimit }),
      }),
    ).andThen(validateWith(FetchBuilderVolumeResponseSchema)),
  );
}

const ListTraderLeaderboardRequestSchema = z.object({
  category: LeaderboardCategorySchema.optional(),
  cursor: PaginationCursorSchema.optional(),
  // Matches the upstream per-request limit cap.
  pageSize: PageSizeSchema.max(50).default(20),
  timePeriod: TimePeriodSchema.optional(),
  orderBy: LeaderboardOrderBySchema.optional(),
  user: z.string().optional(),
  userName: z.string().optional(),
});

export type ListTraderLeaderboardRequest = z.input<
  typeof ListTraderLeaderboardRequestSchema
>;

export type ListTraderLeaderboardError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListTraderLeaderboardError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists trader leaderboard rankings.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListTraderLeaderboardError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listTraderLeaderboard(client, {
 *   orderBy: 'PNL',
 *   pageSize: 10,
 *   timePeriod: 'DAY',
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: TraderLeaderboardEntry[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listTraderLeaderboard(client, {
 *   orderBy: 'PNL',
 *   pageSize: 10,
 *   timePeriod: 'DAY',
 * });
 *
 * for await (const page of result) {
 *   // page.items: TraderLeaderboardEntry[]
 * }
 * ```
 */
export function listTraderLeaderboard(
  client: BaseClient,
  request: ListTraderLeaderboardRequest = {},
): Paginated<TraderLeaderboardEntry[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListTraderLeaderboardRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize);

    return client.data
      .get('/v1/leaderboard', {
        params: toLegacyDataSearchParams({
          ...params,
          limit: decoded.pageSize,
          offset: decoded.offset,
        }),
      })
      .andThen(validateWith(ListTraderLeaderboardResponseSchema))
      .map((traders) => {
        const hasMore = traders.length >= decoded.pageSize;

        return {
          items: traders,
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

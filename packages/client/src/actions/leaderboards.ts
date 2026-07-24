import { PaginationCursorSchema } from '@polymarket/bindings';
import {
  type BuilderVolumeEntry,
  LeaderboardCategorySchema,
  type LeaderboardEntry,
  LeaderboardOrderBySchema,
  ListBuilderLeaderboardResponseSchema,
  ListBuilderVolumeResponseSchema,
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
import { toDataSearchParams } from './params';

const ListBuilderLeaderboardRequestSchema = z.object({
  cursor: PaginationCursorSchema.optional(),
  // Matches the upstream per-request limit cap.
  pageSize: PageSizeSchema.max(50).default(20),
  timePeriod: TimePeriodSchema.optional(),
});

const ListBuilderVolumeRequestSchema = z.object({
  timePeriod: TimePeriodSchema.optional(),
});

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

export type ListBuilderLeaderboardRequest = z.input<
  typeof ListBuilderLeaderboardRequestSchema
>;
export type ListBuilderVolumeRequest = z.input<
  typeof ListBuilderVolumeRequestSchema
>;
export type ListTraderLeaderboardRequest = z.input<
  typeof ListTraderLeaderboardRequestSchema
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
 *   timePeriod: 'DAY',
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: LeaderboardEntry[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listBuilderLeaderboard(client, {
 *   pageSize: 10,
 *   timePeriod: 'DAY',
 * });
 *
 * for await (const page of result) {
 *   // page.items: LeaderboardEntry[]
 * }
 * ```
 */
export function listBuilderLeaderboard(
  client: BaseClient,
  request: ListBuilderLeaderboardRequest = {},
): Paginated<LeaderboardEntry[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListBuilderLeaderboardRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize);

    return client.data
      .get('/v1/builders/leaderboard', {
        params: toDataSearchParams({
          ...params,
          limit: decoded.pageSize,
          offset: decoded.offset,
        }),
      })
      .andThen(validateWith(ListBuilderLeaderboardResponseSchema))
      .map((builders) => {
        const hasMore = builders.length >= decoded.pageSize;

        return {
          items: builders,
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

export type ListBuilderVolumeError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListBuilderVolumeError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists daily builder volume entries.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListBuilderVolumeError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const volume = await fetchBuilderVolume(client, {
 *   timePeriod: 'DAY',
 * });
 *
 * // volume: BuilderVolumeEntry[]
 * ```
 */
export async function fetchBuilderVolume(
  client: BaseClient,
  request: ListBuilderVolumeRequest = {},
): Promise<BuilderVolumeEntry[]> {
  const params = parseUserInput(request, ListBuilderVolumeRequestSchema);

  return unwrap(
    client.data
      .get('/v1/builders/volume', {
        params: toDataSearchParams(params),
      })
      .andThen(validateWith(ListBuilderVolumeResponseSchema)),
  );
}

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
        params: toDataSearchParams({
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

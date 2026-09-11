import { EvmAddressSchema, PaginationCursorSchema } from '@polymarket/bindings';
import {
  type BiggestWinner,
  type BuilderStanding,
  BuilderVolumeIntervalSchema,
  type BuilderVolumePoint,
  FetchBuilderVolumeResponseSchema,
  FetchTraderLeaderboardStandingResponseSchema,
  LeaderboardWindowSchema,
  ListBiggestWinnersResponseSchema,
  ListBuilderLeaderboardResponseSchema,
  ListTraderLeaderboardResponseSchema,
  type TraderLeaderboardEntry,
  TraderLeaderboardSortSchema,
  type TraderLeaderboardStanding,
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
import { PageSizeSchema, type Paginated, paginate } from '../pagination';
import { validateWith } from '../response';
import { withRateLimitRetry } from '../retry';
import { toDataSearchParams } from './params';

export {
  BiggestWinnerKind,
  BuilderVolumeInterval,
  LeaderboardWindow,
  TraderLeaderboardSort,
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
 * `interval` controls bucket width and defaults to daily; use
 * {@link BuilderVolumeInterval.Year} for one bucket per calendar year.
 * `bucketLimit` returns that many complete recent buckets (default 30, max 90),
 * not that many builder rows. Results are newest bucket first, and volume is
 * measured in shares. Transient rate limits are retried automatically.
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

const BoardCategorySchema = z.string().min(1);

const ListTraderLeaderboardRequestSchema = z.object({
  category: BoardCategorySchema.optional(),
  cursor: PaginationCursorSchema.optional(),
  // The first-page default and cap; continuation cursors retain their page size.
  pageSize: PageSizeSchema.max(1000).default(100),
  sortBy: TraderLeaderboardSortSchema.optional(),
  window: LeaderboardWindowSchema.optional(),
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
 * `window` defaults to one day, `category` to overall, and `sortBy` to PnL.
 * Finite-window PnL is marked equity change net of flows, while all-time PnL
 * is realized only. Volume is measured in shares. Tied traders share a rank
 * and the next rank skips. `pageSize` defaults to 100 (max 1000).
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
 *   pageSize: 10,
 *   sortBy: TraderLeaderboardSort.Pnl,
 *   window: LeaderboardWindow.Week,
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
 *   pageSize: 10,
 *   sortBy: TraderLeaderboardSort.Pnl,
 *   window: LeaderboardWindow.Week,
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
  const { category, cursor, pageSize, sortBy, window } = parseUserInput(
    request,
    ListTraderLeaderboardRequestSchema,
  );

  return paginate(
    (cursor) =>
      withRateLimitRetry(() =>
        client.data.get('/v2/leaderboard', {
          // Retain the selected board across the cursor walk. The cursor pins
          // these values and the server rejects contradictory restatements.
          params: toDataSearchParams({
            category,
            cursor,
            limit: pageSize,
            sortBy,
            timePeriod: window,
          }),
        }),
      ).andThen(validateWith(ListTraderLeaderboardResponseSchema)),
    cursor,
  );
}

const FetchTraderLeaderboardStandingRequestSchema = z.object({
  category: BoardCategorySchema.optional(),
  user: EvmAddressSchema,
  window: LeaderboardWindowSchema.optional(),
});

export type FetchTraderLeaderboardStandingRequest = z.input<
  typeof FetchTraderLeaderboardStandingRequestSchema
>;

export type FetchTraderLeaderboardStandingError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchTraderLeaderboardStandingError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches one trader's standing on both the PnL and volume boards.
 *
 * `window` defaults to one day and `category` to overall. A `null` rank means
 * the trader is unranked on that board. Returns `null` for an unknown wallet.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchTraderLeaderboardStandingError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const standing = await fetchTraderLeaderboardStanding(client, {
 *   user: '0xa71093cafc0c099b4ccab24c3cb8018d817923c4',
 *   window: LeaderboardWindow.All,
 * });
 *
 * // standing: TraderLeaderboardStanding | null
 * ```
 */
export async function fetchTraderLeaderboardStanding(
  client: BaseClient,
  request: FetchTraderLeaderboardStandingRequest,
): Promise<TraderLeaderboardStanding | null> {
  const { category, user, window } = parseUserInput(
    request,
    FetchTraderLeaderboardStandingRequestSchema,
  );

  return unwrap(
    withRateLimitRetry(() =>
      client.data.get('/v2/leaderboard', {
        params: toDataSearchParams({
          category,
          timePeriod: window,
          user,
        }),
      }),
    ).andThen(validateWith(FetchTraderLeaderboardStandingResponseSchema)),
  );
}

const ListBiggestWinnersRequestSchema = z.object({
  category: BoardCategorySchema.optional(),
  cursor: PaginationCursorSchema.optional(),
  // The first-page default and cap; continuation cursors retain their page size.
  pageSize: PageSizeSchema.max(1000).default(100),
  window: LeaderboardWindowSchema.optional(),
});

export type ListBiggestWinnersRequest = z.input<
  typeof ListBiggestWinnersRequestSchema
>;

export type ListBiggestWinnersError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListBiggestWinnersError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists the largest individual winning positions.
 *
 * The board has one row per position, ranked by its resolution profit.
 * `window` applies to resolution time and defaults to one day; `category`
 * defaults to overall. Equal profits retain distinct row ordinals. Combo rows
 * have no parent event, so branch on `kind` before using event metadata.
 * `pageSize` defaults to 100 (max 1000).
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListBiggestWinnersError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const result = listBiggestWinners(client, {
 *   category: 'sports',
 *   pageSize: 10,
 *   window: LeaderboardWindow.Week,
 * });
 *
 * for await (const page of result) {
 *   // page.items: BiggestWinner[]
 * }
 * ```
 */
export function listBiggestWinners(
  client: BaseClient,
  request: ListBiggestWinnersRequest = {},
): Paginated<BiggestWinner[]> {
  const { category, cursor, pageSize, window } = parseUserInput(
    request,
    ListBiggestWinnersRequestSchema,
  );

  return paginate(
    (cursor) =>
      withRateLimitRetry(() =>
        client.data.get('/v2/biggest-winners', {
          params: toDataSearchParams({
            category,
            cursor,
            limit: pageSize,
            timePeriod: window,
          }),
        }),
      ).andThen(validateWith(ListBiggestWinnersResponseSchema)),
    cursor,
  );
}

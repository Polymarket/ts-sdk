import {
  ComboConditionIdSchema,
  ConditionIdSchema,
  EventIdSchema,
  EvmAddressSchema,
  PaginationCursorSchema,
} from '@polymarket/bindings';
import {
  type ComboPosition,
  ComboPositionSortBySchema,
  ComboPositionStatus,
  ComboPositionStatusSchema,
  FetchPortfolioValueResponseSchema,
  FetchUserStatsResponseSchema,
  ListComboPositionsResponseSchema,
  ListPositionsResponseSchema,
  type PortfolioValue,
  type Position,
  PositionFilterTypeSchema,
  PositionSortBySchema,
  PositionStatusSchema,
  SortDirectionSchema,
  type UserStats,
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
import { readBlob, validateWith } from '../response';
import { withRateLimitRetry } from '../retry';
import {
  distinctIdList,
  EpochSecondsLikeSchema,
  TimeWindowSchema,
  toDataSearchParams,
  toLegacyDataSearchParams,
} from './params';

export {
  ComboPositionSortBy,
  ComboPositionStatus,
  PositionFilterType,
  PositionSortBy,
  PositionStatus,
} from '@polymarket/bindings/data';

const ListPositionsRequestSchema = z
  .object({
    cursor: PaginationCursorSchema.optional(),
    // The service default; anything past 1000 is rejected, not clamped.
    pageSize: PageSizeSchema.max(1000).default(100),
    /** The wallet to anchor on. At least one of `user`/`conditionId` is required. */
    user: EvmAddressSchema.optional(),
    /**
     * With `user`, narrows that user's positions (all ids honoured). Without
     * `user`, anchors on the market's holders — exactly one id there.
     */
    // The service dedupes and then caps every condition selector at 20
    // DISTINCT ids (one shared parser across the surface).
    conditionId: z
      .union([ConditionIdSchema, distinctIdList(ConditionIdSchema, 20)])
      .optional(),
    /** OPEN (default, includes REDEEMABLE rows) | REDEEMABLE | CLOSED. */
    status: PositionStatusSchema.optional(),
    eventId: z.array(EventIdSchema).min(1).optional(),
    filterType: PositionFilterTypeSchema.optional(),
    filterAmount: z.number().min(0).optional(),
    includeArchived: z.boolean().optional(),
    /** Defaults by status: CURRENT_VALUE for OPEN/REDEEMABLE, REALIZED_PNL for CLOSED. */
    sortBy: PositionSortBySchema.optional(),
    sortDirection: SortDirectionSchema.optional(),
    /** Bounds the rows' last economics event. */
    window: TimeWindowSchema.optional(),
  })
  .refine((value) => value.user !== undefined || value.conditionId, {
    message: 'Provide user or conditionId',
    path: ['user'],
  })
  // Without a user the request anchors on the market's holders, and the
  // service accepts exactly one id there — mirror it so the 400 is
  // unreachable.
  .refine(
    (value) =>
      value.user !== undefined ||
      !Array.isArray(value.conditionId) ||
      value.conditionId.length === 1,
    {
      message: 'Without user, provide exactly one conditionId',
      path: ['conditionId'],
    },
  )
  .refine((value) => !(value.conditionId && value.eventId), {
    message: 'Provide conditionId or eventId, not both',
    path: ['eventId'],
  })
  .refine((value) => value.user !== undefined || value.eventId === undefined, {
    message: 'eventId requires user',
    path: ['eventId'],
  })
  .refine((value) => !(value.includeArchived && value.status === 'CLOSED'), {
    message: 'includeArchived does not apply to CLOSED positions',
    path: ['includeArchived'],
  });

export type ListPositionsRequest = z.input<typeof ListPositionsRequestSchema>;

export type ListPositionsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListPositionsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists positions for a wallet, or a market's holders when anchored on a
 * single `conditionId` without a `user`.
 *
 * One method serves the whole lifecycle: `status: 'OPEN'` (the default) is
 * the superset including settled-but-unredeemed winners, `'REDEEMABLE'`
 * narrows to exactly those, and `'CLOSED'` lists exited positions. Every row
 * carries `redeemable`/`mergeable` flags and fee-exclusive entry economics. A
 * dust floor of 0.1 shares applies on OPEN/REDEEMABLE unless
 * `filterType`/`filterAmount` say otherwise. `conditionId` accepts at most
 * 20 distinct ids (with `user`). `pageSize` defaults to 100 (max 1000).
 * Transient rate limits are retried automatically.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListPositionsError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listPositions(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: Position[]
 * }
 * ```
 *
 * @example
 * Loop through a wallet's exited positions with `for await`:
 * ```ts
 * const result = listPositions(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   status: PositionStatus.Closed,
 * });
 *
 * for await (const page of result) {
 *   // page.items: Position[]
 * }
 * ```
 */
export function listPositions(
  client: BaseClient,
  request: ListPositionsRequest,
): Paginated<Position[]> {
  const { cursor, pageSize, window, ...params } = parseUserInput(
    request,
    ListPositionsRequestSchema,
  );

  return paginate(
    (cursor) =>
      withRateLimitRetry(() =>
        client.data.get('/v2/positions', {
          // The full original filter set rides along with every cursor: the
          // cursor binds only its paging anchor, and a filter dropped on a
          // follow-up page would silently widen the result set.
          params: toDataSearchParams({
            ...params,
            ...window,
            limit: pageSize,
            cursor,
          }),
        }),
      ).andThen(validateWith(ListPositionsResponseSchema)),
    cursor,
  );
}

/**
 * One status or a non-empty ordered list of statuses. Pass multiple statuses
 * as an array rather than a comma-separated string.
 * `ComboPositionStatus.Redeemable` must be the sole value (scalar or a
 * one-element array — both serialize identically) — it narrows to rows whose
 * `redeemable` flag is set and cannot ride a multi-status list.
 */
export type ComboPositionStatusFilter =
  | ComboPositionStatus
  | readonly [ComboPositionStatus, ...ComboPositionStatus[]];

const ComboPositionStatusFilterSchema = z.union([
  ComboPositionStatusSchema,
  z
    .tuple([ComboPositionStatusSchema], ComboPositionStatusSchema)
    .refine(
      (statuses) =>
        statuses.length === 1 ||
        !statuses.includes(ComboPositionStatus.Redeemable),
      { message: 'REDEEMABLE must be the sole status value' },
    ),
]) satisfies z.ZodType<ComboPositionStatusFilter>;

const ListComboPositionsRequestSchema = z.object({
  cursor: PaginationCursorSchema.optional(),
  // The service default; anything past 1000 is rejected, not clamped.
  pageSize: PageSizeSchema.max(1000).default(100),
  /** The wallet to anchor on. Required — combo positions are wallet-anchored. */
  user: EvmAddressSchema,
  // Same shared 20-DISTINCT service cap as the other condition selectors.
  conditionId: z
    .union([ComboConditionIdSchema, distinctIdList(ComboConditionIdSchema, 20)])
    .optional(),
  status: ComboPositionStatusFilterSchema.optional(),
  /**
   * FIRST_ENTRY (default; REDEEMABLE defaults to ENTRY_COST so the largest
   * claims lead) | ENTRY_COST | CURRENT_VALUE | UPDATED.
   */
  sortBy: ComboPositionSortBySchema.optional(),
  sortDirection: SortDirectionSchema.optional(),
  // A change-watermark on the row's `updatedAt`, not a history window —
  // deliberately separate from the `window` option.
  /**
   * Inclusive lower bound on the row's `updatedAt` change watermark — epoch
   * seconds or `Date`. Pairs with `sortBy: 'UPDATED'` for incremental sync.
   */
  updatedAfter: EpochSecondsLikeSchema.optional(),
  /** Inclusive upper bound on the row's `updatedAt` change watermark. */
  updatedBefore: EpochSecondsLikeSchema.optional(),
});

const ListComboPositionsRequestSchemaChecked =
  ListComboPositionsRequestSchema.refine(
    (value) =>
      value.updatedBefore === undefined ||
      value.updatedAfter === undefined ||
      value.updatedBefore >= value.updatedAfter,
    {
      message: 'updatedBefore must not precede updatedAfter',
      path: ['updatedBefore'],
    },
  );

export type ListComboPositionsRequest = Omit<
  z.input<typeof ListComboPositionsRequestSchema>,
  'status'
> & {
  status?: ComboPositionStatusFilter;
};

export type ListComboPositionsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListComboPositionsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists Combo positions for a wallet.
 *
 * `status: 'OPEN'` is the superset including custody-held redeemable
 * positions; `'REDEEMABLE'` (sole value) narrows to exactly the rows whose
 * `redeemable` flag is set. Every row carries its legs enriched with market
 * metadata and exact entry economics. `updatedAfter`/`updatedBefore` bound
 * the rows' change watermark for incremental sync. `pageSize` defaults to
 * 100 (max 1000). Transient rate limits are retried automatically.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListComboPositionsError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listComboPositions(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: ComboPosition[]
 * }
 * ```
 *
 * @example
 * Filter to any of several resolved statuses. Pass multiple statuses as an
 * array rather than a comma-separated string:
 * ```ts
 * const result = listComboPositions(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   status: [
 *     ComboPositionStatus.ResolvedWin,
 *     ComboPositionStatus.ResolvedPartial,
 *     ComboPositionStatus.ResolvedLoss,
 *   ],
 * });
 * ```
 *
 * @example
 * List redeemable Combo positions, largest claims first:
 * ```ts
 * const result = listComboPositions(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   status: 'REDEEMABLE',
 * });
 * ```
 *
 * @example
 * Incrementally sync changed Combo positions:
 * ```ts
 * const result = listComboPositions(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   updatedAfter: 1_797_360_000,
 *   sortBy: 'UPDATED',
 *   sortDirection: 'ASC',
 * });
 * ```
 */
export function listComboPositions(
  client: BaseClient,
  request: ListComboPositionsRequest,
): Paginated<ComboPosition[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListComboPositionsRequestSchemaChecked,
  );

  return paginate(
    (cursor) =>
      withRateLimitRetry(() =>
        client.data.get('/v2/positions/combos', {
          params: toDataSearchParams({ ...params, limit: pageSize, cursor }),
        }),
      ).andThen(validateWith(ListComboPositionsResponseSchema)),
    cursor,
  );
}

const FetchPortfolioValueRequestSchema = z.object({
  user: EvmAddressSchema,
  conditionIds: distinctIdList(ConditionIdSchema, 20).optional(),
});

export type FetchPortfolioValueRequest = z.input<
  typeof FetchPortfolioValueRequestSchema
>;

export type FetchPortfolioValueError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchPortfolioValueError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the total value for a wallet's positions.
 *
 * When `conditionIds` is present, only those single-market positions are
 * included; portfolio-level combo positions are excluded. Accepts at most 20
 * distinct condition IDs.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchPortfolioValueError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const value = await fetchPortfolioValue(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   conditionIds: ['0xe546672750517f62c45a5a00067481981e62b9c20fa8220203232c9dc8fd2093'],
 * });
 *
 * // value: PortfolioValue
 * ```
 */
export async function fetchPortfolioValue(
  client: BaseClient,
  request: FetchPortfolioValueRequest,
): Promise<PortfolioValue> {
  const { conditionIds, ...params } = parseUserInput(
    request,
    FetchPortfolioValueRequestSchema,
  );

  return unwrap(
    withRateLimitRetry(() =>
      client.data.get('/v2/value', {
        params: toDataSearchParams({
          ...params,
          condition: conditionIds,
        }),
      }),
    ).andThen(validateWith(FetchPortfolioValueResponseSchema)),
  );
}

const FetchUserStatsRequestSchema = z.object({
  user: EvmAddressSchema,
});

export type FetchUserStatsRequest = z.input<typeof FetchUserStatsRequestSchema>;

export type FetchUserStatsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchUserStatsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches profile and lifetime trading statistics for a wallet.
 *
 * `trades` is the exact number of distinct markets traded. `biggestWin` is
 * the largest resolved position win, and `allTimePnl` is the latest published
 * cumulative PnL observation. Returns `null` when the wallet is not a known
 * user.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchUserStatsError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const stats = await fetchUserStats(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 * });
 *
 * // stats: UserStats | null
 * ```
 */
export async function fetchUserStats(
  client: BaseClient,
  request: FetchUserStatsRequest,
): Promise<UserStats | null> {
  const params = parseUserInput(request, FetchUserStatsRequestSchema);

  return unwrap(
    withRateLimitRetry(() =>
      client.data.get('/v2/user-stats', {
        params: toDataSearchParams(params),
      }),
    ).andThen(validateWith(FetchUserStatsResponseSchema)),
  );
}

const DownloadAccountingSnapshotRequestSchema = z.object({
  user: z.string(),
});

export type DownloadAccountingSnapshotRequest = z.input<
  typeof DownloadAccountingSnapshotRequestSchema
>;

export type DownloadAccountingSnapshotError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const DownloadAccountingSnapshotError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Downloads an accounting snapshot archive for a wallet.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link DownloadAccountingSnapshotError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const snapshot = await downloadAccountingSnapshot(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 * });
 *
 * // snapshot === Blob
 * ```
 */
export async function downloadAccountingSnapshot(
  client: BaseClient,
  request: DownloadAccountingSnapshotRequest,
): Promise<Blob> {
  const params = parseUserInput(
    request,
    DownloadAccountingSnapshotRequestSchema,
  );

  return unwrap(
    client.data
      .get('/v1/accounting/snapshot', {
        params: toLegacyDataSearchParams(params),
      })
      .andThen(readBlob),
  );
}

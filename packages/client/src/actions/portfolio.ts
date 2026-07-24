import {
  ComboConditionIdSchema,
  PaginationCursorSchema,
} from '@polymarket/bindings';
import {
  type ClosedPosition,
  type ComboPosition,
  ComboPositionStatusSchema,
  FetchPortfolioValueResponseSchema,
  ListClosedPositionsResponseSchema,
  ListComboPositionsResponseSchema,
  ListPositionsResponseSchema,
  type Position,
  type Traded,
  TradedSchema,
  type Value,
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
import { readBlob, validateWith } from '../response';
import { snakeCase, toDataSearchParams, toSearchParams } from './params';

export {
  ComboPositionOutcome,
  ComboPositionStatus,
} from '@polymarket/bindings/data';

export enum ComboPositionSort {
  CurrentValueDesc = 'current_value_desc',
  FirstEntryDesc = 'first_entry_desc',
  EntryCostDesc = 'entry_cost_desc',
  ResolvedAtDesc = 'resolved_at_desc',
  UpdatedAsc = 'updated_asc',
}

const PositionSortBySchema = z.enum([
  'CURRENT',
  'INITIAL',
  'TOKENS',
  'CASHPNL',
  'PERCENTPNL',
  'TITLE',
  'RESOLVING',
  'PRICE',
  'AVGPRICE',
]);

const PositionSortDirectionSchema = z.enum(['ASC', 'DESC']);

const ListPositionsRequestSchema = z
  .object({
    cursor: PaginationCursorSchema.optional(),
    user: z.string(),
    market: z.array(z.string()).optional(),
    eventId: z.array(z.number().int()).optional(),
    sizeThreshold: z.number().optional(),
    redeemable: z.boolean().optional(),
    mergeable: z.boolean().optional(),
    // Matches the upstream per-request limit cap.
    pageSize: PageSizeSchema.max(500).default(20),
    sortBy: PositionSortBySchema.optional(),
    sortDirection: PositionSortDirectionSchema.optional(),
    title: z.string().max(100).optional(),
  })
  .refine((value) => !(value.market && value.eventId), {
    message: 'Provide market or eventId, not both',
    path: ['eventId'],
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
 * Lists current positions for a wallet.
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
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listPositions(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   pageSize: 10,
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
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListPositionsRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize);

    return client.data
      .get('/positions', {
        params: toDataSearchParams({
          ...params,
          limit: decoded.pageSize,
          offset: decoded.offset,
        }),
      })
      .andThen(validateWith(ListPositionsResponseSchema))
      .map((positions) => {
        const hasMore = positions.length >= decoded.pageSize;

        return {
          items: positions,
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

const ClosedPositionSortBySchema = z.enum([
  'REALIZEDPNL',
  'TITLE',
  'PRICE',
  'AVGPRICE',
  'TIMESTAMP',
]);

const ListClosedPositionsRequestSchema = z
  .object({
    cursor: PaginationCursorSchema.optional(),
    user: z.string(),
    market: z.array(z.string()).optional(),
    title: z.string().max(100).optional(),
    eventId: z.array(z.number().int()).optional(),
    // Matches the upstream per-request limit cap.
    pageSize: PageSizeSchema.max(50).default(20),
    sortBy: ClosedPositionSortBySchema.optional(),
    sortDirection: PositionSortDirectionSchema.optional(),
  })
  .refine((value) => !(value.market && value.eventId), {
    message: 'Provide market or eventId, not both',
    path: ['eventId'],
  });

export type ListClosedPositionsRequest = z.input<
  typeof ListClosedPositionsRequestSchema
>;

export type ListClosedPositionsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListClosedPositionsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists closed positions for a wallet.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListClosedPositionsError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listClosedPositions(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: ClosedPosition[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listClosedPositions(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   pageSize: 10,
 * });
 *
 * for await (const page of result) {
 *   // page.items: ClosedPosition[]
 * }
 * ```
 */
export function listClosedPositions(
  client: BaseClient,
  request: ListClosedPositionsRequest,
): Paginated<ClosedPosition[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListClosedPositionsRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize);

    return client.data
      .get('/closed-positions', {
        params: toDataSearchParams({
          ...params,
          limit: decoded.pageSize,
          offset: decoded.offset,
        }),
      })
      .andThen(validateWith(ListClosedPositionsResponseSchema))
      .map((positions) => {
        const hasMore = positions.length >= decoded.pageSize;

        return {
          items: positions,
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

const ComboPositionSortSchema = z.enum(ComboPositionSort);

const ComboConditionIdFilterSchema = z.union([
  ComboConditionIdSchema,
  z.array(ComboConditionIdSchema),
]);

const ListComboPositionsRequestSchema = z.object({
  cursor: PaginationCursorSchema.optional(),
  user: z.string(),
  pageSize: PageSizeSchema.default(20),
  status: ComboPositionStatusSchema.optional(),
  sort: ComboPositionSortSchema.optional(),
  conditionId: ComboConditionIdFilterSchema.optional(),
  updatedAfter: z.number().int().min(0).optional(),
  updatedBefore: z.number().int().min(0).optional(),
});

export type ListComboPositionsRequest = z.input<
  typeof ListComboPositionsRequestSchema
>;

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
 * Lists combo positions for a wallet.
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
 * Filter to open combo positions:
 * ```ts
 * const result = listComboPositions(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   status: ComboPositionStatus.Open,
 * });
 * ```
 *
 * @example
 * Incrementally sync changed combo positions:
 * ```ts
 * const result = listComboPositions(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   updatedAfter: 1_797_360_000,
 *   sort: ComboPositionSort.UpdatedAsc,
 *   pageSize: 1000,
 * });
 * ```
 */
export function listComboPositions(
  client: BaseClient,
  request: ListComboPositionsRequest,
): Paginated<ComboPosition[]> {
  const { cursor, pageSize, conditionId, ...params } = parseUserInput(
    request,
    ListComboPositionsRequestSchema,
  );

  return paginate((cursor) => {
    const searchParams = toSearchParams(
      {
        ...params,
        limit: pageSize,
        cursor,
      },
      snakeCase({
        updatedAfter: 'updatedAfter',
        updatedBefore: 'updatedBefore',
      }),
    );

    appendConditionId(searchParams, conditionId);

    return client.data
      .get('/v1/positions/combos', {
        params: searchParams,
      })
      .andThen(validateWith(ListComboPositionsResponseSchema))
      .map((response) => {
        const nextCursor = response.pagination.nextCursor ?? undefined;

        return {
          items: response.combos,
          hasMore: nextCursor !== undefined,
          nextCursor,
        };
      });
  }, cursor);
}

function appendConditionId(
  searchParams: URLSearchParams,
  conditionId: z.output<typeof ComboConditionIdFilterSchema> | undefined,
): void {
  if (conditionId === undefined) {
    return;
  }

  searchParams.append(
    'market_id',
    Array.isArray(conditionId) ? conditionId.join(',') : conditionId,
  );
}

const FetchPortfolioValueRequestSchema = z.object({
  user: z.string(),
  market: z.array(z.string()).optional(),
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
 * });
 *
 * // value: Value[]
 * ```
 */
export async function fetchPortfolioValue(
  client: BaseClient,
  request: FetchPortfolioValueRequest,
): Promise<Value[]> {
  const params = parseUserInput(request, FetchPortfolioValueRequestSchema);

  return unwrap(
    client.data
      .get('/value', {
        params: toDataSearchParams(params),
      })
      .andThen(validateWith(FetchPortfolioValueResponseSchema)),
  );
}

const FetchTradedMarketCountRequestSchema = z.object({
  user: z.string(),
});

export type FetchTradedMarketCountRequest = z.input<
  typeof FetchTradedMarketCountRequestSchema
>;

export type FetchTradedMarketCountError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchTradedMarketCountError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the total number of markets a wallet has traded.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchTradedMarketCountError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const traded = await fetchTradedMarketCount(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 * });
 *
 * // traded === Traded
 * ```
 */
export async function fetchTradedMarketCount(
  client: BaseClient,
  request: FetchTradedMarketCountRequest,
): Promise<Traded> {
  const params = parseUserInput(request, FetchTradedMarketCountRequestSchema);

  return unwrap(
    client.data
      .get('/traded', {
        params: toDataSearchParams(params),
      })
      .andThen(validateWith(TradedSchema)),
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
        params: toDataSearchParams(params),
      })
      .andThen(readBlob),
  );
}

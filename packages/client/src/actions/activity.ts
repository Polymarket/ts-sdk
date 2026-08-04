import {
  ComboConditionIdSchema,
  PaginationCursorSchema,
} from '@polymarket/bindings';
import {
  type Activity,
  ActivityTypeSchema,
  type ComboActivity,
  ListActivityResponseSchema,
  ListComboActivityResponseSchema,
  ListTradesResponseSchema,
  SideSchema,
  type Trade,
} from '@polymarket/bindings/data';
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
import { snakeCase, toDataSearchParams, toSearchParams } from './params';

export { ComboActivityType } from '@polymarket/bindings/data';

const TradeFilterTypeSchema = z.enum(['CASH', 'TOKENS']);

const ListTradesRequestSchema = z
  .object({
    cursor: PaginationCursorSchema.optional(),
    // Matches the upstream per-request limit cap.
    pageSize: PageSizeSchema.max(10_000).default(20),
    takerOnly: z.boolean().optional(),
    filterType: TradeFilterTypeSchema.optional(),
    filterAmount: z.number().optional(),
    market: z.array(z.string()).optional(),
    eventId: z.array(z.number().int()).optional(),
    user: z.string().optional(),
    side: SideSchema.optional(),
    start: z.number().int().min(0).optional(),
    end: z.number().int().min(0).optional(),
  })
  .refine((value) => !(value.market && value.eventId), {
    message: 'Provide market or eventId, not both',
    path: ['eventId'],
  })
  .refine(
    (value) =>
      (value.filterType === undefined) === (value.filterAmount === undefined),
    {
      message: 'Provide filterType and filterAmount together',
      path: ['filterAmount'],
    },
  );

export type ListTradesRequest = z.input<typeof ListTradesRequestSchema>;
export type ListTradesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListTradesError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists trades for a wallet, market, or event.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListTradesError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listTrades(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: Trade[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listTrades(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   pageSize: 10,
 * });
 *
 * for await (const page of result) {
 *   // page.items: Trade[]
 * }
 * ```
 */
export function listTrades(
  client: BaseClient,
  request: ListTradesRequest = {},
): Paginated<Trade[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListTradesRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize);

    return client.data
      .get('/trades', {
        params: toDataSearchParams({
          ...params,
          limit: decoded.pageSize,
          offset: decoded.offset,
        }),
      })
      .andThen(validateWith(ListTradesResponseSchema))
      .map((trades) => {
        const hasMore = trades.length >= decoded.pageSize;

        return {
          items: trades,
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

const ActivitySortBySchema = z.enum(['TIMESTAMP', 'TOKENS', 'CASH']);
const SortDirectionSchema = z.enum(['ASC', 'DESC']);

const ListActivityRequestSchema = z
  .object({
    cursor: PaginationCursorSchema.optional(),
    // Matches the upstream per-request limit cap.
    pageSize: PageSizeSchema.max(500).default(20),
    user: z.string(),
    market: z.array(z.string()).optional(),
    eventId: z.array(z.number().int()).optional(),
    type: z.array(ActivityTypeSchema).optional(),
    start: z.number().int().min(0).optional(),
    end: z.number().int().min(0).optional(),
    sortBy: ActivitySortBySchema.optional(),
    sortDirection: SortDirectionSchema.optional(),
    side: SideSchema.optional(),
  })
  .refine((value) => !(value.market && value.eventId), {
    message: 'Provide market or eventId, not both',
    path: ['eventId'],
  });

export type ListActivityRequest = z.input<typeof ListActivityRequestSchema>;

export type ListActivityError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListActivityError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists wallet activity.
 *
 * All activity types are returned by default, including deposits and withdrawals; use the `type` filter to narrow results.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListActivityError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listActivity(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: Activity[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listActivity(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   pageSize: 10,
 * });
 *
 * for await (const page of result) {
 *   // page.items: Activity[]
 * }
 * ```
 */
export function listActivity(
  client: BaseClient,
  request: ListActivityRequest,
): Paginated<Activity[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListActivityRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize);

    return client.data
      .get('/activity', {
        params: toDataSearchParams({
          ...params,
          // The endpoint defaults excludeDepositsWithdrawals=true and drops
          // DEPOSIT and WITHDRAWAL from the type filter even when requested
          // explicitly, so opt out unconditionally and let the type filter
          // decide which rows come back.
          excludeDepositsWithdrawals: false,
          limit: decoded.pageSize,
          offset: decoded.offset,
        }),
      })
      .andThen(validateWith(ListActivityResponseSchema))
      .map((activity) => {
        const hasMore = activity.length >= decoded.pageSize;

        return {
          items: activity,
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

const ComboConditionIdFilterSchema = z.union([
  ComboConditionIdSchema,
  z.array(ComboConditionIdSchema),
]);

const ListComboActivityRequestSchema = z.object({
  cursor: PaginationCursorSchema.optional(),
  pageSize: PageSizeSchema.default(50),
  user: z.string(),
  conditionId: ComboConditionIdFilterSchema.optional(),
});

export type ListComboActivityRequest = z.input<
  typeof ListComboActivityRequestSchema
>;

export type ListComboActivityError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListComboActivityError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists combo lifecycle activity for a wallet.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListComboActivityError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listComboActivity(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: ComboActivity[]
 * }
 * ```
 */
export function listComboActivity(
  client: BaseClient,
  request: ListComboActivityRequest,
): Paginated<ComboActivity[]> {
  const { cursor, pageSize, conditionId, ...params } = parseUserInput(
    request,
    ListComboActivityRequestSchema,
  );

  return paginate((cursor) => {
    const searchParams = toSearchParams(
      {
        ...params,
        limit: pageSize,
        cursor,
      },
      snakeCase(),
    );

    appendConditionId(searchParams, conditionId);

    return client.data
      .get('/v1/activity/combos', {
        params: searchParams,
      })
      .andThen(validateWith(ListComboActivityResponseSchema))
      .map((response) => {
        const nextCursor = response.pagination.nextCursor ?? undefined;

        return {
          items: response.activity,
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

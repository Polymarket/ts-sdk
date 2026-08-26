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
  ListTradesV2ResponseSchema,
  SideSchema,
  type Trade,
  type TradeV2,
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
import { withRateLimitRetry } from '../retry';
import {
  snakeCase,
  toDataSearchParams,
  toDataV2SearchParams,
  toSearchParams,
} from './params';

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

const TradeV2FilterTypeSchema = z.enum(['CASH', 'TOKENS']);

const ListTradesV2RequestSchema = z
  .object({
    cursor: PaginationCursorSchema.optional(),
    // The service default; anything past 1000 is rejected, not clamped.
    pageSize: PageSizeSchema.max(1000).default(100),
    // Empty filters are rejected rather than sent: the service reads an empty
    // `user` as absent and keys routing on `market`/`event_id` presence, so
    // forwarding them would silently widen the request to the global feed.
    user: z.string().min(1).optional(),
    takerOnly: z.boolean().optional(),
    // Unlike v1, either filter field may be sent alone (verified 200 live):
    // the service always applies the dust filter, defaulting the missing half
    // (TOKENS / 0.01) — so a both-or-neither rule here would reject requests
    // the service answers.
    filterType: TradeV2FilterTypeSchema.optional(),
    filterAmount: z.number().min(0).optional(),
    market: z.array(z.string().min(1)).min(1).optional(),
    eventId: z.array(z.number().int()).min(1).optional(),
    side: SideSchema.optional(),
    start: z.number().int().min(0).optional(),
    end: z.number().int().min(0).optional(),
  })
  .refine((value) => !(value.market && value.eventId), {
    message: 'Provide market or eventId, not both',
    path: ['eventId'],
  })
  // A zero `end` means unbounded, mirroring the service.
  .refine((value) => !value.end || value.end >= (value.start ?? 0), {
    message: 'end must not precede start',
    path: ['end'],
  });

export type ListTradesV2Request = z.input<typeof ListTradesV2RequestSchema>;
export type ListTradesV2Error =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListTradesV2Error = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists trades with exact continuation signals — for a wallet, market, event,
 * or the global feed when no filter is given.
 *
 * Pagination is cursor-only: `hasMore` is exact and `nextCursor` is
 * server-minted, so the end of the collection never costs an extra request
 * and there is no page-size probing. Every page re-sends the original
 * filters — the cursor carries only the paging anchor, and continuing it
 * under different filters is not expressible through this function.
 *
 * Defaults are the service's: `pageSize` is 100 (at most 1000 — larger values
 * are rejected, not clamped), only the taker side of each match is returned
 * (`takerOnly: false` includes maker rows), and a dust filter of 0.01 shares
 * applies unless `filterType`/`filterAmount` say otherwise — either may be
 * sent alone, and the service fills the other half in. An omitted window
 * serves the recent feed; `start`/`end` are Unix seconds. Transient rate
 * limits are absorbed by retrying after the server-requested delay.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListTradesV2Error}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listTradesV2(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: TradeV2[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listTradesV2(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   pageSize: 10,
 * });
 *
 * for await (const page of result) {
 *   // page.items: TradeV2[]
 * }
 * ```
 */
export function listTradesV2(
  client: BaseClient,
  request: ListTradesV2Request = {},
): Paginated<TradeV2[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListTradesV2RequestSchema,
  );

  return paginate(
    (cursor) =>
      withRateLimitRetry(() =>
        client.data.get('/v2/trades', {
          // The full original filter set rides along with every cursor: the
          // cursor binds only its paging anchor, and a filter dropped on a
          // follow-up page would silently widen the result set.
          params: toDataV2SearchParams({ ...params, limit: pageSize, cursor }),
        }),
      ).andThen(validateWith(ListTradesV2ResponseSchema)),
    cursor,
  );
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

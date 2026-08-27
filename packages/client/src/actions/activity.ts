import {
  ComboConditionIdSchema,
  ConditionIdSchema,
  EventIdSchema,
  EvmAddressSchema,
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
import { PageSizeSchema, type Paginated, paginate } from '../pagination';
import { validateWith } from '../response';
import { withRateLimitRetry } from '../retry';
import { distinctIdList, TimeWindowSchema, toDataSearchParams } from './params';

export { ComboActivityType } from '@polymarket/bindings/data';

const TradeFilterTypeSchema = z.enum(['CASH', 'TOKENS']);

const ListTradesRequestSchema = z
  .object({
    cursor: PaginationCursorSchema.optional(),
    // The service default; anything past 1000 is rejected, not clamped.
    pageSize: PageSizeSchema.max(1000).default(100),
    // Branded input schemas double as the guard against silent widening: the
    // service reads a malformed/empty `user` as absent and keys routing on
    // `condition`/`event_id` presence, so a bad filter forwarded raw would
    // quietly serve the global feed. The empty-array min(1)s exist for the
    // same reason.
    user: EvmAddressSchema.optional(),
    takerOnly: z.boolean().optional(),
    // Unlike v1, either filter field may be sent alone (verified 200 live):
    // the service always applies the dust filter, defaulting the missing half
    // (TOKENS / 0.01) — so a both-or-neither rule here would reject requests
    // the service answers.
    filterType: TradeFilterTypeSchema.optional(),
    filterAmount: z.number().min(0).optional(),
    // Encodes to `condition_id`, an accepted alias of the canonical
    // `condition` key. The service dedupes and then caps the selector at 20
    // DISTINCT ids (DENG-588) — mirror both halves here so the cap error
    // stays typed.
    conditionId: z
      .union([ConditionIdSchema, distinctIdList(ConditionIdSchema, 20)])
      .optional(),
    eventId: z.array(EventIdSchema).min(1).optional(),
    side: SideSchema.optional(),
    window: TimeWindowSchema.optional(),
  })
  .refine((value) => !(value.conditionId && value.eventId), {
    message: 'Provide conditionId or eventId, not both',
    path: ['eventId'],
  });

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
 * Lists trades for a wallet, market, or event — or the global recent-trades
 * feed when no filter is given.
 *
 * Only the taker side of each match is returned by default
 * (`takerOnly: false` includes maker rows), and a dust filter of 0.01 shares
 * applies unless `filterType`/`filterAmount` say otherwise — either may be
 * sent alone. `conditionId` accepts at most 20 distinct ids. `pageSize`
 * defaults to 100 (max 1000). `window: 'full'` requests the complete
 * history; an omitted window serves the recent feed. Transient rate limits
 * are retried automatically.
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
 *   window: 'full',
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
  const { cursor, pageSize, window, ...params } = parseUserInput(
    request,
    ListTradesRequestSchema,
  );

  return paginate(
    (cursor) =>
      withRateLimitRetry(() =>
        client.data.get('/v2/trades', {
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
      ).andThen(validateWith(ListTradesResponseSchema)),
    cursor,
  );
}

const SortDirectionSchema = z.enum(['ASC', 'DESC']);

const ListActivityRequestSchema = z
  .object({
    cursor: PaginationCursorSchema.optional(),
    // The service default; anything past 1000 is rejected, not clamped.
    pageSize: PageSizeSchema.max(1000).default(100),
    /** The feed is wallet-anchored — `user` is required. */
    user: EvmAddressSchema,
    // The service dedupes and then caps every condition selector at 20
    // DISTINCT ids (one shared parser across the surface) — mirror both
    // halves here so the cap error stays typed.
    conditionId: z
      .union([ConditionIdSchema, distinctIdList(ConditionIdSchema, 20)])
      .optional(),
    eventId: z.array(EventIdSchema).min(1).optional(),
    type: z.array(ActivityTypeSchema).min(1).optional(),
    side: SideSchema.optional(),
    /** `DESC` (default) walks newest-first; `ASC` oldest-first. */
    sortDirection: SortDirectionSchema.optional(),
    window: TimeWindowSchema.optional(),
  })
  .refine((value) => !(value.conditionId && value.eventId), {
    message: 'Provide conditionId or eventId, not both',
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
 * Lists wallet activity, newest-first by default.
 *
 * Every activity type the service serves is included by default — deposits
 * and withdrawals are not filtered out; use the `type` filter to narrow
 * results. `window: 'full'`
 * requests the complete history (an omitted window serves the service's
 * default range — the most recent three years). `pageSize` defaults to 100
 * (max 1000). Transient rate limits are retried automatically.
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
 * Loop through the complete history with `for await`:
 * ```ts
 * const result = listActivity(client, {
 *   user: '0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b',
 *   window: 'full',
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
  const { cursor, pageSize, window, ...params } = parseUserInput(
    request,
    ListActivityRequestSchema,
  );

  return paginate(
    (cursor) =>
      withRateLimitRetry(() =>
        client.data.get('/v2/activity', {
          params: toDataSearchParams({
            ...params,
            ...window,
            // The service defaults exclude_deposits_withdrawals=true; opt out
            // unconditionally and let the type filter decide which rows come
            // back.
            excludeDepositsWithdrawals: false,
            limit: pageSize,
            cursor,
          }),
        }),
      ).andThen(validateWith(ListActivityResponseSchema)),
    cursor,
  );
}

const ListComboActivityRequestSchema = z.object({
  cursor: PaginationCursorSchema.optional(),
  // The service default; anything past 1000 is rejected, not clamped.
  pageSize: PageSizeSchema.max(1000).default(100),
  /** The feed is wallet-anchored — `user` is required. */
  user: EvmAddressSchema,
  // Same shared 20-DISTINCT service cap as the other condition selectors.
  conditionId: z
    .union([ComboConditionIdSchema, distinctIdList(ComboConditionIdSchema, 20)])
    .optional(),
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
 * Lists Combo lifecycle activity for a wallet, ordered by on-chain position.
 *
 * Every row carries the Combo position id and its legs enriched with market
 * metadata; redeem rows additionally carry payout semantics. `pageSize`
 * defaults to 100 (max 1000). Transient rate limits are retried
 * automatically.
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
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListComboActivityRequestSchema,
  );

  return paginate(
    (cursor) =>
      withRateLimitRetry(() =>
        client.data.get('/v2/activity/combos', {
          params: toDataSearchParams({ ...params, limit: pageSize, cursor }),
        }),
      ).andThen(validateWith(ListComboActivityResponseSchema)),
    cursor,
  );
}

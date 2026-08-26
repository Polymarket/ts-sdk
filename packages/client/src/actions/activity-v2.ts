import { PaginationCursorSchema } from '@polymarket/bindings';
import {
  ListTradesV2ResponseSchema,
  SideSchema,
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
import { PageSizeSchema, type Paginated, paginate } from '../pagination';
import { validateWith } from '../response';
import { withRateLimitRetry } from '../retry';
import { toDataV2SearchParams } from './params';

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

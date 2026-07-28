import {
  BuilderCodeSchema,
  PaginationCursorSchema,
  toPaginationCursor,
} from '@polymarket/bindings';
import {
  type BuilderTrade,
  END_CURSOR,
  PaginatedBuilderTradesSchema,
} from '@polymarket/bindings/clob';
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
import { type Paginated, paginate } from '../pagination';
import { validateWith } from '../response';
import { snakeCase, toSearchParams } from './params';

const ListBuilderTradesRequestSchema = z.object({
  after: z.string().optional(),
  before: z.string().optional(),
  builderCode: BuilderCodeSchema,
  cursor: PaginationCursorSchema.optional(),
  id: z.string().optional(),
  market: z.string().optional(),
  tokenId: z.string().optional(),
});

export type ListBuilderTradesRequest = z.input<
  typeof ListBuilderTradesRequestSchema
>;

export type ListBuilderTradesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListBuilderTradesError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists builder-attributed trades.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListBuilderTradesError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listBuilderTrades(client);
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: BuilderTrade[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listBuilderTrades(client);
 *
 * for await (const page of result) {
 *   // page.items: BuilderTrade[]
 * }
 * ```
 */
export function listBuilderTrades(
  client: BaseClient,
  request: ListBuilderTradesRequest,
): Paginated<BuilderTrade[]> {
  const { cursor, ...params } = parseUserInput(
    request,
    ListBuilderTradesRequestSchema,
  );

  return paginate(
    (nextCursor) =>
      client.clob
        .get('/builder/trades', {
          params: toSearchParams(
            { ...params, nextCursor },
            snakeCase({
              builderCode: 'builder_code',
              tokenId: 'asset_id',
            }),
          ),
        })
        .andThen(validateWith(PaginatedBuilderTradesSchema))
        .map((response) => ({
          items: response.data,
          hasMore: response.nextCursor !== END_CURSOR,
          nextCursor:
            response.nextCursor === END_CURSOR
              ? undefined
              : toPaginationCursor(response.nextCursor),
        })),
    cursor,
  );
}

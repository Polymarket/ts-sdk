import { PaginationCursorSchema } from '@polymarket/bindings';
import {
  ListMarketClarificationsResponseSchema,
  type MarketClarification,
  MarketClarificationState,
} from '@polymarket/bindings/gamma';
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
import { snakeCase, toSearchParams } from './params';

const ListMarketClarificationsRequestSchema = z.object({
  marketId: z.union([z.string(), z.array(z.string())]).optional(),
  eventId: z.union([z.string(), z.array(z.string())]).optional(),
  questionId: z.union([z.string(), z.array(z.string())]).optional(),
  state: z
    .union([
      z.enum(MarketClarificationState),
      z.array(z.enum(MarketClarificationState)),
    ])
    .optional(),
  showInFrontend: z.boolean().optional(),
  txHash: z.string().optional(),
  order: z.string().optional(),
  ascending: z.boolean().optional(),
  cursor: PaginationCursorSchema.optional(),
  // Matches the upstream per-request limit cap.
  pageSize: PageSizeSchema.max(100).default(20),
});

export type ListMarketClarificationsRequest = z.input<
  typeof ListMarketClarificationsRequestSchema
>;

export type ListMarketClarificationsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListMarketClarificationsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists market clarifications — official notes that resolve ambiguity in how a
 * market settles.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListMarketClarificationsError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listMarketClarifications(client, {
 *   marketId: '512038',
 *   pageSize: 25,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: MarketClarification[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listMarketClarifications(client, {
 *   marketId: '512038',
 * });
 *
 * for await (const page of result) {
 *   // page.items: MarketClarification[]
 * }
 * ```
 */
export function listMarketClarifications(
  client: BaseClient,
  request: ListMarketClarificationsRequest = {},
): Paginated<MarketClarification[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListMarketClarificationsRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize);

    return client.gamma
      .get('/market-clarifications', {
        params: toSearchParams(
          {
            ...params,
            limit: decoded.pageSize,
            offset: decoded.offset,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(ListMarketClarificationsResponseSchema))
      .map((clarifications) => {
        const hasMore = clarifications.length >= decoded.pageSize;

        return {
          items: clarifications,
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

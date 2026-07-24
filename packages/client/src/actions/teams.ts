import { PaginationCursorSchema } from '@polymarket/bindings';
import { ListTeamsResponseSchema, type Team } from '@polymarket/bindings/gamma';
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

const ListTeamsRequestSchema = z.object({
  abbreviation: z.array(z.string()).optional(),
  ascending: z.boolean().optional(),
  cursor: PaginationCursorSchema.optional(),
  league: z.array(z.string()).optional(),
  name: z.array(z.string()).optional(),
  order: z.string().optional(),
  // Matches the upstream per-request limit cap.
  pageSize: PageSizeSchema.max(100).default(20),
  providerId: z.array(z.number().int()).optional(),
});

export type ListTeamsRequest = z.input<typeof ListTeamsRequestSchema>;

export type ListTeamsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListTeamsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists teams.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListTeamsError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listTeams(client, {
 *   league: ['NBA'],
 *   pageSize: 10,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: Team[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listTeams(client, {
 *   league: ['NBA'],
 *   pageSize: 10,
 * });
 *
 * for await (const page of result) {
 *   // page.items: Team[]
 * }
 * ```
 */
export function listTeams(
  client: BaseClient,
  request: ListTeamsRequest = {},
): Paginated<Team[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListTeamsRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize);

    return client.gamma
      .get('/teams', {
        params: toSearchParams(
          {
            ...params,
            limit: decoded.pageSize,
            offset: decoded.offset,
          },
          snakeCase({ providerId: 'provider_id' }),
        ),
      })
      .andThen(validateWith(ListTeamsResponseSchema))
      .map((teams) => {
        const hasMore = teams.length >= decoded.pageSize;

        return {
          items: teams,
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

import {
  CommentIdSchema,
  CommentParentEntityTypeSchema,
  EventIdSchema,
  PaginationCursorSchema,
} from '@polymarket/bindings';
import {
  type Comment,
  ListCommentsResponseSchema,
  SeriesIdSchema,
} from '@polymarket/bindings/gamma';
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
import { validateWith } from '../response';
import { snakeCase, toSearchParams } from './params';

const ListCommentsRequestSchema = z.object({
  ascending: z.boolean().optional(),
  cursor: PaginationCursorSchema.optional(),
  // Matches the upstream per-request limit cap.
  pageSize: PageSizeSchema.max(100).default(20),
  getPositions: z.boolean().optional(),
  holdersOnly: z.boolean().optional(),
  order: z.string().optional(),
  parentEntityId: z.union([EventIdSchema, SeriesIdSchema]),
  parentEntityType: CommentParentEntityTypeSchema,
});

const FetchCommentsByIdRequestSchema = z.object({
  getPositions: z.boolean().optional(),
  id: CommentIdSchema,
});

const ListCommentsByUserAddressRequestSchema = z.object({
  address: z.string(),
  ascending: z.boolean().optional(),
  cursor: PaginationCursorSchema.optional(),
  order: z.string().optional(),
  // Matches the upstream per-request limit cap.
  pageSize: PageSizeSchema.max(100).default(20),
});

export type ListCommentsRequest = z.input<typeof ListCommentsRequestSchema>;
export type FetchCommentsByIdRequest = z.input<
  typeof FetchCommentsByIdRequestSchema
>;
export type ListCommentsByUserAddressRequest = z.input<
  typeof ListCommentsByUserAddressRequestSchema
>;

export type ListCommentsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListCommentsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists comments for an event or series.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListCommentsError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listComments(client, {
 *   parentEntityId: '123',
 *   parentEntityType: CommentParentEntityType.Event,
 *   pageSize: 20,
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: Comment[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listComments(client, {
 *   parentEntityId: '123',
 *   parentEntityType: CommentParentEntityType.Event,
 *   pageSize: 20,
 * });
 *
 * for await (const page of result) {
 *   // page.items: Comment[]
 * }
 * ```
 */
export function listComments(
  client: BaseClient,
  request: ListCommentsRequest,
): Paginated<Comment[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListCommentsRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize);

    return client.gamma
      .get('/comments', {
        params: toSearchParams(
          {
            ascending: params.ascending,
            getPositions: params.getPositions,
            holdersOnly: params.holdersOnly,
            limit: decoded.pageSize,
            offset: decoded.offset,
            order: params.order,
            parentEntityId: params.parentEntityId,
            parentEntityType: params.parentEntityType,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(ListCommentsResponseSchema))
      .map((comments) => {
        const hasMore = comments.length >= decoded.pageSize;

        return {
          items: comments,
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

export type FetchCommentsByIdError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchCommentsByIdError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches a comment thread by comment id.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchCommentsByIdError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const thread = await fetchCommentsById(client, {
 *   id: '456',
 *   getPositions: true,
 * });
 *
 * // thread: Comment[]
 * ```
 */
export async function fetchCommentsById(
  client: BaseClient,
  request: FetchCommentsByIdRequest,
): Promise<Comment[]> {
  const params = parseUserInput(request, FetchCommentsByIdRequestSchema);

  return unwrap(
    client.gamma
      .get(`comments/${params.id}`, {
        params: toSearchParams(
          {
            getPositions: params.getPositions,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(ListCommentsResponseSchema)),
  );
}

export type ListCommentsByUserAddressError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListCommentsByUserAddressError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists comments written by a wallet address.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListCommentsByUserAddressError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listCommentsByUserAddress(client, {
 *   address: '0x1234...',
 *   pageSize: 10,
 *   order: 'DESC',
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: Comment[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listCommentsByUserAddress(client, {
 *   address: '0x1234...',
 *   pageSize: 10,
 *   order: 'DESC',
 * });
 *
 * for await (const page of result) {
 *   // page.items: Comment[]
 * }
 * ```
 */
export function listCommentsByUserAddress(
  client: BaseClient,
  request: ListCommentsByUserAddressRequest,
): Paginated<Comment[]> {
  const { address, cursor, pageSize, ...params } = parseUserInput(
    request,
    ListCommentsByUserAddressRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize);

    return client.gamma
      .get(`comments/user_address/${address}`, {
        params: toSearchParams(
          {
            ascending: params.ascending,
            limit: decoded.pageSize,
            offset: decoded.offset,
            order: params.order,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(ListCommentsResponseSchema))
      .map((comments) => {
        const hasMore = comments.length >= decoded.pageSize;

        return {
          items: comments,
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

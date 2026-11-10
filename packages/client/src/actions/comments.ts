import {
  CommentIdSchema,
  type CommentParentEntityType,
  CommentParentEntityTypeSchema,
  type EventId,
  EventIdSchema,
  type PaginationCursor,
  PaginationCursorSchema,
  type SeriesId,
} from '@polymarket/bindings';
import {
  type Comment,
  ListCommentsKeysetResponseSchema,
  ListCommentsResponseSchema,
  SeriesIdSchema,
} from '@polymarket/bindings/gamma';
import { z } from 'zod';
import type { BaseClient } from '../clients';
import {
  makeErrorGuard,
  PaginationLimitError,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import {
  decodeOffsetCursor,
  encodeKeysetCursor,
  encodeOffsetCursor,
  keysetCursorFromPayload,
  PageSizeSchema,
  type Paginated,
  paginate,
  readCursorPayload,
} from '../pagination';
import { parseRequestOptions, type RequestOptions } from '../request-options';
import { snakeCase, toSearchParams } from './params';

// Matches the upstream per-request limit cap on the comments listings and the
// offset cap on the by-address listing, which rejects pages past it.
const MAX_COMMENTS_PAGE_SIZE = 100;
const MAX_COMMENTS_OFFSET = 200;
const COMMENT_CURSOR_LIMITS = {
  maxOffset: MAX_COMMENTS_OFFSET,
  maxPageSize: MAX_COMMENTS_PAGE_SIZE,
};

/** The orders a parent-entity comments listing can page by. */
export enum CommentSort {
  Id = 'id',
  CreatedAt = 'createdAt',
}

const ListCommentsRequestSchema = z.object({
  ascending: z.boolean().optional(),
  cursor: PaginationCursorSchema.optional(),
  pageSize: PageSizeSchema.max(MAX_COMMENTS_PAGE_SIZE).default(20),
  order: z.enum(CommentSort).optional(),
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
  pageSize: PageSizeSchema.max(MAX_COMMENTS_PAGE_SIZE).default(20),
});

export type ListCommentsRequest = z.input<typeof ListCommentsRequestSchema>;
export type FetchCommentsByIdRequest = z.input<
  typeof FetchCommentsByIdRequestSchema
>;
export type ListCommentsByUserAddressRequest = z.input<
  typeof ListCommentsByUserAddressRequestSchema
>;

export type ListCommentsError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListCommentsError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

type ListCommentsParams = Omit<
  z.output<typeof ListCommentsRequestSchema>,
  'cursor' | 'pageSize'
>;

type CommentsQuery = {
  ascending: boolean;
  order: CommentSort;
  parentEntityId: EventId | SeriesId;
  parentEntityType: CommentParentEntityType;
};

/**
 * Builds the exact query every page of a parent-entity listing sends. Without
 * `order` the listing serves newest first, so the direction is pinned to
 * descending creation time. With `order` it defaults to ascending.
 */
function toCommentsQuery(params: ListCommentsParams): CommentsQuery {
  if (params.order === undefined) {
    return {
      ascending: false,
      order: CommentSort.CreatedAt,
      parentEntityId: params.parentEntityId,
      parentEntityType: params.parentEntityType,
    };
  }

  return {
    ascending: params.ascending ?? true,
    order: params.order,
    parentEntityId: params.parentEntityId,
    parentEntityType: params.parentEntityType,
  };
}

/**
 * Lists comments for an event or series.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * Without `order`, pages are newest first and `ascending` is ignored. With
 * `order`, pages are ascending unless `ascending` is `false`.
 *
 * Pages continue through the whole thread. Their cursors continue that exact
 * query and are rejected for a different parent, order or direction.
 *
 * `pageSize` counts top-level comments; replies ride along in the same page.
 * A thread ending exactly on a page boundary may return one final empty page.
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
  options: RequestOptions = {},
): Paginated<Comment[]> {
  const requestOptions = parseRequestOptions(options);
  const {
    cursor: initialCursor,
    pageSize,
    ...params
  } = parseUserInput(request, ListCommentsRequestSchema);
  const query = toCommentsQuery(params);

  return paginate(
    (cursor) =>
      client.predictions
        .get('/v1/comments', {
          schema: ListCommentsKeysetResponseSchema,
          ...requestOptions,
          params: toSearchParams(
            {
              afterCursor:
                cursor === undefined
                  ? undefined
                  : toCommentsCursor(cursor, query),
              ascending: query.ascending,
              limit: pageSize,
              order: query.order,
              parentEntityId: query.parentEntityId,
              parentEntityType: query.parentEntityType,
            },
            snakeCase(),
          ),
        })
        .then((response) => ({
          items: response.items,
          hasMore: response.nextCursor !== undefined,
          nextCursor:
            response.nextCursor === undefined
              ? undefined
              : encodeKeysetCursor(response.nextCursor, query),
        })),
    initialCursor,
  );
}

// Only cursors this listing minted for the same query continue. Offset
// cursors from earlier versions cannot resume a cursor walk.
function toCommentsCursor(
  cursor: PaginationCursor,
  query: CommentsQuery,
): PaginationCursor {
  const afterCursor = keysetCursorFromPayload(readCursorPayload(cursor), query);

  if (afterCursor === undefined) {
    throw new UserInputError('Invalid pagination cursor');
  }

  return afterCursor;
}

export type FetchCommentsByIdError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchCommentsByIdError = makeErrorGuard(
  RequestAbortedError,
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
  options: RequestOptions = {},
): Promise<Comment[]> {
  const requestOptions = parseRequestOptions(options);
  const params = parseUserInput(request, FetchCommentsByIdRequestSchema);

  return client.predictions.get(`/v1/comments/${params.id}`, {
    schema: ListCommentsResponseSchema,
    ...requestOptions,
    params: toSearchParams(
      {
        getPositions: params.getPositions,
      },
      snakeCase(),
    ),
  });
}

export type ListCommentsByUserAddressError =
  | RequestAbortedError
  | PaginationLimitError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListCommentsByUserAddressError = makeErrorGuard(
  RequestAbortedError,
  PaginationLimitError,
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
 * Pages starting past offset 200 are not served. Automatic iteration yields
 * the last accessible full page with `limitReached: true` and stops normally;
 * `hasMore` stays true because completeness cannot be established. Explicitly
 * following its cursor throws {@link PaginationLimitError} before any request.
 *
 * This is a hard stop for this listing: there are no range filters to retrieve
 * the remaining comments.
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
 *   order: 'createdAt',
 *   ascending: false,
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
 *   order: 'createdAt',
 *   ascending: false,
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
  options: RequestOptions = {},
): Paginated<Comment[]> {
  const requestOptions = parseRequestOptions(options);
  const { address, cursor, pageSize, ...params } = parseUserInput(
    request,
    ListCommentsByUserAddressRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize, COMMENT_CURSOR_LIMITS);

    return client.predictions
      .get(`/v1/users/${address}/comments`, {
        schema: ListCommentsResponseSchema,
        ...requestOptions,
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
      .then((comments) => {
        const hasMore = comments.length >= decoded.pageSize;

        return {
          items: comments,
          hasMore,
          limitReached:
            hasMore && decoded.offset + decoded.pageSize > MAX_COMMENTS_OFFSET,
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

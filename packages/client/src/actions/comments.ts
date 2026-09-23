import {
  CommentIdSchema,
  CommentParentEntityTypeSchema,
  EventIdSchema,
  type PaginationCursor,
  PaginationCursorSchema,
} from '@polymarket/bindings';
import {
  type Comment,
  ListCommentsKeysetResponseSchema,
  ListCommentsResponseSchema,
  SeriesIdSchema,
} from '@polymarket/bindings/gamma';
import { invariant, type ResultAsync, unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseClient } from '../clients';
import {
  makeErrorGuard,
  PaginationLimitError,
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
  type Page,
  PageSizeSchema,
  type Paginated,
  paginate,
} from '../pagination';
import { validateWith } from '../response';
import {
  assertKeysetCommentsCursorMatches,
  COMMENT_CURSOR_LIMITS,
  decodeCommentsCursor,
  encodeKeysetCommentsCursor,
  type KeysetCommentsQuery,
  MAX_COMMENTS_PAGE_SIZE,
  toKeysetCommentsQuery,
} from './comments-pagination';
import { snakeCase, toSearchParams } from './params';

const ListCommentsRequestSchema = z.object({
  ascending: z.boolean().optional(),
  cursor: PaginationCursorSchema.optional(),
  pageSize: PageSizeSchema.max(MAX_COMMENTS_PAGE_SIZE).default(20),
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
  | PaginationLimitError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListCommentsError = makeErrorGuard(
  PaginationLimitError,
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
 * Without `order`, pages are newest first and `ascending` is ignored. With
 * `order` (`id` or `createdAt`), pages are ascending unless `ascending` is
 * `false`.
 *
 * Reads without `holdersOnly` or `getPositions` and with one of those orders
 * page through the whole thread. Their cursors continue that exact query and
 * are rejected for a different parent, order or direction. Reads with
 * `holdersOnly`, `getPositions` or another order serve pages up to offset 200;
 * following a cursor past that point throws {@link PaginationLimitError}
 * before any request is sent. Cursors saved from earlier versions keep working
 * with the same arguments.
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
): Paginated<Comment[]> {
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListCommentsRequestSchema,
  );
  const keysetQuery = toKeysetCommentsQuery(params);

  return paginate((cursor) => {
    if (cursor === undefined) {
      return keysetQuery === undefined
        ? fetchCommentsOffsetPage(client, params, { offset: 0, pageSize })
        : fetchCommentsKeysetPage(client, keysetQuery, pageSize);
    }

    const state = decodeCommentsCursor(cursor, pageSize);

    if (state.kind === 'offset') {
      return fetchCommentsOffsetPage(client, params, state);
    }

    assertKeysetCommentsCursorMatches(state, keysetQuery);
    invariant(keysetQuery !== undefined, 'Expected a cursor-paginated query.');

    return fetchCommentsKeysetPage(client, keysetQuery, pageSize, state.cursor);
  }, cursor);
}

type ListCommentsParams = Omit<
  z.output<typeof ListCommentsRequestSchema>,
  'cursor' | 'pageSize'
>;

type ListCommentsPageError = Exclude<ListCommentsError, PaginationLimitError>;

function fetchCommentsOffsetPage(
  client: BaseClient,
  params: ListCommentsParams,
  page: { offset: number; pageSize: number },
): ResultAsync<Page<Comment[]>, ListCommentsPageError> {
  return client.gamma
    .get('/comments', {
      params: toSearchParams(
        {
          ascending: params.ascending,
          getPositions: params.getPositions,
          holdersOnly: params.holdersOnly,
          limit: page.pageSize,
          offset: page.offset,
          order: params.order,
          parentEntityId: params.parentEntityId,
          parentEntityType: params.parentEntityType,
        },
        snakeCase(),
      ),
    })
    .andThen(validateWith(ListCommentsResponseSchema))
    .map((comments) => {
      // The page size bounds top-level comments; their replies ride along
      // in the same array, so count the roots to judge whether the page
      // was full.
      const rootCount = comments.filter(
        (comment) => comment.parentCommentID == null,
      ).length;
      const hasMore = rootCount >= page.pageSize;

      return {
        items: comments,
        hasMore,
        nextCursor: hasMore
          ? encodeOffsetCursor({
              offset: page.offset + page.pageSize,
              pageSize: page.pageSize,
            })
          : undefined,
      };
    });
}

function fetchCommentsKeysetPage(
  client: BaseClient,
  query: KeysetCommentsQuery,
  pageSize: number,
  afterCursor?: PaginationCursor,
): ResultAsync<Page<Comment[]>, ListCommentsPageError> {
  return client.gamma
    .get('/comments/keyset', {
      params: toSearchParams(
        {
          afterCursor,
          ascending: query.ascending,
          limit: pageSize,
          order: query.order,
          parentEntityId: query.parentEntityId,
          parentEntityType: query.parentEntityType,
        },
        snakeCase(),
      ),
    })
    .andThen(validateWith(ListCommentsKeysetResponseSchema))
    .map((response) => ({
      items: response.items,
      hasMore: response.nextCursor !== undefined,
      nextCursor:
        response.nextCursor === undefined
          ? undefined
          : encodeKeysetCommentsCursor(response.nextCursor, query),
    }));
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
  | PaginationLimitError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListCommentsByUserAddressError = makeErrorGuard(
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
 * Pages starting past offset 200 are not served. Following a cursor past that
 * point throws {@link PaginationLimitError} before any request is sent; the
 * pages already returned stay valid.
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
): Paginated<Comment[]> {
  const { address, cursor, pageSize, ...params } = parseUserInput(
    request,
    ListCommentsByUserAddressRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize, COMMENT_CURSOR_LIMITS);

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

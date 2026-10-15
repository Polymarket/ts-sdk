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
import { type ResultAsync, unwrap } from '@polymarket/types';
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
  offsetCursorFromPayload,
  type Page,
  PageSizeSchema,
  type Paginated,
  paginate,
  readCursorPayload,
} from '../pagination';
import type { RequestOptions } from '../request-options';
import { validateWith } from '../response';
import { snakeCase, toSearchParams } from './params';

// Matches the upstream per-request limit cap and offset cap on the comments
// listings; pages starting past the offset cap are rejected upstream.
const MAX_COMMENTS_PAGE_SIZE = 100;
const MAX_COMMENTS_OFFSET = 200;
const COMMENT_CURSOR_LIMITS = {
  maxOffset: MAX_COMMENTS_OFFSET,
  maxPageSize: MAX_COMMENTS_PAGE_SIZE,
};

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
  | RequestAbortedError
  | PaginationLimitError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListCommentsError = makeErrorGuard(
  RequestAbortedError,
  PaginationLimitError,
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

/** The orders the cursor-paginated comments listing accepts. */
const KeysetCommentOrderSchema = z.enum(['id', 'createdAt']);

type KeysetCommentOrder = z.infer<typeof KeysetCommentOrderSchema>;

type KeysetCommentsQuery = {
  ascending: boolean;
  order: KeysetCommentOrder;
  parentEntityId: EventId | SeriesId;
  parentEntityType: CommentParentEntityType;
};

/**
 * Decides whether a parent-entity comments read can page by server cursor and,
 * if so, the exact query to send. Reads that filter by holders, include
 * positions or sort by anything other than `id`/`createdAt` stay on offset
 * pages, where the service still honours those options.
 *
 * Without `order` the offset listing serves newest first and ignores
 * `ascending`; the cursor listing defaults to oldest first, so the direction
 * is pinned explicitly to keep the first page identical. With `order` both
 * listings default to ascending.
 */
function toKeysetCommentsQuery(
  params: ListCommentsParams,
): KeysetCommentsQuery | undefined {
  if (params.holdersOnly === true || params.getPositions === true) {
    return undefined;
  }

  if (params.order === undefined) {
    return {
      ascending: false,
      order: 'createdAt',
      parentEntityId: params.parentEntityId,
      parentEntityType: params.parentEntityType,
    };
  }

  const order = KeysetCommentOrderSchema.safeParse(params.order);

  if (!order.success) {
    return undefined;
  }

  return {
    ascending: params.ascending ?? true,
    order: order.data,
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
 * `order` (`id` or `createdAt`), pages are ascending unless `ascending` is
 * `false`.
 *
 * Reads without `holdersOnly` or `getPositions` and with one of those orders
 * page through the whole thread. Their cursors continue that exact query and
 * are rejected for a different parent, order or direction.
 *
 * Reads with `holdersOnly`, `getPositions` or another order serve pages up to
 * offset 200. Automatic iteration yields the last accessible full page with
 * `limitReached: true` and stops normally; `hasMore` stays true because
 * completeness cannot be established. Explicitly following its cursor throws
 * {@link PaginationLimitError} before any request. Cursors saved from earlier
 * versions keep working with the same arguments.
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
  const { cursor, pageSize, ...params } = parseUserInput(
    request,
    ListCommentsRequestSchema,
  );
  const keysetQuery = toKeysetCommentsQuery(params);

  return paginate((cursor) => {
    if (cursor === undefined) {
      return keysetQuery === undefined
        ? fetchCommentsOffsetPage(
            client,
            params,
            { offset: 0, pageSize },
            options,
          )
        : fetchCommentsKeysetPage(
            client,
            keysetQuery,
            pageSize,
            undefined,
            options,
          );
    }

    // Cursors minted before cursor pagination carry only offset state and
    // continue on offset pages under the same limits as before.
    const payload = readCursorPayload(cursor);
    if (payload === undefined) {
      throw new UserInputError('Invalid pagination cursor');
    }

    const afterCursor = keysetCursorFromPayload(payload, keysetQuery);
    if (afterCursor === undefined || keysetQuery === undefined) {
      return fetchCommentsOffsetPage(
        client,
        params,
        offsetCursorFromPayload(payload, COMMENT_CURSOR_LIMITS),
        options,
      );
    }

    return fetchCommentsKeysetPage(
      client,
      keysetQuery,
      pageSize,
      afterCursor,
      options,
    );
  }, cursor);
}

type ListCommentsPageError = Exclude<ListCommentsError, PaginationLimitError>;

function fetchCommentsOffsetPage(
  client: BaseClient,
  params: ListCommentsParams,
  page: { offset: number; pageSize: number },
  options: RequestOptions = {},
): ResultAsync<Page<Comment[]>, ListCommentsPageError> {
  return client.gamma
    .get('/comments', {
      signal: options.signal,
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
    .andThen(validateWith(ListCommentsResponseSchema, options))
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
        limitReached:
          hasMore && page.offset + page.pageSize > MAX_COMMENTS_OFFSET,
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
  options: RequestOptions = {},
): ResultAsync<Page<Comment[]>, ListCommentsPageError> {
  return client.gamma
    .get('/comments/keyset', {
      signal: options.signal,
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
    .andThen(validateWith(ListCommentsKeysetResponseSchema, options))
    .map((response) => ({
      items: response.items,
      hasMore: response.nextCursor !== undefined,
      nextCursor:
        response.nextCursor === undefined
          ? undefined
          : encodeKeysetCursor(response.nextCursor, query),
    }));
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
  const params = parseUserInput(request, FetchCommentsByIdRequestSchema);

  return unwrap(
    client.gamma
      .get(`comments/${params.id}`, {
        signal: options.signal,
        params: toSearchParams(
          {
            getPositions: params.getPositions,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(ListCommentsResponseSchema, options)),
  );
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
  const { address, cursor, pageSize, ...params } = parseUserInput(
    request,
    ListCommentsByUserAddressRequestSchema,
  );

  return paginate((cursor) => {
    const decoded = decodeOffsetCursor(cursor, pageSize, COMMENT_CURSOR_LIMITS);

    return client.gamma
      .get(`comments/user_address/${address}`, {
        signal: options.signal,
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
      .andThen(validateWith(ListCommentsResponseSchema, options))
      .map((comments) => {
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

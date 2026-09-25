import {
  CommentParentEntityTypeSchema,
  EventIdSchema,
  type PaginationCursor,
  PaginationCursorSchema,
  toPaginationCursor,
} from '@polymarket/bindings';
import { SeriesIdSchema } from '@polymarket/bindings/gamma';
import { z } from 'zod';
import { UserInputError } from '../errors';
import { decodeOffsetCursor } from '../pagination';

// Matches the upstream per-request limit cap and offset cap on the comments
// listings; pages starting past the offset cap are rejected upstream.
export const MAX_COMMENTS_PAGE_SIZE = 100;
export const MAX_COMMENTS_OFFSET = 200;
export const COMMENT_CURSOR_LIMITS = {
  maxOffset: MAX_COMMENTS_OFFSET,
  maxPageSize: MAX_COMMENTS_PAGE_SIZE,
};

/** The orders the cursor-paginated comments listing accepts. */
const KeysetCommentOrderSchema = z.enum(['id', 'createdAt']);

const KeysetCommentsQuerySchema = z.object({
  ascending: z.boolean(),
  order: KeysetCommentOrderSchema,
  parentEntityId: z.union([EventIdSchema, SeriesIdSchema]),
  parentEntityType: CommentParentEntityTypeSchema,
});

export type KeysetCommentsQuery = z.infer<typeof KeysetCommentsQuerySchema>;

// The service's cursor binds only the sort field, so a cursor replayed under
// another parent or the opposite direction is accepted and seeks the wrong
// rows. The SDK cursor carries the query it was minted for and refuses to
// continue a different one.
const KeysetCommentsCursorStateSchema = KeysetCommentsQuerySchema.extend({
  kind: z.literal('commentsKeyset'),
  cursor: PaginationCursorSchema,
});

type KeysetCommentsCursorState = z.infer<
  typeof KeysetCommentsCursorStateSchema
>;

export type CommentsCursorState =
  | { kind: 'offset'; offset: number; pageSize: number }
  | KeysetCommentsCursorState;

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
export function toKeysetCommentsQuery(params: {
  ascending?: boolean;
  getPositions?: boolean;
  holdersOnly?: boolean;
  order?: string;
  parentEntityId: KeysetCommentsQuery['parentEntityId'];
  parentEntityType: KeysetCommentsQuery['parentEntityType'];
}): KeysetCommentsQuery | undefined {
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

export function encodeKeysetCommentsCursor(
  cursor: PaginationCursor,
  query: KeysetCommentsQuery,
): PaginationCursor {
  // Copy the query field by field: a caller may hand in a decoded cursor
  // state, whose own `cursor` must not replace the new server token.
  const state: KeysetCommentsCursorState = {
    kind: 'commentsKeyset',
    ascending: query.ascending,
    cursor,
    order: query.order,
    parentEntityId: query.parentEntityId,
    parentEntityType: query.parentEntityType,
  };

  return toPaginationCursor(btoa(JSON.stringify(state)));
}

/**
 * Decodes a comments cursor of either shape. Cursors minted before cursor
 * pagination carry only `offset` and `pageSize` and continue on offset pages
 * under the same limits as before.
 */
export function decodeCommentsCursor(
  cursor: PaginationCursor,
  pageSize: number,
): CommentsCursorState {
  let payload: unknown;

  try {
    payload = JSON.parse(atob(cursor));
  } catch (error) {
    throw new UserInputError('Invalid pagination cursor', { cause: error });
  }

  if (typeof payload === 'object' && payload !== null && 'kind' in payload) {
    const state = KeysetCommentsCursorStateSchema.safeParse(payload);

    if (!state.success) {
      throw new UserInputError('Invalid pagination cursor', {
        cause: state.error,
      });
    }

    return state.data;
  }

  return {
    kind: 'offset',
    ...decodeOffsetCursor(cursor, pageSize, COMMENT_CURSOR_LIMITS),
  };
}

/** Refuses to continue a cursor under a different parent, order or direction. */
export function assertKeysetCommentsCursorMatches(
  state: KeysetCommentsCursorState,
  query: KeysetCommentsQuery | undefined,
): void {
  if (
    query === undefined ||
    state.parentEntityId !== query.parentEntityId ||
    state.parentEntityType !== query.parentEntityType ||
    state.order !== query.order ||
    state.ascending !== query.ascending
  ) {
    throw new UserInputError(
      'Pagination cursor was created for a different query',
    );
  }
}

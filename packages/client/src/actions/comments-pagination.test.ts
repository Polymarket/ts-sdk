import {
  CommentParentEntityType,
  toEventId,
  toPaginationCursor,
  toSeriesId,
} from '@polymarket/bindings';
import { ListCommentsKeysetResponseSchema } from '@polymarket/bindings/gamma';
import { describe, expect, it } from 'vitest';
import { PaginationLimitError, UserInputError } from '../errors';
import { encodeOffsetCursor } from '../pagination';
import {
  assertKeysetCommentsCursorMatches,
  decodeCommentsCursor,
  encodeKeysetCommentsCursor,
  type KeysetCommentsQuery,
  toKeysetCommentsQuery,
} from './comments-pagination';

const PARENT = {
  parentEntityId: toEventId('45915'),
  parentEntityType: CommentParentEntityType.Event,
};

const QUERY: KeysetCommentsQuery = {
  ...PARENT,
  ascending: false,
  order: 'createdAt',
};

describe('toKeysetCommentsQuery', () => {
  it('pins newest-first when no order is given and ignores ascending', () => {
    expect(toKeysetCommentsQuery(PARENT)).toEqual(QUERY);
    expect(toKeysetCommentsQuery({ ...PARENT, ascending: true })).toEqual(
      QUERY,
    );
  });

  it('defaults to ascending when an order is given', () => {
    expect(toKeysetCommentsQuery({ ...PARENT, order: 'createdAt' })).toEqual({
      ...QUERY,
      ascending: true,
    });
    expect(toKeysetCommentsQuery({ ...PARENT, order: 'id' })).toEqual({
      ...QUERY,
      ascending: true,
      order: 'id',
    });
    expect(
      toKeysetCommentsQuery({ ...PARENT, ascending: false, order: 'id' }),
    ).toEqual({ ...QUERY, order: 'id' });
  });

  it('keeps holder filtering and positions on offset pages', () => {
    expect(
      toKeysetCommentsQuery({ ...PARENT, holdersOnly: true }),
    ).toBeUndefined();
    expect(
      toKeysetCommentsQuery({ ...PARENT, getPositions: true }),
    ).toBeUndefined();
    expect(
      toKeysetCommentsQuery({
        ...PARENT,
        getPositions: false,
        holdersOnly: false,
      }),
    ).toEqual(QUERY);
  });

  it('keeps unsupported orders on offset pages', () => {
    for (const order of ['reactionCount', '', ' createdAt ', 'createdAt,id']) {
      expect(toKeysetCommentsQuery({ ...PARENT, order })).toBeUndefined();
    }
  });
});

describe('decodeCommentsCursor', () => {
  it('round-trips a cursor-paginated comments cursor', () => {
    const cursor = encodeKeysetCommentsCursor(
      toPaginationCursor('server-token'),
      QUERY,
    );

    expect(decodeCommentsCursor(cursor, 20)).toEqual({
      kind: 'commentsKeyset',
      cursor: 'server-token',
      ...QUERY,
    });
  });

  it('re-encodes a continuation with the new server token, not the old one', () => {
    const previous = decodeCommentsCursor(
      encodeKeysetCommentsCursor(toPaginationCursor('token-1'), QUERY),
      20,
    );

    expect(previous.kind).toBe('commentsKeyset');

    const next = encodeKeysetCommentsCursor(
      toPaginationCursor('token-2'),
      previous as KeysetCommentsQuery,
    );

    expect(decodeCommentsCursor(next, 20)).toMatchObject({
      cursor: 'token-2',
    });
  });

  it('continues a cursor minted before cursor pagination on offset pages', () => {
    const cursor = encodeOffsetCursor({ offset: 20, pageSize: 20 });

    expect(decodeCommentsCursor(cursor, 20)).toEqual({
      kind: 'offset',
      offset: 20,
      pageSize: 20,
    });
  });

  it('still refuses an offset cursor past the cap', () => {
    const cursor = encodeOffsetCursor({ offset: 220, pageSize: 20 });

    expect(() => decodeCommentsCursor(cursor, 20)).toThrow(
      PaginationLimitError,
    );
  });

  it('rejects cursors of other kinds and malformed payloads', () => {
    const otherKind = toPaginationCursor(
      btoa(JSON.stringify({ kind: 'other', offset: 0, pageSize: 20 })),
    );
    const partial = toPaginationCursor(
      btoa(JSON.stringify({ kind: 'commentsKeyset', cursor: 'x' })),
    );

    expect(() => decodeCommentsCursor(otherKind, 20)).toThrow(UserInputError);
    expect(() => decodeCommentsCursor(partial, 20)).toThrow(UserInputError);
    expect(() =>
      decodeCommentsCursor(toPaginationCursor('not-a-cursor'), 20),
    ).toThrow(UserInputError);
  });
});

describe('assertKeysetCommentsCursorMatches', () => {
  const state = {
    kind: 'commentsKeyset' as const,
    cursor: toPaginationCursor('server-token'),
    ...QUERY,
  };

  it('accepts the query the cursor was minted for', () => {
    expect(() => assertKeysetCommentsCursorMatches(state, QUERY)).not.toThrow();
  });

  it('rejects a different parent, parent type, order or direction', () => {
    const mismatches: KeysetCommentsQuery[] = [
      { ...QUERY, parentEntityId: toEventId('1') },
      {
        ...QUERY,
        parentEntityId: toSeriesId('45915'),
        parentEntityType: CommentParentEntityType.Series,
      },
      { ...QUERY, order: 'id' },
      { ...QUERY, ascending: true },
    ];

    for (const query of mismatches) {
      expect(() => assertKeysetCommentsCursorMatches(state, query)).toThrow(
        UserInputError,
      );
    }
  });

  it('rejects a cursor when the read is not cursor-paginated', () => {
    expect(() => assertKeysetCommentsCursorMatches(state, undefined)).toThrow(
      UserInputError,
    );
  });
});

describe('ListCommentsKeysetResponseSchema', () => {
  it('ends the walk when the service omits the next cursor', () => {
    // A thread that ends exactly on a page boundary answers one more page
    // with no comments and no cursor.
    expect(ListCommentsKeysetResponseSchema.parse({ comments: [] })).toEqual({
      items: [],
      nextCursor: undefined,
    });
  });
});

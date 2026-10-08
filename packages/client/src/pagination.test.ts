import { toPaginationCursor } from '@polymarket/bindings';
import { okAsync } from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import {
  PaginationLimitError,
  UnexpectedResponseError,
  UserInputError,
} from './errors';
import {
  decodeOffsetCursor,
  encodeKeysetCursor,
  encodeOffsetCursor,
  keysetCursorFromPayload,
  offsetCursorFromPayload,
  type Page,
  paginate,
  readCursorPayload,
} from './pagination';

const LIMITS = { maxOffset: 200, maxPageSize: 100 };

describe('paginate', () => {
  it('yields a depth-limited page and stops without following its cursor', async () => {
    const boundaryCursor = encodeOffsetCursor({ offset: 200, pageSize: 100 });
    const nextCursor = encodeOffsetCursor({ offset: 300, pageSize: 100 });
    const requested: (string | undefined)[] = [];
    const paginator = paginate((cursor) => {
      requested.push(cursor);
      decodeOffsetCursor(cursor, 100, LIMITS);
      return okAsync({
        items: cursor === undefined ? [1] : [2],
        hasMore: true,
        limitReached: cursor === boundaryCursor,
        nextCursor: cursor === undefined ? boundaryCursor : nextCursor,
      });
    });
    const pages: Page<number[]>[] = [];

    for await (const page of paginator) {
      pages.push(page);
    }

    expect(requested).toEqual([undefined, boundaryCursor]);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toEqual({
      items: [2],
      hasMore: true,
      limitReached: true,
      nextCursor,
    });
    await expect(paginator.from(nextCursor).firstPage()).rejects.toThrow(
      PaginationLimitError,
    );
  });

  it('does not hide a fetch error when a page has no depth-limit signal', async () => {
    const nextCursor = encodeOffsetCursor({ offset: 300, pageSize: 100 });
    const paginator = paginate((cursor) => {
      decodeOffsetCursor(cursor, 100, LIMITS);
      return okAsync({ items: [1], hasMore: true, nextCursor });
    });
    const pages: Page<number[]>[] = [];

    await expect(async () => {
      for await (const page of paginator) {
        pages.push(page);
      }
    }).rejects.toThrow(PaginationLimitError);
    expect(pages).toHaveLength(1);
  });

  it('refuses a continuing page without a cursor instead of restarting', async () => {
    const requested: (string | undefined)[] = [];
    const paginator = paginate((cursor) => {
      requested.push(cursor);
      return okAsync({ items: [1], hasMore: true });
    });
    const pages: Page<number[]>[] = [];

    await expect(async () => {
      for await (const page of paginator) {
        pages.push(page);
      }
    }).rejects.toThrow(UnexpectedResponseError);
    expect(pages).toHaveLength(1);
    expect(requested).toEqual([undefined]);
  });

  it.each([
    ['an immediate repeat', undefined, ['a', 'a']],
    ['a two-cursor cycle', undefined, ['a', 'b', 'a']],
    ['a resume at a repeated cursor', 'a', ['a']],
  ])('refuses %s before requesting the cursor again', async (_name, initialCursor, nextCursors) => {
    const requested: (string | undefined)[] = [];
    const paginator = paginate(
      (cursor) => {
        requested.push(cursor);
        return okAsync({
          items: [requested.length],
          hasMore: true,
          nextCursor: toPaginationCursor(
            nextCursors[requested.length - 1] ?? '',
          ),
        });
      },
      initialCursor === undefined
        ? undefined
        : toPaginationCursor(initialCursor),
    );
    const pages: Page<number[]>[] = [];

    await expect(async () => {
      for await (const page of paginator) {
        pages.push(page);
      }
    }).rejects.toThrow(
      'Paginated response repeated a cursor that was already requested.',
    );
    expect(pages).toHaveLength(nextCursors.length);
    expect(requested).toEqual([initialCursor, ...nextCursors.slice(0, -1)]);
  });

  it.each([
    ['hasMore is false', { hasMore: false }],
    ['the page is depth-limited', { hasMore: true, limitReached: true }],
  ])('stops normally on a terminal page with a repeated cursor when %s', async (_name, terminal) => {
    const cursorA = toPaginationCursor('a');
    const paginator = paginate((cursor) =>
      okAsync(
        cursor === undefined
          ? { items: [1], hasMore: true, nextCursor: cursorA }
          : { items: [2], nextCursor: cursorA, ...terminal },
      ),
    );
    const pages: Page<number[]>[] = [];

    for await (const page of paginator) {
      pages.push(page);
    }

    expect(pages.map((page) => page.items)).toEqual([[1], [2]]);
  });

  it('does not share requested cursors between walks of one paginator', async () => {
    const cursorA = toPaginationCursor('a');
    const requested: (string | undefined)[] = [];
    const paginator = paginate((cursor) => {
      requested.push(cursor);
      return okAsync(
        cursor === undefined
          ? { items: [1], hasMore: true, nextCursor: cursorA }
          : { items: [2], hasMore: false },
      );
    });

    const walk = async () => {
      const items: number[][] = [];
      for await (const page of paginator) {
        items.push(page.items);
      }
      return items;
    };

    expect(await walk()).toEqual(await walk());
    expect(requested).toEqual([undefined, cursorA, undefined, cursorA]);
  });

  it('rejects firstPage through its promise when cursor validation throws', async () => {
    let fetchedPages = 0;
    const paginator = paginate((cursor) => {
      decodeOffsetCursor(cursor, 20, LIMITS);
      fetchedPages += 1;
      return okAsync({ items: [], hasMore: false });
    });
    const cursor = encodeOffsetCursor({ offset: 201, pageSize: 20 });

    const error = await paginator
      .from(cursor)
      .firstPage()
      .catch((error: unknown) => error);

    expect(error).toBeInstanceOf(PaginationLimitError);
    expect(fetchedPages).toBe(0);
  });
});

describe('decodeOffsetCursor', () => {
  it('serves the page that starts exactly at the deepest offset', () => {
    const cursor = encodeOffsetCursor({ offset: 200, pageSize: 100 });

    expect(decodeOffsetCursor(cursor, 100, LIMITS)).toEqual({
      offset: 200,
      pageSize: 100,
    });
  });

  it('refuses a cursor past the deepest offset before any request', () => {
    const cursor = encodeOffsetCursor({ offset: 201, pageSize: 20 });

    expect(() => decodeOffsetCursor(cursor, 20, LIMITS)).toThrow(
      PaginationLimitError,
    );
  });

  it('refuses a cursor carrying a page size above the cap', () => {
    const cursor = encodeOffsetCursor({ offset: 0, pageSize: 101 });

    expect(() => decodeOffsetCursor(cursor, 20, LIMITS)).toThrow(
      UserInputError,
    );
  });

  it('keeps walking when no limits are declared', () => {
    const cursor = encodeOffsetCursor({ offset: 5000, pageSize: 500 });

    expect(decodeOffsetCursor(cursor, 20)).toEqual({
      offset: 5000,
      pageSize: 500,
    });
  });
});

describe('keyset cursors', () => {
  const query = {
    ascending: false,
    order: 'createdAt',
    parentEntityId: '45915',
  };

  it('returns the service token only for the query the cursor was minted for', () => {
    const cursor = encodeKeysetCursor(toPaginationCursor('token-1'), query);
    const payload = readCursorPayload(cursor);

    expect(keysetCursorFromPayload(payload, query)).toBe('token-1');
    expect(
      keysetCursorFromPayload(payload, {
        parentEntityId: '45915',
        order: 'createdAt',
        ascending: false,
        extra: undefined,
      }),
    ).toBe('token-1');
    for (const other of [
      { ...query, parentEntityId: '1' },
      { ...query, order: 'id' },
      { ...query, ascending: true },
      undefined,
    ]) {
      expect(() => keysetCursorFromPayload(payload, other)).toThrow(
        UserInputError,
      );
    }
  });

  it('re-encodes a continuation with the new service token, not the old one', () => {
    const first = readCursorPayload(
      encodeKeysetCursor(toPaginationCursor('token-1'), query),
    );
    const next = encodeKeysetCursor(toPaginationCursor('token-2'), query);

    expect(keysetCursorFromPayload(first, query)).toBe('token-1');
    expect(keysetCursorFromPayload(readCursorPayload(next), query)).toBe(
      'token-2',
    );
  });

  it('round-trips query text outside Latin-1 and keeps ASCII cursors unchanged', () => {
    const unicodeQuery = { slug: ['日本-🚀'] };
    const cursor = encodeKeysetCursor(
      toPaginationCursor('token-1'),
      unicodeQuery,
    );

    expect(
      keysetCursorFromPayload(readCursorPayload(cursor), unicodeQuery),
    ).toBe('token-1');
    // Saved cursors predate UTF-8 encoding and must still decode.
    expect(encodeOffsetCursor({ offset: 20, pageSize: 20 })).toBe(
      btoa(JSON.stringify({ offset: 20, pageSize: 20 })),
    );
  });

  it('rejects a damaged keyset envelope instead of treating it as foreign', () => {
    expect(() =>
      keysetCursorFromPayload(
        { kind: 'keyset', fingerprint: 42, cursor: 'token' },
        query,
      ),
    ).toThrow(UserInputError);
  });

  it('treats cursors of other shapes as foreign instead of failing', () => {
    // A raw service token is base64url with a binary prefix, so it never
    // reads as SDK state; an offset cursor reads as state of another shape.
    expect(readCursorPayload(toPaginationCursor('0d4LIEDh_M-BNmjH'))).toBe(
      undefined,
    );
    const offset = readCursorPayload(
      encodeOffsetCursor({ offset: 20, pageSize: 20 }),
    );
    expect(keysetCursorFromPayload(offset, query)).toBe(undefined);
    expect(offsetCursorFromPayload(offset, LIMITS)).toEqual({
      offset: 20,
      pageSize: 20,
    });
    expect(() =>
      offsetCursorFromPayload({ kind: 'other', offset: 0, pageSize: 20 }),
    ).toThrow(UserInputError);
  });
});

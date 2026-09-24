import { okAsync } from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import { PaginationLimitError, UserInputError } from './errors';
import { decodeOffsetCursor, encodeOffsetCursor, paginate } from './pagination';

const LIMITS = { maxOffset: 200, maxPageSize: 100 };

describe('paginate', () => {
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

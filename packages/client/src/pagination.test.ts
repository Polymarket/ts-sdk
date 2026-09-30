import { okAsync } from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import { PaginationLimitError, UserInputError } from './errors';
import {
  decodeOffsetCursor,
  encodeOffsetCursor,
  type Page,
  paginate,
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

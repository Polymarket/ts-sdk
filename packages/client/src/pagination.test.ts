import { describe, expect, it } from 'vitest';
import { UserInputError } from './errors';
import { decodeOffsetCursor, encodeOffsetCursor, paginate } from './pagination';

describe('capped offset pagination', () => {
  it('allows the last documented offset', () => {
    const cursor = encodeOffsetCursor({ offset: 10_000, pageSize: 500 });

    expect(decodeOffsetCursor(cursor, 1, 10_000)).toEqual({
      offset: 10_000,
      pageSize: 500,
    });
  });

  it('rejects a continuation computed from the last legal offset', () => {
    const lastPage = { offset: 10_000, pageSize: 500 };
    const cursor = encodeOffsetCursor({
      offset: lastPage.offset + lastPage.pageSize,
      pageSize: lastPage.pageSize,
    });

    expect(() => decodeOffsetCursor(cursor, 500, 10_000)).toThrow(
      UserInputError,
    );
  });

  it('rejects synchronous page setup failures through the promise contract', async () => {
    const failure = new UserInputError('Invalid page');
    const paginator = paginate(() => {
      throw failure;
    });

    await expect(paginator.firstPage()).rejects.toBe(failure);
  });
});

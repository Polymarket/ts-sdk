import { describe, expect, it } from 'vitest';
import { UserInputError } from './errors';
import {
  decodeOffsetCursor,
  encodeOffsetCursor,
  offsetContinuation,
  paginate,
} from './pagination';

describe('capped offset pagination', () => {
  it('allows the last documented offset', () => {
    const cursor = encodeOffsetCursor({ offset: 10_000, pageSize: 500 });

    expect(decodeOffsetCursor(cursor, 1, 10_000)).toEqual({
      offset: 10_000,
      pageSize: 500,
    });
  });

  it('rejects a supplied cursor above the ceiling', () => {
    const cursor = encodeOffsetCursor({ offset: 10_001, pageSize: 20 });

    expect(() => decodeOffsetCursor(cursor, 20, 10_000)).toThrow(
      UserInputError,
    );
  });

  it('signals truncation by rejecting the continuation after the ceiling', () => {
    const continuation = offsetContinuation(
      { offset: 10_000, pageSize: 500 },
      true,
    );

    expect(continuation.hasMore).toBe(true);
    expect(() =>
      decodeOffsetCursor(continuation.nextCursor, 500, 10_000),
    ).toThrow(UserInputError);
  });

  it('rejects synchronous page setup failures through the promise contract', async () => {
    const failure = new UserInputError('Invalid page');
    const paginator = paginate(() => {
      throw failure;
    });

    await expect(paginator.firstPage()).rejects.toBe(failure);
  });
});

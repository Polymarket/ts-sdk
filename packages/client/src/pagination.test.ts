import { describe, expect, it } from 'vitest';
import { UserInputError } from './errors';
import {
  cappedOffsetContinuation,
  decodeOffsetCursor,
  encodeOffsetCursor,
} from './pagination';

describe('capped offset pagination', () => {
  it('allows the last documented offset', () => {
    const continuation = cappedOffsetContinuation(
      { offset: 9_500, pageSize: 500 },
      true,
      10_000,
    );

    expect(continuation.hasMore).toBe(true);
    expect(decodeOffsetCursor(continuation.nextCursor, 1, 10_000)).toEqual({
      offset: 10_000,
      pageSize: 500,
    });
  });

  it('stops instead of producing a cursor above the ceiling', () => {
    expect(
      cappedOffsetContinuation({ offset: 10_000, pageSize: 500 }, true, 10_000),
    ).toEqual({ hasMore: false, nextCursor: undefined });
  });

  it('rejects a supplied cursor above the ceiling', () => {
    const cursor = encodeOffsetCursor({ offset: 10_001, pageSize: 20 });

    expect(() => decodeOffsetCursor(cursor, 20, 10_000)).toThrow(
      UserInputError,
    );
  });
});

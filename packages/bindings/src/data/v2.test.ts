import { describe, expect, it } from 'vitest';
import { DataV2PaginationSchema } from './v2';

describe('DataV2PaginationSchema', () => {
  it('normalizes a continuing page to a branded cursor', () => {
    const page = DataV2PaginationSchema.parse({
      limit: 2,
      offset: 0,
      has_more: true,
      next_cursor: 'eyJkYXRhIjp7…',
    });

    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('eyJkYXRhIjp7…');
  });

  it('normalizes the final page to an absent cursor', () => {
    const page = DataV2PaginationSchema.parse({
      limit: 2,
      offset: 4,
      has_more: false,
      next_cursor: null,
    });

    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeUndefined();
  });

  /**
   * The silent failure mode this guards: `has_more: true` with no cursor would
   * hand the page walker `undefined`, restarting it from the first page —
   * forever. A broken upstream invariant must fail validation loudly instead.
   */
  it.each([
    { has_more: true, next_cursor: null },
    { has_more: false, next_cursor: 'eyJkYXRhIjp7…' },
    { has_more: true, next_cursor: '' },
  ])('rejects an inconsistent page (has_more: $has_more, next_cursor: $next_cursor)', ({
    has_more,
    next_cursor,
  }) => {
    const result = DataV2PaginationSchema.safeParse({
      limit: 2,
      offset: 0,
      has_more,
      next_cursor,
    });

    expect(result.success).toBe(false);
  });
});

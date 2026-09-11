import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { dataEnvelopeSchema, dataPageSchema } from './envelope';

const ItemSchema = z.object({ id: z.string() });

describe('dataPageSchema', () => {
  it('parses a continuing page into the page shape with a branded cursor', () => {
    const page = dataPageSchema(ItemSchema).parse({
      data: [{ id: 'a' }, { id: 'b' }],
      pagination: {
        limit: 2,
        offset: 0,
        has_more: true,
        next_cursor: 'eyJkYXRhIjp7…',
      },
    });

    expect(page.items).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('eyJkYXRhIjp7…');
  });

  it('parses the final page with an absent cursor', () => {
    const page = dataPageSchema(ItemSchema).parse({
      data: [],
      pagination: { limit: 2, offset: 4, has_more: false, next_cursor: null },
    });

    expect(page.items).toEqual([]);
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
    const result = dataPageSchema(ItemSchema).safeParse({
      data: [],
      pagination: { limit: 2, offset: 0, has_more, next_cursor },
    });

    expect(result.success).toBe(false);
  });
});

describe('dataEnvelopeSchema', () => {
  it('unwraps the payload', () => {
    expect(dataEnvelopeSchema(ItemSchema).parse({ data: { id: 'a' } })).toEqual(
      { id: 'a' },
    );
  });

  it('keeps a null answer a parsed value when the payload is nullable', () => {
    expect(
      dataEnvelopeSchema(ItemSchema.nullable()).parse({ data: null }),
    ).toBeNull();
  });
});

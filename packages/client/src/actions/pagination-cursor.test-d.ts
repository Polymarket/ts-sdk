import {
  type PaginationCursor,
  PaginationCursorSchema,
} from '@polymarket/bindings';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

describe('pagination cursor inputs', () => {
  it('infers branded cursor request inputs', () => {
    const RequestSchema = z.object({
      cursor: PaginationCursorSchema.optional(),
    });

    type Request = z.input<typeof RequestSchema>;

    expectTypeOf<Request>().toEqualTypeOf<{
      cursor?: PaginationCursor | undefined;
    }>();
    expectTypeOf<{ cursor: string }>().not.toMatchTypeOf<Request>();
  });
});

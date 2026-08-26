import { z } from 'zod';
import { type PaginationCursor, toPaginationCursor } from '../shared';

/**
 * The `/v2` list envelope's pagination block, normalized to camelCase with the
 * opaque continuation cursor branded as {@link PaginationCursor}.
 *
 * `hasMore` is exact on this surface (the service probes one row past the
 * page), and `nextCursor` is server-minted and opaque — it is never derived or
 * synthesized client-side. A `null` wire cursor (final page) normalizes to
 * `undefined`.
 */
export const DataV2PaginationSchema = z
  .object({
    limit: z.number().int(),
    offset: z.number().int(),
    has_more: z.boolean(),
    next_cursor: z.string().nullable(),
  })
  .transform(({ has_more, next_cursor, ...rest }) => ({
    ...rest,
    hasMore: has_more,
    nextCursor:
      next_cursor === null
        ? undefined
        : (toPaginationCursor(next_cursor) satisfies PaginationCursor),
  }));

export type DataV2Pagination = z.output<typeof DataV2PaginationSchema>;

/**
 * Builds the `/v2` paginated list envelope for one item schema:
 * `{ data: TItem[], pagination: { limit, offset, has_more, next_cursor } }`.
 */
export function dataV2PageSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    data: z.array(item),
    pagination: DataV2PaginationSchema,
  });
}

/**
 * Builds the `/v2` single-object envelope for one payload schema:
 * `{ data: TPayload }`.
 *
 * Endpoints whose ordinary answer includes "no such row" serve `data: null`;
 * model that by passing a nullable payload schema, so absence stays a parsed
 * value rather than a validation failure.
 */
export function dataV2EnvelopeSchema<TPayload extends z.ZodType>(
  payload: TPayload,
) {
  return z.object({
    data: payload,
  });
}

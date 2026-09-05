import { z } from 'zod';
import { toPaginationCursor } from '../shared';

/**
 * Parses the data-service paginated list envelope straight into the SDK's page shape
 * — `{ items, hasMore, nextCursor }` — so actions hand the result to the
 * pagination walker as-is. The wire envelope never escapes bindings, and no
 * second pagination vocabulary exists: whatever the upstream strategy, the
 * SDK exposes the one cursor-shaped page.
 *
 * `hasMore` is exact on this surface (the service probes one row past the
 * page). `nextCursor` is server-minted and opaque — never derived or
 * synthesized client-side; a `null` wire cursor (final page) normalizes to
 * `undefined`. The wire's `limit`/`offset` echoes are dropped: they restate
 * the request.
 */
export function dataPageSchema<TItem extends z.ZodType>(item: TItem) {
  return (
    z
      .object({
        data: z.array(item),
        pagination: z.object({
          limit: z.number().int(),
          offset: z.number().int(),
          has_more: z.boolean(),
          next_cursor: z.string().min(1).nullable(),
        }),
      })
      // The service mints the cursor exactly when another page exists, so the
      // two fields are equivalent. Enforcing that here turns a broken upstream
      // invariant into a loud validation failure instead of its silent failure
      // mode: `hasMore: true` with no cursor restarts the page walker from the
      // first page, forever.
      .refine(
        (value) =>
          value.pagination.has_more === (value.pagination.next_cursor !== null),
        {
          message: 'has_more and next_cursor must agree',
          path: ['pagination', 'next_cursor'],
        },
      )
      .transform(({ data, pagination }) => ({
        items: data,
        hasMore: pagination.has_more,
        nextCursor:
          pagination.next_cursor === null
            ? undefined
            : toPaginationCursor(pagination.next_cursor),
      }))
  );
}

/**
 * Parses the data-service single-object envelope — `{ data }` — and unwraps it to
 * the payload, so the envelope never escapes bindings.
 *
 * Endpoints whose ordinary answer includes "no such row" serve `data: null`;
 * model that by passing a nullable payload schema, so absence stays a parsed
 * value rather than a validation failure.
 */
export function dataEnvelopeSchema<TPayload extends z.ZodType>(
  payload: TPayload,
) {
  // The inference cast is load-bearing: for a bare generic payload schema,
  // zod's mapped envelope type stays opaque to the declaration build, so the
  // callback cannot destructure or annotate its argument.
  return z
    .object({ data: payload })
    .transform((envelope) => (envelope as { data: z.output<TPayload> }).data);
}

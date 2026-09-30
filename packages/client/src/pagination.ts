import {
  type PaginationCursor,
  toPaginationCursor,
} from '@polymarket/bindings';
import { type ResultAsync, unwrap } from '@polymarket/types';
import { z } from 'zod';
import { PaginationLimitError, UserInputError } from './errors';

export const PageSizeSchema = z.number().int().positive();

export type Page<T> = {
  items: T;
  /**
   * Whether another page may be available.
   *
   * On methods without a server-provided continuation signal, a full page
   * reports `true` and the follow-up request returns an empty final page when
   * the collection ended exactly on a page boundary.
   *
   * A depth-limited page can report `true` alongside `limitReached`.
   * Automatic iteration stops there; explicitly following its cursor throws
   * {@link PaginationLimitError} before sending a request.
   */
  hasMore: boolean;
  /**
   * Whether the listing's supported depth prevents fetching another page.
   * Automatic iteration yields this page, then stops normally. This signals
   * that completeness cannot be established, not that more items definitely
   * exist. Absent or false when no depth limit stopped continuation.
   */
  limitReached?: boolean;
  nextCursor?: PaginationCursor;
  /** Total number of matching items across all pages. Only present when the service reports one. */
  totalCount?: number;
};

export type Paginated<T> = AsyncIterable<Page<T>> & {
  firstPage(): Promise<Page<T>>;
  from(cursor?: PaginationCursor): Paginated<T>;
};

/** @internal */
export function paginate<T, TError>(
  fetchPage: (cursor?: PaginationCursor) => ResultAsync<Page<T>, TError>,
  initialCursor?: PaginationCursor,
  emptyItems: T = [] as T,
): Paginated<T> {
  function createEmptyPaginator(): Paginated<T> {
    return {
      async firstPage() {
        return {
          items: emptyItems,
          hasMore: false,
        };
      },
      from() {
        return createEmptyPaginator();
      },
      async *[Symbol.asyncIterator]() {},
    };
  }

  function createPaginator(cursor = initialCursor): Paginated<T> {
    return {
      async firstPage() {
        return unwrap(fetchPage(cursor));
      },
      from(nextCursor) {
        if (nextCursor === undefined) {
          return createEmptyPaginator();
        }

        return createPaginator(nextCursor);
      },
      async *[Symbol.asyncIterator]() {
        let currentCursor = cursor;

        while (true) {
          const page = await unwrap(fetchPage(currentCursor));

          yield page;

          if (!page.hasMore || page.limitReached) {
            return;
          }

          currentCursor = page.nextCursor;
        }
      },
    };
  }

  return createPaginator();
}

/**
 * Encodes SDK-owned cursor state as an opaque pagination cursor.
 *
 * @internal
 */
export function encodeCursorState(state: unknown): PaginationCursor {
  return toPaginationCursor(encodeBase64(JSON.stringify(state)));
}

/**
 * Decodes an SDK-owned cursor and validates its state against `schema`.
 * Anything that is not such a cursor fails as user input.
 *
 * @internal
 */
export function decodeCursorState<T>(
  cursor: PaginationCursor,
  schema: z.ZodType<T>,
  message = 'Invalid pagination cursor',
): T {
  try {
    return schema.parse(JSON.parse(decodeBase64(cursor)));
  } catch (error) {
    throw new UserInputError(message, { cause: error });
  }
}

/**
 * Reads the JSON state of an SDK-owned cursor, or `undefined` when the value
 * was not minted by {@link encodeCursorState}, such as a raw service token or
 * a corrupted string. Callers decide what a foreign cursor means for them.
 *
 * @internal
 */
export function readCursorPayload(cursor: PaginationCursor): unknown {
  try {
    return JSON.parse(decodeBase64(cursor));
  } catch {
    return undefined;
  }
}

// Cursor state may carry query text, so it is encoded as UTF-8 bytes; ASCII
// payloads produce the same base64 as before, keeping saved cursors valid.
function encodeBase64(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

function decodeBase64(cursor: string): string {
  return new TextDecoder().decode(
    Uint8Array.from(atob(cursor), (char) => char.charCodeAt(0)),
  );
}

/** @internal */
type OffsetCursorState = {
  offset: number;
  pageSize: number;
};

// Strict so that a cursor of another shape is never mistaken for offset state.
const OffsetCursorStateSchema = z.strictObject({
  offset: z.number().int().min(0),
  pageSize: PageSizeSchema,
});

/** @internal */
export function encodeOffsetCursor(state: OffsetCursorState): PaginationCursor {
  return encodeCursorState(OffsetCursorStateSchema.parse(state));
}

/** @internal */
export type OffsetCursorLimits = {
  /** Largest cursor position the service serves; a cursor past it fails before any request. */
  maxOffset?: number;
  /** Largest page size the service serves; a cursor carrying more fails before any request. */
  maxPageSize?: number;
};

/** @internal */
export function decodeOffsetCursor(
  cursor: PaginationCursor | undefined,
  pageSize: number,
  limits: OffsetCursorLimits = {},
): OffsetCursorState {
  if (cursor === undefined) {
    return {
      offset: 0,
      pageSize,
    };
  }

  return offsetCursorFromPayload(
    decodeCursorState(cursor, z.unknown()),
    limits,
  );
}

/**
 * Validates an already-read cursor payload as offset state and applies the
 * listing's limits. Use with {@link readCursorPayload} when a listing accepts
 * more than one cursor shape, so the cursor is decoded once.
 *
 * @internal
 */
export function offsetCursorFromPayload(
  payload: unknown,
  limits: OffsetCursorLimits = {},
): OffsetCursorState {
  const parsed = OffsetCursorStateSchema.safeParse(payload);

  if (!parsed.success) {
    throw new UserInputError('Invalid pagination cursor', {
      cause: parsed.error,
    });
  }

  const state = parsed.data;

  // A cursor carries the offset and page size it was minted with, so both are
  // re-checked here rather than trusting the request's page size alone.
  if (limits.maxPageSize !== undefined && state.pageSize > limits.maxPageSize) {
    throw new UserInputError(
      `Pagination cursor page size must be at most ${limits.maxPageSize}`,
    );
  }

  if (limits.maxOffset !== undefined && state.offset > limits.maxOffset) {
    throw new PaginationLimitError(
      `Pagination reached this listing's supported depth limit (${limits.maxOffset}); whether more items exist cannot be established.`,
    );
  }

  return state;
}

// A service's keyset token usually binds only the sort position. Replayed
// under different filters or the opposite direction it is accepted and seeks
// the wrong rows, so SDK cursors carry a fingerprint of the query they were
// minted for and refuse to continue a different one.
const KeysetCursorStateSchema = z.object({
  kind: z.literal('keyset'),
  fingerprint: z.string(),
  cursor: z.string().min(1),
});

/**
 * Wraps a service keyset token together with the query it continues.
 *
 * @internal
 */
export function encodeKeysetCursor(
  cursor: PaginationCursor,
  query: object,
): PaginationCursor {
  return encodeCursorState({
    kind: 'keyset',
    fingerprint: fingerprintQuery(query),
    cursor,
  });
}

/**
 * Returns the service token inside an SDK keyset cursor payload when it was
 * minted for `query`, or `undefined` when the payload is not a keyset cursor.
 * A keyset cursor minted for a different query fails as user input.
 *
 * @internal
 */
export function keysetCursorFromPayload(
  payload: unknown,
  query: object | undefined,
): PaginationCursor | undefined {
  if (!isKeysetCursorPayload(payload)) {
    return undefined;
  }

  // Anything that claims to be a keyset cursor is held to its shape, so a
  // damaged envelope is never forwarded as a service token.
  const parsed = KeysetCursorStateSchema.safeParse(payload);

  if (!parsed.success) {
    throw new UserInputError('Invalid pagination cursor', {
      cause: parsed.error,
    });
  }

  if (
    query === undefined ||
    parsed.data.fingerprint !== fingerprintQuery(query)
  ) {
    throw new UserInputError(
      'Pagination cursor was created for a different query',
    );
  }

  return toPaginationCursor(parsed.data.cursor);
}

function isKeysetCursorPayload(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'kind' in payload &&
    payload.kind === 'keyset'
  );
}

function fingerprintQuery(query: object): string {
  return JSON.stringify(canonicalize(query));
}

// Key order and absent fields must not change the fingerprint.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }

  return value;
}

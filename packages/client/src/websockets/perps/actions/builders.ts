import {
  EvmAddressSchema,
  type PaginationCursor,
  toPaginationCursor,
} from '@polymarket/bindings';
import {
  FetchPerpsBuilderApprovalsResponseSchema,
  ListPerpsBuilderEarningsResponseSchema,
  type PerpsBuilderApproval,
  type PerpsBuilderEarning,
  type PerpsBuilderEarningsSnapshot,
  type PerpsBuilderEarningsSummary,
  PerpsBuilderEarningsSummarySchema,
} from '@polymarket/bindings/perps';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import { snakeCase, toSearchParams } from '../../../actions/params';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../../errors';
import { parseUserInput } from '../../../input';
import { validateWith } from '../../../response';
import type { ServiceClient } from '../../../ServiceClient';

const FetchPerpsBuilderApprovalsRequestSchema = z
  .object({ builder: EvmAddressSchema.optional() })
  .default({}) satisfies z.ZodType<FetchPerpsBuilderApprovalsRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsBuilderApprovalsRequest = {
  /** Optional builder filter; approvals always belong to the authenticated trader. */
  builder?: string;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsBuilderApprovalsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsBuilderApprovalsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the authenticated trader's saved grants, including revoked grants.
 *
 * @throws {@link FetchPerpsBuilderApprovalsError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsBuilderApprovals(
  api: ServiceClient,
  request?: FetchPerpsBuilderApprovalsRequest,
): Promise<PerpsBuilderApproval[]> {
  const params = parseUserInput(
    request,
    FetchPerpsBuilderApprovalsRequestSchema,
  );
  const response = await unwrap(
    api
      .get('/v1/account/builder-approvals', {
        params: toSearchParams(params, snakeCase()),
      })
      .andThen(validateWith(FetchPerpsBuilderApprovalsResponseSchema)),
  );
  return response.data;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const BuilderReportingIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const BuilderReportingRequestSchema = z
  .object({
    start: BuilderReportingIntegerSchema.optional(),
    end: BuilderReportingIntegerSchema.optional(),
    asOfSequence: BuilderReportingIntegerSchema.optional(),
  })
  .refine(
    ({ start, end }) =>
      start === undefined || end === undefined || start <= end,
    { message: 'end must not precede start', path: ['end'] },
  )
  .refine(
    ({ start, end }) =>
      start === undefined || end === undefined || end - start <= NINETY_DAYS_MS,
    { message: 'The reporting window must not exceed 90 days', path: ['end'] },
  )
  .default({});

/**
 * One page at a fixed reporting window and indexed sequence cutoff.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsBuilderEarningsPage = {
  items: PerpsBuilderEarning[];
  hasMore: boolean;
  nextCursor?: PaginationCursor;
  /** Null only for the synthetic terminal page returned by `.from(undefined)`. */
  snapshot: PerpsBuilderEarningsSnapshot | null;
};

/**
 * Earnings pagination that retains the reporting snapshot on every fetched page.
 * Each iteration has its own continuation state.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsBuilderEarningsPaginator =
  AsyncIterable<PerpsBuilderEarningsPage> & {
    /**
     * @throws {@link ListPerpsBuilderEarningsError} Thrown on failure.
     * @experimental This API may change in a breaking way in any release, including patch releases.
     */
    firstPage(): Promise<PerpsBuilderEarningsPage>;
    /**
     * Resumes the cursor's original window and cutoff. Undefined creates a terminal paginator.
     * @throws {@link ListPerpsBuilderEarningsError} Thrown when the cursor is invalid.
     * @experimental This API may change in a breaking way in any release, including patch releases.
     */
    from(cursor?: PaginationCursor): PerpsBuilderEarningsPaginator;
  };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ListPerpsBuilderEarningsRequest = {
  /** Inclusive start in Unix milliseconds. Defaults to seven days before end. */
  start?: number;
  /** End in Unix milliseconds. Defaults to the server's current time. */
  end?: number;
  /** Fixed indexed sequence cutoff. Defaults to the latest fully indexed sequence. */
  asOfSequence?: number;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ListPerpsBuilderEarningsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ListPerpsBuilderEarningsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists earnings credited to the authenticated builder account.
 *
 * @remarks
 * Pages retain their reporting window and cutoff, including empty pages. Pass a
 * page's non-null snapshot to `fetchBuilderEarningsSummary` to reconcile totals.
 * Continuations preserve the original snapshot even as more fills are indexed.
 * A window is at most 90 days; omitted bounds use the server's seven-day default.
 *
 * @throws {@link ListPerpsBuilderEarningsError}
 * Thrown on invalid input or while fetching pages.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function listPerpsBuilderEarnings(
  api: ServiceClient,
  request?: ListPerpsBuilderEarningsRequest,
): PerpsBuilderEarningsPaginator {
  const params = parseUserInput(request, BuilderReportingRequestSchema);

  async function fetchPage(cursor?: string): Promise<PerpsBuilderEarningsPage> {
    const searchParams =
      cursor === undefined
        ? toSearchParams(params, {
            start: 'start_timestamp',
            end: 'end_timestamp',
            asOfSequence: 'as_of_sequence',
          })
        : new URLSearchParams({ cursor });
    const response = await unwrap(
      api
        .get('/v1/account/builder-earnings', { params: searchParams })
        .andThen(validateWith(ListPerpsBuilderEarningsResponseSchema)),
    );

    if (response.more && (!response.cursor || response.cursor === cursor)) {
      throw new UnexpectedResponseError(
        'Builder earnings reported more records without a new continuation cursor.',
      );
    }

    return {
      items: response.data,
      hasMore: response.more,
      snapshot: response.snapshot,
      ...(response.more && response.cursor !== undefined
        ? {
            nextCursor: toPaginationCursor(
              btoa(
                JSON.stringify({
                  kind: 'perpsBuilderEarnings',
                  cursor: response.cursor,
                }),
              ),
            ),
          }
        : {}),
    };
  }

  function createPaginator(cursor?: string): PerpsBuilderEarningsPaginator {
    return {
      firstPage() {
        return fetchPage(cursor);
      },
      from(nextCursor) {
        return nextCursor === undefined
          ? createEmptyBuilderEarningsPaginator()
          : createPaginator(decodeBuilderEarningsCursor(nextCursor));
      },
      async *[Symbol.asyncIterator]() {
        let currentCursor = cursor;
        while (true) {
          const page = await fetchPage(currentCursor);
          yield page;
          if (!page.hasMore || page.nextCursor === undefined) return;
          currentCursor = decodeBuilderEarningsCursor(page.nextCursor);
        }
      },
    };
  }

  return createPaginator();
}

const BuilderEarningsCursorSchema = z.object({
  kind: z.literal('perpsBuilderEarnings'),
  cursor: z.string().min(1),
});

function decodeBuilderEarningsCursor(cursor: PaginationCursor): string {
  try {
    return parseUserInput(JSON.parse(atob(cursor)), BuilderEarningsCursorSchema)
      .cursor;
  } catch (error) {
    throw new UserInputError('Invalid builder earnings pagination cursor', {
      cause: error,
    });
  }
}

function createEmptyBuilderEarningsPaginator(): PerpsBuilderEarningsPaginator {
  return {
    async firstPage() {
      return { items: [], hasMore: false, snapshot: null };
    },
    from() {
      return createEmptyBuilderEarningsPaginator();
    },
    async *[Symbol.asyncIterator]() {},
  };
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsBuilderEarningsSummaryRequest = {
  /** Inclusive start in Unix milliseconds. Defaults to seven days before end. */
  start?: number;
  /** End in Unix milliseconds. Defaults to the server's current time. */
  end?: number;
  /** Fixed indexed sequence cutoff. Defaults to the latest fully indexed sequence. */
  asOfSequence?: number;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsBuilderEarningsSummaryError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsBuilderEarningsSummaryError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches earnings totals for the authenticated builder account.
 *
 * @remarks
 * Use a fetched earnings page's snapshot to reconcile its history. The active
 * approval count reflects current consent independently of the reporting cutoff.
 * Omitted bounds use the server's seven-day default; windows cannot exceed 90 days.
 *
 * @throws {@link FetchPerpsBuilderEarningsSummaryError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsBuilderEarningsSummary(
  api: ServiceClient,
  request?: FetchPerpsBuilderEarningsSummaryRequest,
): Promise<PerpsBuilderEarningsSummary> {
  const params = parseUserInput(request, BuilderReportingRequestSchema);
  return unwrap(
    api
      .get('/v1/account/builder-earnings-summary', {
        params: toSearchParams(params, {
          start: 'start_timestamp',
          end: 'end_timestamp',
          asOfSequence: 'as_of_sequence',
        }),
      })
      .andThen(validateWith(PerpsBuilderEarningsSummarySchema)),
  );
}

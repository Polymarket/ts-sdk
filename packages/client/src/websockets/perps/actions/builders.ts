import { EvmAddressSchema, toPaginationCursor } from '@polymarket/bindings';
import {
  FetchPerpsBuilderApprovalsResponseSchema,
  ListPerpsBuilderEarningsResponseSchema,
  type PerpsBuilderApproval,
  type PerpsBuilderEarning,
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
import { type Page, type Paginated, paginate } from '../../../pagination';
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
 * To reconcile history against totals, call `fetchPerpsBuilderEarningsSummary`
 * first and pass its `snapshot` as this request. The snapshot pins the
 * reporting window and indexed sequence cutoff, so every page matches those
 * totals. Continuations keep the original window and cutoff even as more fills
 * are indexed. A window is at most 90 days; omitted bounds use the server's
 * seven-day default.
 *
 * @throws {@link ListPerpsBuilderEarningsError}
 * Thrown on invalid input or while fetching pages.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function listPerpsBuilderEarnings(
  api: ServiceClient,
  request?: ListPerpsBuilderEarningsRequest,
): Paginated<PerpsBuilderEarning[]> {
  const params = parseUserInput(request, BuilderReportingRequestSchema);

  return paginate((cursor) =>
    api
      .get('/v1/account/builder-earnings', {
        params:
          cursor === undefined
            ? toSearchParams(params, {
                start: 'start_timestamp',
                end: 'end_timestamp',
                asOfSequence: 'as_of_sequence',
              })
            : new URLSearchParams({ cursor }),
      })
      .andThen(validateWith(ListPerpsBuilderEarningsResponseSchema))
      .map((response): Page<PerpsBuilderEarning[]> => {
        if (!response.more || response.cursor === undefined) {
          return { items: response.data, hasMore: false };
        }
        return {
          items: response.data,
          hasMore: true,
          nextCursor: toPaginationCursor(response.cursor),
        };
      }),
  );
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
 * The returned `snapshot` pins the reporting window and indexed sequence
 * cutoff. Pass it to `listPerpsBuilderEarnings` to page the history behind
 * these totals. The active approval count reflects current consent
 * independently of the reporting cutoff.
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

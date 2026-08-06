import {
  type PaginationCursor,
  PaginationCursorSchema,
  TxHashSchema,
  toPaginationCursor,
} from '@polymarket/bindings';
import {
  FetchPerpsAccountConfigResponseSchema,
  FetchPerpsAccountStatsResponseSchema,
  FetchPerpsAutoCancelStatusResponseSchema,
  FetchPerpsBalancesResponseSchema,
  FetchPerpsOpenOrdersResponseSchema,
  FetchPerpsOrdersResponseSchema,
  FetchPerpsPortfolioResponseSchema,
  FetchPerpsUnreadNotificationsCountResponseSchema,
  ListPerpsDepositsResponseSchema,
  ListPerpsEquityHistoryResponseSchema,
  ListPerpsFillsResponseSchema,
  ListPerpsFundingPaymentsResponseSchema,
  ListPerpsNotificationsResponseSchema,
  ListPerpsPnlHistoryResponseSchema,
  ListPerpsWithdrawalsResponseSchema,
  MarkPerpsNotificationsReadResponseSchema,
  type PerpsAccountConfig,
  type PerpsAccountFill,
  type PerpsAccountFundingPayment,
  type PerpsAccountStats,
  type PerpsAutoCancelStatus,
  type PerpsBalance,
  PerpsClientOrderIdSchema,
  type PerpsDeposit,
  type PerpsDepositStatus,
  PerpsDepositStatusSchema,
  type PerpsEquityPoint,
  type PerpsInstrumentId,
  PerpsInstrumentIdSchema,
  type PerpsNotificationEntry,
  type PerpsOrder,
  PerpsOrderIdSchema,
  type PerpsPnlInterval,
  PerpsPnlIntervalSchema,
  type PerpsPnlPoint,
  type PerpsPortfolio,
  type PerpsSortDirection,
  PerpsSortDirectionSchema,
  type PerpsWithdrawal,
  type PerpsWithdrawalStatus,
  PerpsWithdrawalStatusSchema,
} from '@polymarket/bindings/perps';
import { invariant, unwrap } from '@polymarket/types';
import { z } from 'zod';
import { snakeCase, toSearchParams } from '../../../actions/params';
import { RequestRejectedError, UserInputError } from '../../../errors';
import { parseUserInput } from '../../../input';
import { type Page, type Paginated, paginate } from '../../../pagination';
import { validateWith } from '../../../response';
import type { ServiceClient } from '../../../ServiceClient';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * ONE_DAY_MS;

const TimestampInputSchema = z.number().int().nonnegative();

type PerpsHistoryParams = {
  startTimestamp: number;
  endTimestamp: number;
  instrumentId?: PerpsInstrumentId;
  depositStatus?: z.output<typeof PerpsDepositStatusSchema>;
  withdrawalStatus?: z.output<typeof PerpsWithdrawalStatusSchema>;
  hash?: z.output<typeof TxHashSchema>;
};

type PerpsIntervalHistoryParams = PerpsHistoryParams & {
  interval: z.output<typeof PerpsPnlIntervalSchema>;
};

const PerpsHistoryRequestBaseSchema = z.object({
  start: TimestampInputSchema.optional(),
  end: TimestampInputSchema.optional(),
});

const PerpsIntervalHistoryRequestBaseSchema = z.object({
  interval: PerpsPnlIntervalSchema,
  start: TimestampInputSchema,
  end: TimestampInputSchema.optional(),
});

const PerpsDescendingAccountHistoryKindSchema = z.enum([
  'perpsFundingPayments',
  'perpsDeposits',
  'perpsWithdrawals',
]);

const PerpsAscendingAccountHistoryKindSchema = z.enum([
  'perpsEquityHistory',
  'perpsPnlHistory',
]);

const PerpsDescendingAccountCursorStateSchema = z.object({
  kind: PerpsDescendingAccountHistoryKindSchema,
  startTimestamp: TimestampInputSchema,
  endTimestamp: TimestampInputSchema,
  instrumentId: PerpsInstrumentIdSchema.optional(),
  depositStatus: PerpsDepositStatusSchema.optional(),
  withdrawalStatus: PerpsWithdrawalStatusSchema.optional(),
  hash: TxHashSchema.optional(),
  seenKeys: z.array(z.string()),
});

const PerpsAscendingAccountCursorStateSchema = z.object({
  kind: PerpsAscendingAccountHistoryKindSchema,
  startTimestamp: TimestampInputSchema,
  endTimestamp: TimestampInputSchema,
  interval: PerpsPnlIntervalSchema,
});

type PerpsDescendingAccountCursorState = z.infer<
  typeof PerpsDescendingAccountCursorStateSchema
>;
type PerpsAscendingAccountCursorState = z.infer<
  typeof PerpsAscendingAccountCursorStateSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsBalances(
  api: ServiceClient,
): Promise<PerpsBalance[]> {
  return await unwrap(
    api
      .get('/v1/account/balances')
      .andThen(validateWith(FetchPerpsBalancesResponseSchema)),
  );
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsPortfolio(
  api: ServiceClient,
): Promise<PerpsPortfolio> {
  return await unwrap(
    api
      .get('/v1/account/portfolio')
      .andThen(validateWith(FetchPerpsPortfolioResponseSchema)),
  );
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsStats(
  api: ServiceClient,
): Promise<PerpsAccountStats> {
  return await unwrap(
    api
      .get('/v1/account/stats')
      .andThen(validateWith(FetchPerpsAccountStatsResponseSchema)),
  );
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsAutoCancelStatus(
  api: ServiceClient,
): Promise<PerpsAutoCancelStatus> {
  return await unwrap(
    api
      .get('/v1/account/auto-cancel')
      .andThen(validateWith(FetchPerpsAutoCancelStatusResponseSchema)),
  );
}

const FetchPerpsAccountConfigRequestSchema = z
  .object({
    instrumentId: PerpsInstrumentIdSchema.optional(),
  })
  .default({}) satisfies z.ZodType<FetchPerpsAccountConfigRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsAccountConfigRequest = {
  /** Optional Perps instrument identifier filter. */
  instrumentId?: number;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsAccountConfig(
  api: ServiceClient,
  request?: FetchPerpsAccountConfigRequest,
): Promise<PerpsAccountConfig[]> {
  const params = parseUserInput(request, FetchPerpsAccountConfigRequestSchema);
  return await unwrap(
    api
      .get('/v1/account/config', {
        params: toPerpsSearchParams(params),
      })
      .andThen(validateWith(FetchPerpsAccountConfigResponseSchema)),
  );
}

const FetchPerpsOpenOrdersRequestSchema = z
  .object({
    instrumentId: PerpsInstrumentIdSchema.optional(),
  })
  .default({}) satisfies z.ZodType<FetchPerpsOpenOrdersRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsOpenOrdersRequest = {
  /** Optional Perps instrument identifier filter. */
  instrumentId?: number;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsOpenOrders(
  api: ServiceClient,
  request?: FetchPerpsOpenOrdersRequest,
): Promise<PerpsOrder[]> {
  const params = parseUserInput(request, FetchPerpsOpenOrdersRequestSchema);
  return await unwrap(
    api
      .get('/v1/account/open-orders', {
        params: toPerpsSearchParams(params),
      })
      .andThen(validateWith(FetchPerpsOpenOrdersResponseSchema)),
  );
}

const FetchPerpsOrdersRequestInputSchema = z
  .object({
    orderId: PerpsOrderIdSchema.optional(),
    clientOrderId: PerpsClientOrderIdSchema.optional(),
    instrumentId: PerpsInstrumentIdSchema.optional(),
    start: TimestampInputSchema.optional(),
    end: TimestampInputSchema.optional(),
  })
  .default({}) satisfies z.ZodType<FetchPerpsOrdersRequest>;

const FetchPerpsOrdersRequestSchema =
  FetchPerpsOrdersRequestInputSchema.transform(
    ({ end, start, ...request }) => ({
      ...request,
      endTimestamp: end,
      startTimestamp: start,
    }),
  );

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsOrdersRequest = {
  /** Optional order identifier filter. */
  orderId?: number;
  /** Optional caller-supplied idempotency identifier filter. */
  clientOrderId?: string;
  /** Optional Perps instrument identifier filter. */
  instrumentId?: number;
  /** Inclusive start timestamp in milliseconds. */
  start?: number;
  /** Inclusive end timestamp in milliseconds. */
  end?: number;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsOrders(
  api: ServiceClient,
  request?: FetchPerpsOrdersRequest,
): Promise<PerpsOrder[]> {
  const params = parseUserInput(request, FetchPerpsOrdersRequestSchema);
  return await unwrap(
    api
      .get('/v1/account/orders', {
        params: toPerpsSearchParams(params),
      })
      .andThen(validateWith(FetchPerpsOrdersResponseSchema)),
  );
}

const ListPerpsFillsRequestSchema = z.object({
  start: TimestampInputSchema.optional(),
  end: TimestampInputSchema.optional(),
  sort: PerpsSortDirectionSchema.optional(),
  cursor: PaginationCursorSchema.optional(),
}) satisfies z.ZodType<ListPerpsFillsRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ListPerpsFillsRequest = {
  /** Inclusive start timestamp in milliseconds. */
  start?: number;
  /** Inclusive end timestamp in milliseconds. */
  end?: number;
  /** Time sort direction. Defaults to newest fills first. */
  sort?: PerpsSortDirection;
  /** Opaque cursor returned by a previous page. */
  cursor?: PaginationCursor;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function listPerpsFills(
  api: ServiceClient,
  request: ListPerpsFillsRequest = {},
): Paginated<PerpsAccountFill[]> {
  const params = parseUserInput(request, ListPerpsFillsRequestSchema);
  return paginate(
    (cursor) =>
      api
        .get('/v1/account/fills', {
          params: toPerpsSearchParams({
            startTimestamp: params.start,
            endTimestamp: params.end,
            sort: params.sort,
            cursor: cursor ?? params.cursor,
          }),
        })
        .andThen(validateWith(ListPerpsFillsResponseSchema))
        .map((response): Page<PerpsAccountFill[]> => {
          const last = response.data.at(-1);
          if (!response.more || last === undefined) {
            return { items: response.data, hasMore: false };
          }
          return {
            items: response.data,
            hasMore: true,
            nextCursor: toPaginationCursor(String(last.tradeId)),
          };
        }),
    params.cursor,
  );
}

const ListPerpsFundingPaymentsInitialRequestSchema =
  PerpsHistoryRequestBaseSchema.extend({
    cursor: PaginationCursorSchema.optional(),
    instrumentId: PerpsInstrumentIdSchema.optional(),
  }) satisfies z.ZodType<
    Exclude<ListPerpsFundingPaymentsRequest, { cursor: PaginationCursor }>
  >;

const ListPerpsFundingPaymentsCursorRequestSchema = z.object({
  cursor: PaginationCursorSchema,
}) satisfies z.ZodType<
  Extract<ListPerpsFundingPaymentsRequest, { cursor: PaginationCursor }>
>;

const ListPerpsFundingPaymentsRequestSchema = z.union([
  ListPerpsFundingPaymentsInitialRequestSchema.transform(
    ({ cursor, ...request }) => ({
      cursor,
      params: toPerpsHistoryParams(request, ONE_DAY_MS),
    }),
  ),
  ListPerpsFundingPaymentsCursorRequestSchema.transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ListPerpsFundingPaymentsRequest =
  | {
      /** Optional Perps instrument identifier filter. */
      instrumentId?: number;
      /** Inclusive start timestamp in milliseconds. */
      start?: number;
      /** Inclusive end timestamp in milliseconds. */
      end?: number;
      /** Opaque cursor returned by a previous page. */
      cursor?: PaginationCursor;
    }
  | {
      /** Opaque cursor returned by a previous page. */
      cursor: PaginationCursor;
    };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function listPerpsFundingPayments(
  api: ServiceClient,
  request: ListPerpsFundingPaymentsRequest = {},
): Paginated<PerpsAccountFundingPayment[]> {
  const { cursor, params } = parseUserInput(
    request,
    ListPerpsFundingPaymentsRequestSchema,
  );
  return paginate((pageCursor) => {
    let state: PerpsDescendingAccountCursorState;
    if (pageCursor === undefined) {
      invariant(
        params !== undefined,
        'Expected initial Perps funding payment params.',
      );
      state = { kind: 'perpsFundingPayments', seenKeys: [], ...params };
    } else {
      state = decodePerpsAccountCursor(
        pageCursor,
        PerpsDescendingAccountCursorStateSchema,
      );
    }
    const { kind: _kind, seenKeys: _seenKeys, ...searchParams } = state;
    const seenKeys = new Set(state.seenKeys);

    return api
      .get('/v1/account/funding', {
        params: toPerpsSearchParams(searchParams),
      })
      .andThen(validateWith(ListPerpsFundingPaymentsResponseSchema))
      .map((response): Page<PerpsAccountFundingPayment[]> => {
        const items = response.data.filter(
          (payment) =>
            !seenKeys.has(
              `${payment.instrumentId}:${payment.timestamp}:${payment.funding}`,
            ),
        );
        return toPerpsDescendingAccountPage({
          getKey: (payment) =>
            `${payment.instrumentId}:${payment.timestamp}:${payment.funding}`,
          getTimestamp: (payment) => payment.timestamp,
          items,
          responseData: response.data,
          responseMore: response.more,
          state,
        });
      });
  }, cursor);
}

const ListPerpsDepositsInitialRequestSchema =
  PerpsHistoryRequestBaseSchema.extend({
    cursor: PaginationCursorSchema.optional(),
    depositStatus: PerpsDepositStatusSchema.optional(),
    hash: TxHashSchema.optional(),
  }) satisfies z.ZodType<
    Exclude<ListPerpsDepositsRequest, { cursor: PaginationCursor }>
  >;

const ListPerpsDepositsCursorRequestSchema = z.object({
  cursor: PaginationCursorSchema,
}) satisfies z.ZodType<
  Extract<ListPerpsDepositsRequest, { cursor: PaginationCursor }>
>;

const ListPerpsDepositsRequestSchema = z.union([
  ListPerpsDepositsInitialRequestSchema.transform(({ cursor, ...request }) => ({
    cursor,
    params: toPerpsHistoryParams(request, NINETY_DAYS_MS),
  })),
  ListPerpsDepositsCursorRequestSchema.transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ListPerpsDepositsRequest =
  | {
      /** Optional deposit status filter. */
      depositStatus?: PerpsDepositStatus;
      /** Optional transaction hash filter. */
      hash?: string;
      /** Inclusive start timestamp in milliseconds. */
      start?: number;
      /** Inclusive end timestamp in milliseconds. */
      end?: number;
      /** Opaque cursor returned by a previous page. */
      cursor?: PaginationCursor;
    }
  | {
      /** Opaque cursor returned by a previous page. */
      cursor: PaginationCursor;
    };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function listPerpsDeposits(
  api: ServiceClient,
  request: ListPerpsDepositsRequest = {},
): Paginated<PerpsDeposit[]> {
  const { cursor, params } = parseUserInput(
    request,
    ListPerpsDepositsRequestSchema,
  );
  return paginate((pageCursor) => {
    let state: PerpsDescendingAccountCursorState;
    if (pageCursor === undefined) {
      invariant(params !== undefined, 'Expected initial Perps deposit params.');
      state = { kind: 'perpsDeposits', seenKeys: [], ...params };
    } else {
      state = decodePerpsAccountCursor(
        pageCursor,
        PerpsDescendingAccountCursorStateSchema,
      );
    }
    const { kind: _kind, seenKeys: _seenKeys, ...searchParams } = state;
    const seenKeys = new Set(state.seenKeys);

    return api
      .get('/v1/account/deposits', {
        params: toPerpsSearchParams(searchParams),
      })
      .andThen(validateWith(ListPerpsDepositsResponseSchema))
      .map((response): Page<PerpsDeposit[]> => {
        const items = response.data.filter(
          (deposit) => !seenKeys.has(deposit.hash),
        );
        return toPerpsDescendingAccountPage({
          getKey: (deposit) => deposit.hash,
          getTimestamp: latestPerpsDepositTimestamp,
          items,
          responseData: response.data,
          responseMore: response.more,
          state,
        });
      });
  }, cursor);
}

const ListPerpsWithdrawalsInitialRequestSchema =
  PerpsHistoryRequestBaseSchema.extend({
    cursor: PaginationCursorSchema.optional(),
    withdrawalStatus: PerpsWithdrawalStatusSchema.optional(),
    hash: TxHashSchema.optional(),
  }) satisfies z.ZodType<
    Exclude<ListPerpsWithdrawalsRequest, { cursor: PaginationCursor }>
  >;

const ListPerpsWithdrawalsCursorRequestSchema = z.object({
  cursor: PaginationCursorSchema,
}) satisfies z.ZodType<
  Extract<ListPerpsWithdrawalsRequest, { cursor: PaginationCursor }>
>;

const ListPerpsWithdrawalsRequestSchema = z.union([
  ListPerpsWithdrawalsInitialRequestSchema.transform(
    ({ cursor, ...request }) => ({
      cursor,
      params: toPerpsHistoryParams(request, NINETY_DAYS_MS),
    }),
  ),
  ListPerpsWithdrawalsCursorRequestSchema.transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ListPerpsWithdrawalsRequest =
  | {
      /** Optional withdrawal status filter. */
      withdrawalStatus?: PerpsWithdrawalStatus;
      /** Optional transaction hash filter. */
      hash?: string;
      /** Inclusive start timestamp in milliseconds. */
      start?: number;
      /** Inclusive end timestamp in milliseconds. */
      end?: number;
      /** Opaque cursor returned by a previous page. */
      cursor?: PaginationCursor;
    }
  | {
      /** Opaque cursor returned by a previous page. */
      cursor: PaginationCursor;
    };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function listPerpsWithdrawals(
  api: ServiceClient,
  request: ListPerpsWithdrawalsRequest = {},
): Paginated<PerpsWithdrawal[]> {
  const { cursor, params } = parseUserInput(
    request,
    ListPerpsWithdrawalsRequestSchema,
  );
  return paginate((pageCursor) => {
    let state: PerpsDescendingAccountCursorState;
    if (pageCursor === undefined) {
      invariant(
        params !== undefined,
        'Expected initial Perps withdrawal params.',
      );
      state = { kind: 'perpsWithdrawals', seenKeys: [], ...params };
    } else {
      state = decodePerpsAccountCursor(
        pageCursor,
        PerpsDescendingAccountCursorStateSchema,
      );
    }
    const { kind: _kind, seenKeys: _seenKeys, ...searchParams } = state;
    const seenKeys = new Set(state.seenKeys);

    return api
      .get('/v1/account/withdrawals', {
        params: toPerpsSearchParams(searchParams),
      })
      .andThen(validateWith(ListPerpsWithdrawalsResponseSchema))
      .map((response): Page<PerpsWithdrawal[]> => {
        const items = response.data.filter(
          (withdrawal) => !seenKeys.has(String(withdrawal.withdrawalId)),
        );
        return toPerpsDescendingAccountPage({
          getKey: (withdrawal) => String(withdrawal.withdrawalId),
          getTimestamp: latestPerpsWithdrawalTimestamp,
          items,
          responseData: response.data,
          responseMore: response.more,
          state,
        });
      });
  }, cursor);
}

const ListPerpsEquityHistoryInitialRequestSchema =
  PerpsIntervalHistoryRequestBaseSchema.extend({
    cursor: PaginationCursorSchema.optional(),
  }) satisfies z.ZodType<
    Exclude<ListPerpsEquityHistoryRequest, { cursor: PaginationCursor }>
  >;

const ListPerpsEquityHistoryCursorRequestSchema = z.object({
  cursor: PaginationCursorSchema,
}) satisfies z.ZodType<
  Extract<ListPerpsEquityHistoryRequest, { cursor: PaginationCursor }>
>;

const ListPerpsEquityHistoryRequestSchema = z.union([
  ListPerpsEquityHistoryInitialRequestSchema.transform(
    ({ cursor, ...request }) => ({
      cursor,
      params: toPerpsIntervalHistoryParams(request),
    }),
  ),
  ListPerpsEquityHistoryCursorRequestSchema.transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ListPerpsEquityHistoryRequest =
  | {
      /** History interval. */
      interval: PerpsPnlInterval;
      /** Inclusive start timestamp in milliseconds. */
      start: number;
      /** Inclusive end timestamp in milliseconds. */
      end?: number;
      /** Opaque cursor returned by a previous page. */
      cursor?: PaginationCursor;
    }
  | {
      /** Opaque cursor returned by a previous page. */
      cursor: PaginationCursor;
    };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function listPerpsEquityHistory(
  api: ServiceClient,
  request: ListPerpsEquityHistoryRequest,
): Paginated<PerpsEquityPoint[]> {
  const { cursor, params } = parseUserInput(
    request,
    ListPerpsEquityHistoryRequestSchema,
  );
  return paginate((pageCursor) => {
    let state: PerpsAscendingAccountCursorState;
    if (pageCursor === undefined) {
      invariant(
        params !== undefined,
        'Expected initial Perps equity history params.',
      );
      state = { kind: 'perpsEquityHistory', ...params };
    } else {
      state = decodePerpsAccountCursor(
        pageCursor,
        PerpsAscendingAccountCursorStateSchema,
      );
    }
    const { kind: _kind, ...searchParams } = state;

    return api
      .get('/v1/account/equity', {
        params: toPerpsSearchParams(searchParams),
      })
      .andThen(validateWith(ListPerpsEquityHistoryResponseSchema))
      .map((response): Page<PerpsEquityPoint[]> => {
        const last = response.data.at(-1);
        const hasMore =
          response.more &&
          last !== undefined &&
          last.timestamp < state.endTimestamp;

        return {
          items: response.data,
          hasMore,
          nextCursor: hasMore
            ? encodePerpsAccountCursor({
                ...state,
                startTimestamp:
                  last.timestamp +
                  perpsHistoryIntervalMilliseconds(state.interval),
              })
            : undefined,
        };
      });
  }, cursor);
}

const ListPerpsPnlHistoryInitialRequestSchema =
  PerpsIntervalHistoryRequestBaseSchema.extend({
    cursor: PaginationCursorSchema.optional(),
  }) satisfies z.ZodType<
    Exclude<ListPerpsPnlHistoryRequest, { cursor: PaginationCursor }>
  >;

const ListPerpsPnlHistoryCursorRequestSchema = z.object({
  cursor: PaginationCursorSchema,
}) satisfies z.ZodType<
  Extract<ListPerpsPnlHistoryRequest, { cursor: PaginationCursor }>
>;

const ListPerpsPnlHistoryRequestSchema = z.union([
  ListPerpsPnlHistoryInitialRequestSchema.transform(
    ({ cursor, ...request }) => ({
      cursor,
      params: toPerpsIntervalHistoryParams(request),
    }),
  ),
  ListPerpsPnlHistoryCursorRequestSchema.transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ListPerpsPnlHistoryRequest =
  | {
      /** History interval. */
      interval: PerpsPnlInterval;
      /** Inclusive start timestamp in milliseconds. */
      start: number;
      /** Inclusive end timestamp in milliseconds. */
      end?: number;
      /** Opaque cursor returned by a previous page. */
      cursor?: PaginationCursor;
    }
  | {
      /** Opaque cursor returned by a previous page. */
      cursor: PaginationCursor;
    };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function listPerpsPnlHistory(
  api: ServiceClient,
  request: ListPerpsPnlHistoryRequest,
): Paginated<PerpsPnlPoint[]> {
  const { cursor, params } = parseUserInput(
    request,
    ListPerpsPnlHistoryRequestSchema,
  );
  return paginate((pageCursor) => {
    let state: PerpsAscendingAccountCursorState;
    if (pageCursor === undefined) {
      invariant(
        params !== undefined,
        'Expected initial Perps PnL history params.',
      );
      state = { kind: 'perpsPnlHistory', ...params };
    } else {
      state = decodePerpsAccountCursor(
        pageCursor,
        PerpsAscendingAccountCursorStateSchema,
      );
    }
    const { kind: _kind, ...searchParams } = state;

    return api
      .get('/v1/account/pnl', {
        params: toPerpsSearchParams(searchParams),
      })
      .andThen(validateWith(ListPerpsPnlHistoryResponseSchema))
      .map((response): Page<PerpsPnlPoint[]> => {
        const last = response.data.at(-1);
        const hasMore =
          response.more &&
          last !== undefined &&
          last.timestamp < state.endTimestamp;

        return {
          items: response.data,
          hasMore,
          nextCursor: hasMore
            ? encodePerpsAccountCursor({
                ...state,
                startTimestamp:
                  last.timestamp +
                  perpsHistoryIntervalMilliseconds(state.interval),
              })
            : undefined,
        };
      });
  }, cursor);
}

const PerpsNotificationsCursorStateSchema = z.object({
  kind: z.literal('perpsNotifications'),
  cursor: z.string().min(1),
  sinceSeq: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
});

type PerpsNotificationsCursorState = z.infer<
  typeof PerpsNotificationsCursorStateSchema
>;

const ListPerpsNotificationsInitialRequestSchema = z.object({
  sinceSeq: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
  cursor: PaginationCursorSchema.optional(),
}) satisfies z.ZodType<
  Exclude<ListPerpsNotificationsRequest, { cursor: PaginationCursor }>
>;

const ListPerpsNotificationsCursorRequestSchema = z.object({
  cursor: PaginationCursorSchema,
}) satisfies z.ZodType<
  Extract<ListPerpsNotificationsRequest, { cursor: PaginationCursor }>
>;

const ListPerpsNotificationsRequestSchema = z.union([
  ListPerpsNotificationsInitialRequestSchema.transform(
    ({ cursor, ...request }) => ({
      cursor,
      params: request,
    }),
  ),
  ListPerpsNotificationsCursorRequestSchema.transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ListPerpsNotificationsRequest =
  | {
      /**
       * Inclusive sequence lower bound used to backfill notifications missed
       * while disconnected. Use the `sequence` of the last notification event
       * processed before the gap. Follow-up pages keep the same bound
       * automatically. Merged results should be deduplicated by notification
       * id.
       */
      sinceSeq?: number;
      /** Maximum number of notifications per page. */
      limit?: number;
      /** Opaque cursor returned by a previous page. */
      cursor?: PaginationCursor;
    }
  | {
      /** Opaque cursor returned by a previous page. */
      cursor: PaginationCursor;
    };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function listPerpsNotifications(
  api: ServiceClient,
  request: ListPerpsNotificationsRequest = {},
): Paginated<PerpsNotificationEntry[]> {
  const { cursor, params } = parseUserInput(
    request,
    ListPerpsNotificationsRequestSchema,
  );
  return paginate((pageCursor) => {
    let state: PerpsNotificationsCursorState | undefined;
    if (pageCursor === undefined) {
      invariant(
        params !== undefined,
        'Expected initial Perps notifications params.',
      );
    } else {
      state = decodePerpsAccountCursor(
        pageCursor,
        PerpsNotificationsCursorStateSchema,
      );
    }
    const sinceSeq = state === undefined ? params?.sinceSeq : state.sinceSeq;
    const limit = state === undefined ? params?.limit : state.limit;

    return api
      .get('/v1/account/notifications', {
        params: toPerpsSearchParams({
          cursor: state?.cursor,
          limit,
          sinceSeq,
        }),
      })
      .andThen(validateWith(ListPerpsNotificationsResponseSchema))
      .map((response): Page<PerpsNotificationEntry[]> => {
        const hasMore = response.has_more && response.next_cursor !== null;
        return {
          items: response.items,
          hasMore,
          nextCursor:
            hasMore && response.next_cursor !== null
              ? encodePerpsAccountCursor({
                  kind: 'perpsNotifications',
                  cursor: response.next_cursor,
                  limit,
                  sinceSeq,
                })
              : undefined,
        };
      });
  }, cursor);
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsUnreadNotificationsCount(
  api: ServiceClient,
): Promise<number> {
  const response = await unwrap(
    api
      .get('/v1/account/notifications', {
        params: toPerpsSearchParams({ limit: 1 }),
      })
      .andThen(validateWith(FetchPerpsUnreadNotificationsCountResponseSchema)),
  );
  return response.unread;
}

const MarkPerpsNotificationsReadByIdsRequestSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
}) satisfies z.ZodType<
  Extract<MarkPerpsNotificationsReadRequest, { ids: string[] }>
>;

const MarkPerpsNotificationsReadUpToRequestSchema = z.object({
  upTo: z.object({
    id: z.string().min(1),
    timestamp: z.number().int().nonnegative(),
  }),
}) satisfies z.ZodType<
  Exclude<MarkPerpsNotificationsReadRequest, { ids: string[] }>
>;

const MarkPerpsNotificationsReadRequestSchema = z.union([
  MarkPerpsNotificationsReadByIdsRequestSchema.transform(({ ids }) => ({
    ids,
  })),
  MarkPerpsNotificationsReadUpToRequestSchema.transform(({ upTo }) => ({
    before: encodePerpsNotificationsReadCursor(upTo),
  })),
]);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type MarkPerpsNotificationsReadRequest =
  | {
      /** Notification ids to mark read. */
      ids: string[];
    }
  | {
      /**
       * Mark every notification at or before this notification read,
       * inclusive.
       */
      upTo: {
        /** Notification id. */
        id: string;
        /** Notification timestamp in milliseconds. */
        timestamp: number;
      };
    };

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function markPerpsNotificationsRead(
  api: ServiceClient,
  request: MarkPerpsNotificationsReadRequest,
): Promise<void> {
  const body = parseUserInput(request, MarkPerpsNotificationsReadRequestSchema);
  const response = await unwrap(
    api
      .post('/v1/account/notifications/read', { json: body })
      .andThen(validateWith(MarkPerpsNotificationsReadResponseSchema)),
  );
  if (response.status === 'err') {
    throw new RequestRejectedError(
      response.error ?? 'Perps notifications read request was rejected.',
      { status: 200 },
    );
  }
}

// The upstream read cursor is base64url-encoded JSON keyed as {ts, id}.
function encodePerpsNotificationsReadCursor(upTo: {
  id: string;
  timestamp: number;
}): string {
  return btoa(JSON.stringify({ ts: upTo.timestamp, id: upTo.id }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function toPerpsHistoryParams<T extends Record<string, unknown>>(
  request: T & { end?: number; start?: number },
  defaultWindowMs: number,
): Omit<T, 'end' | 'start'> & PerpsHistoryParams {
  const now = Date.now();
  const { end, start, ...rest } = request;
  return {
    ...rest,
    endTimestamp: end ?? now,
    startTimestamp: start ?? now - defaultWindowMs,
  };
}

function toPerpsIntervalHistoryParams(
  request: z.output<typeof PerpsIntervalHistoryRequestBaseSchema>,
): PerpsIntervalHistoryParams {
  return {
    endTimestamp: request.end ?? Date.now(),
    interval: request.interval,
    startTimestamp: request.start,
  };
}

function decodePerpsAccountCursor<T>(
  cursor: PaginationCursor,
  schema: z.ZodType<T>,
): T {
  try {
    return schema.parse(JSON.parse(atob(cursor)));
  } catch (error) {
    throw new UserInputError('Invalid Perps account pagination cursor', {
      cause: error,
    });
  }
}

function encodePerpsAccountCursor(
  state:
    | PerpsAscendingAccountCursorState
    | PerpsDescendingAccountCursorState
    | PerpsNotificationsCursorState,
): PaginationCursor {
  return toPaginationCursor(btoa(JSON.stringify(state)));
}

function toPerpsSearchParams(params: object): URLSearchParams {
  return toSearchParams(
    params as Record<string, string | number | boolean | undefined>,
    snakeCase(),
  );
}

function latestPerpsDepositTimestamp(deposit: PerpsDeposit): number {
  return deposit.confirmedTimestamp ?? deposit.createdTimestamp;
}

function latestPerpsWithdrawalTimestamp(withdrawal: PerpsWithdrawal): number {
  return withdrawal.confirmedTimestamp ?? withdrawal.createdTimestamp;
}

function toPerpsDescendingAccountPage<T>(request: {
  getKey: (item: T) => string;
  getTimestamp: (item: T) => number;
  items: T[];
  responseData: T[];
  responseMore: boolean;
  state: PerpsDescendingAccountCursorState;
}): Page<T[]> {
  const rawLast = request.responseData.at(-1);
  const last = request.items.at(-1);
  const cursorTimestamp =
    (last === undefined ? undefined : request.getTimestamp(last)) ??
    (rawLast === undefined ? undefined : request.getTimestamp(rawLast));
  const hasMore =
    request.responseMore &&
    cursorTimestamp !== undefined &&
    cursorTimestamp > request.state.startTimestamp;

  if (!hasMore) return { items: request.items, hasMore };

  const endTimestamp =
    last === undefined ? cursorTimestamp - 1 : cursorTimestamp;
  const seen = new Set(
    request.state.endTimestamp === endTimestamp ? request.state.seenKeys : [],
  );
  for (const item of request.items) {
    if (request.getTimestamp(item) === endTimestamp) {
      seen.add(request.getKey(item));
    }
  }

  return {
    items: request.items,
    hasMore,
    nextCursor: encodePerpsAccountCursor({
      ...request.state,
      endTimestamp,
      seenKeys: Array.from(seen),
    }),
  };
}

function perpsHistoryIntervalMilliseconds(
  interval: z.output<typeof PerpsPnlIntervalSchema>,
): number {
  switch (interval) {
    case '1h':
      return 60 * 60 * 1000;
    case '4h':
      return 4 * 60 * 60 * 1000;
    case '1d':
      return ONE_DAY_MS;
    case '1w':
      return 7 * ONE_DAY_MS;
  }
  invariant(
    false,
    `Unsupported Perps account history interval: ${String(interval)}`,
  );
}

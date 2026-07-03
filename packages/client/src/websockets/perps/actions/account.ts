import {
  type PaginationCursor,
  PaginationCursorSchema,
  TxHashSchema,
  toPaginationCursor,
} from '@polymarket/bindings';
import {
  FetchPerpsAccountConfigResponseSchema,
  FetchPerpsAccountStatsResponseSchema,
  FetchPerpsBalancesResponseSchema,
  FetchPerpsOpenOrdersResponseSchema,
  FetchPerpsOrdersResponseSchema,
  FetchPerpsPortfolioResponseSchema,
  ListPerpsDepositsResponseSchema,
  ListPerpsEquityHistoryResponseSchema,
  ListPerpsFillsResponseSchema,
  ListPerpsFundingPaymentsResponseSchema,
  ListPerpsPnlHistoryResponseSchema,
  ListPerpsWithdrawalsResponseSchema,
  type PerpsAccountConfig,
  type PerpsAccountFill,
  type PerpsAccountFundingPayment,
  type PerpsAccountStats,
  type PerpsBalance,
  PerpsClientOrderIdSchema,
  type PerpsDeposit,
  PerpsDepositStatusSchema,
  type PerpsEquityPoint,
  type PerpsInstrumentId,
  PerpsInstrumentIdSchema,
  type PerpsOrder,
  PerpsOrderIdSchema,
  PerpsPnlIntervalSchema,
  type PerpsPnlPoint,
  type PerpsPortfolio,
  type PerpsWithdrawal,
  PerpsWithdrawalStatusSchema,
} from '@polymarket/bindings/perps';
import { invariant, unwrap } from '@polymarket/types';
import { z } from 'zod';
import { snakeCase, toSearchParams } from '../../../actions/params';
import { UserInputError } from '../../../errors';
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
  'perpsFills',
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

export async function fetchPerpsBalances(
  api: ServiceClient,
): Promise<PerpsBalance[]> {
  return await unwrap(
    api
      .get('/v1/account/balances')
      .andThen(validateWith(FetchPerpsBalancesResponseSchema)),
  );
}

export async function fetchPerpsPortfolio(
  api: ServiceClient,
): Promise<PerpsPortfolio> {
  return await unwrap(
    api
      .get('/v1/account/portfolio')
      .andThen(validateWith(FetchPerpsPortfolioResponseSchema)),
  );
}

export async function fetchPerpsStats(
  api: ServiceClient,
): Promise<PerpsAccountStats> {
  return await unwrap(
    api
      .get('/v1/account/stats')
      .andThen(validateWith(FetchPerpsAccountStatsResponseSchema)),
  );
}

const FetchPerpsAccountConfigRequestSchema = z
  .object({
    instrumentId: PerpsInstrumentIdSchema.optional(),
  })
  .default({});

export type FetchPerpsAccountConfigRequest = z.input<
  typeof FetchPerpsAccountConfigRequestSchema
>;

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
  .default({});

export type FetchPerpsOpenOrdersRequest = z.input<
  typeof FetchPerpsOpenOrdersRequestSchema
>;

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

const FetchPerpsOrdersRequestSchema = z
  .object({
    orderId: PerpsOrderIdSchema.optional(),
    clientOrderId: PerpsClientOrderIdSchema.optional(),
    instrumentId: PerpsInstrumentIdSchema.optional(),
    start: TimestampInputSchema.optional(),
    end: TimestampInputSchema.optional(),
  })
  .default({})
  .transform(({ end, start, ...request }) => ({
    ...request,
    endTimestamp: end,
    startTimestamp: start,
  }));

export type FetchPerpsOrdersRequest = z.input<
  typeof FetchPerpsOrdersRequestSchema
>;

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

const ListPerpsFillsRequestSchema = z.union([
  PerpsHistoryRequestBaseSchema.extend({
    cursor: PaginationCursorSchema.optional(),
  }).transform(({ cursor, ...request }) => ({
    cursor,
    params: toPerpsHistoryParams(request, ONE_DAY_MS),
  })),
  z.object({ cursor: PaginationCursorSchema }).transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

export type ListPerpsFillsRequest = z.input<typeof ListPerpsFillsRequestSchema>;

export function listPerpsFills(
  api: ServiceClient,
  request: ListPerpsFillsRequest = {},
): Paginated<PerpsAccountFill[]> {
  const { cursor, params } = parseUserInput(
    request,
    ListPerpsFillsRequestSchema,
  );
  return paginate((pageCursor) => {
    let state: PerpsDescendingAccountCursorState;
    if (pageCursor === undefined) {
      invariant(params !== undefined, 'Expected initial Perps fills params.');
      state = { kind: 'perpsFills', seenKeys: [], ...params };
    } else {
      state = decodePerpsAccountCursor(
        pageCursor,
        PerpsDescendingAccountCursorStateSchema,
      );
    }
    const { kind: _kind, seenKeys: _seenKeys, ...searchParams } = state;
    const seenKeys = new Set(state.seenKeys);

    return api
      .get('/v1/account/fills', {
        params: toPerpsSearchParams(searchParams),
      })
      .andThen(validateWith(ListPerpsFillsResponseSchema))
      .map((response): Page<PerpsAccountFill[]> => {
        const items = response.data.filter(
          (fill) => !seenKeys.has(String(fill.tradeId)),
        );
        return toPerpsDescendingAccountPage({
          getKey: (fill) => String(fill.tradeId),
          getTimestamp: (fill) => fill.timestamp,
          items,
          responseData: response.data,
          responseMore: response.more,
          state,
        });
      });
  }, cursor);
}

const ListPerpsFundingPaymentsRequestSchema = z.union([
  PerpsHistoryRequestBaseSchema.extend({
    cursor: PaginationCursorSchema.optional(),
    instrumentId: PerpsInstrumentIdSchema.optional(),
  }).transform(({ cursor, ...request }) => ({
    cursor,
    params: toPerpsHistoryParams(request, ONE_DAY_MS),
  })),
  z.object({ cursor: PaginationCursorSchema }).transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

export type ListPerpsFundingPaymentsRequest = z.input<
  typeof ListPerpsFundingPaymentsRequestSchema
>;

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

const ListPerpsDepositsRequestSchema = z.union([
  PerpsHistoryRequestBaseSchema.extend({
    cursor: PaginationCursorSchema.optional(),
    depositStatus: PerpsDepositStatusSchema.optional(),
    hash: TxHashSchema.optional(),
  }).transform(({ cursor, ...request }) => ({
    cursor,
    params: toPerpsHistoryParams(request, NINETY_DAYS_MS),
  })),
  z.object({ cursor: PaginationCursorSchema }).transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

export type ListPerpsDepositsRequest = z.input<
  typeof ListPerpsDepositsRequestSchema
>;

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

const ListPerpsWithdrawalsRequestSchema = z.union([
  PerpsHistoryRequestBaseSchema.extend({
    cursor: PaginationCursorSchema.optional(),
    withdrawalStatus: PerpsWithdrawalStatusSchema.optional(),
    hash: TxHashSchema.optional(),
  }).transform(({ cursor, ...request }) => ({
    cursor,
    params: toPerpsHistoryParams(request, NINETY_DAYS_MS),
  })),
  z.object({ cursor: PaginationCursorSchema }).transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

export type ListPerpsWithdrawalsRequest = z.input<
  typeof ListPerpsWithdrawalsRequestSchema
>;

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

const ListPerpsEquityHistoryRequestSchema = z.union([
  PerpsIntervalHistoryRequestBaseSchema.extend({
    cursor: PaginationCursorSchema.optional(),
  }).transform(({ cursor, ...request }) => ({
    cursor,
    params: toPerpsIntervalHistoryParams(request),
  })),
  z.object({ cursor: PaginationCursorSchema }).transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

export type ListPerpsEquityHistoryRequest = z.input<
  typeof ListPerpsEquityHistoryRequestSchema
>;

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

const ListPerpsPnlHistoryRequestSchema = z.union([
  PerpsIntervalHistoryRequestBaseSchema.extend({
    cursor: PaginationCursorSchema.optional(),
  }).transform(({ cursor, ...request }) => ({
    cursor,
    params: toPerpsIntervalHistoryParams(request),
  })),
  z.object({ cursor: PaginationCursorSchema }).transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

export type ListPerpsPnlHistoryRequest = z.input<
  typeof ListPerpsPnlHistoryRequestSchema
>;

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
  state: PerpsAscendingAccountCursorState | PerpsDescendingAccountCursorState,
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

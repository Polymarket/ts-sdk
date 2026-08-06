import {
  type PaginationCursor,
  PaginationCursorSchema,
  toPaginationCursor,
} from '@polymarket/bindings';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  FetchPerpsCandlesResponseSchema,
  FetchPerpsFeesResponseSchema,
  FetchPerpsFundingHistoryResponseSchema,
  FetchPerpsInstrumentsResponseSchema,
  FetchPerpsStatisticsResponseSchema,
  FetchPerpsTickersResponseSchema,
  FetchPerpsTradesResponseSchema,
  type PerpsBook,
  PerpsBookSchema,
  type PerpsCandle,
  PerpsCreateProxyResponseSchema,
  type PerpsCredentials,
  PerpsCredentialsResponseSchema,
  PerpsDeleteProxyResponseSchema,
  type PerpsFeeScheduleEntry,
  type PerpsFundingRate,
  type PerpsInstrument,
  type PerpsInstrumentCategory,
  PerpsInstrumentCategorySchema,
  PerpsInstrumentIdSchema,
  type PerpsKlineInterval,
  PerpsKlineIntervalSchema,
  type PerpsPublicTrade,
  type PerpsTicker,
  PerpsTradeIdSchema,
  type PerpsWithdrawalId,
  PerpsWithdrawResponseSchema,
} from '@polymarket/bindings/perps';
import {
  type EvmAddress,
  type EvmSignature,
  expectEvmAddress,
  expectPrivateKey,
  invariant,
  isPrivateKey,
  isSameEvmAddress,
  type PrivateKey,
  unwrap,
} from '@polymarket/types';
import { Address, Secp256k1 } from 'ox';
import { z } from 'zod';
import { MAX_UINT256, perpsDepositCall } from '../abis';
import type { BaseClient, BaseSecureClient } from '../clients';
import {
  CancelledSigningError,
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import { type Paginated, paginate } from '../pagination';
import { validateWith } from '../response';
import {
  expectTransactionHandle,
  type SignerTransactionRequest,
  type TransactionHandle,
  type TypedDataPayload,
} from '../types';
import type { PerpsSession } from '../websockets/perps/session';
import {
  createPerpsOpTypedDataPayload,
  type PerpsSignedOp,
} from '../websockets/perps/signing';
import {
  completeWith,
  type SendPerpsDepositTransactionRequest,
  signerTransactionRequest,
} from '../workflow';
import {
  GaslessTransactionMetadataSchema,
  type GaslessWorkflowRequest,
  prepareGaslessTransaction,
} from './gasless';

export type {
  ArmPerpsAutoCancelRequest,
  CancelAllPerpsOrdersRequest,
  CancelPerpsOrderRequest,
  CancelPerpsOrdersRequest,
  DisarmPerpsAutoCancelRequest,
  FetchPerpsAccountConfigRequest,
  FetchPerpsOpenOrdersRequest,
  FetchPerpsOrdersRequest,
  ListPerpsDepositsRequest,
  ListPerpsEquityHistoryRequest,
  ListPerpsFillsRequest,
  ListPerpsFundingPaymentsRequest,
  ListPerpsNotificationsRequest,
  ListPerpsPnlHistoryRequest,
  ListPerpsWithdrawalsRequest,
  MarkPerpsNotificationsReadRequest,
  PerpsAutoCancelStatus,
  PerpsCancelOrderResult,
  PerpsOrderRequest,
  PerpsPlacedTpSlOrder,
  PerpsPlacedTpSlOrders,
  PerpsPlaceFokOrderRequest,
  PerpsPlaceGtcOrderRequest,
  PerpsPlaceIocOrderRequest,
  PerpsPositionTpSlTrigger,
  PerpsPostOrderAck,
  PerpsSession,
  PerpsSessionAccountError,
  PerpsSessionEvent,
  PerpsSessionLifecycleError,
  PerpsSessionTradingError,
  PerpsTpSlTrigger,
  PerpsUpdateLeverageResult,
  PlacePerpsOrderRequest,
  PlacePerpsOrderResult,
  PlacePerpsOrderWithTpSlRequest,
  PlacePerpsOrderWithTpSlResult,
  PlacePerpsPositionTpSlRequest,
  PlacePerpsPositionTpSlResult,
  PostPerpsOrdersRequest,
  UpdatePerpsLeverageRequest,
  UpdatePerpsMarginRequest,
} from '../websockets/perps/session';
export {
  ArmPerpsAutoCancelError,
  UpdatePerpsLeverageError,
  UpdatePerpsMarginError,
} from '../websockets/perps/session';

import { snakeCase, toSearchParams } from './params';

type PerpsPublicReadError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

const PerpsPublicReadError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

const TimestampInputSchema = z.number().int().nonnegative();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type PerpsCandlesParams = {
  instrumentId: z.output<typeof PerpsInstrumentIdSchema>;
  interval: PerpsKlineInterval;
  startTimestamp: number;
  endTimestamp: number;
};

type PerpsTimeRangeParams = {
  instrumentId: z.output<typeof PerpsInstrumentIdSchema>;
  startTimestamp: number;
  endTimestamp: number;
};

const FetchPerpsInstrumentsRequestSchema = z
  .object({
    instrumentId: PerpsInstrumentIdSchema.optional(),
    category: PerpsInstrumentCategorySchema.optional(),
  })
  .default({}) satisfies z.ZodType<FetchPerpsInstrumentsRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsInstrumentsRequest = {
  /** Perps instrument identifier to fetch. */
  instrumentId?: number;
  /** Optional instrument category filter. */
  category?: PerpsInstrumentCategory;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsInstrumentsError = PerpsPublicReadError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsInstrumentsError = PerpsPublicReadError;

/**
 * Fetches Perps instruments.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchPerpsInstrumentsError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsInstruments(
  client: BaseClient,
  request?: FetchPerpsInstrumentsRequest,
): Promise<PerpsInstrument[]> {
  const params = parseUserInput(request, FetchPerpsInstrumentsRequestSchema);

  return unwrap(
    client.perps
      .get('/v1/info/instruments', {
        params: toSearchParams(params, snakeCase()),
      })
      .andThen(validateWith(FetchPerpsInstrumentsResponseSchema)),
  );
}

const FetchPerpsTickerRequestSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
}) satisfies z.ZodType<FetchPerpsTickerRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsTickerRequest = {
  /** Perps instrument identifier whose ticker should be fetched. */
  instrumentId: number;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsTickerError = PerpsPublicReadError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsTickerError = PerpsPublicReadError;

/**
 * Fetches the current Perps ticker for an instrument.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchPerpsTickerError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsTicker(
  client: BaseClient,
  request: FetchPerpsTickerRequest,
): Promise<PerpsTicker> {
  const params = parseUserInput(request, FetchPerpsTickerRequestSchema);
  const [ticker] = await fetchPerpsTickers(client, params);

  if (ticker === undefined) {
    throw new UnexpectedResponseError(
      `Perps ticker ${params.instrumentId} was not returned by the API`,
    );
  }

  return ticker;
}

const FetchPerpsTickersRequestSchema = z
  .object({
    instrumentId: PerpsInstrumentIdSchema.optional(),
  })
  .default({}) satisfies z.ZodType<FetchPerpsTickersRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsTickersRequest = {
  /** Optional Perps instrument identifier filter. */
  instrumentId?: number;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsTickersError = PerpsPublicReadError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsTickersError = PerpsPublicReadError;

/**
 * Fetches current Perps tickers.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchPerpsTickersError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsTickers(
  client: BaseClient,
  request?: FetchPerpsTickersRequest,
): Promise<PerpsTicker[]> {
  const params = parseUserInput(request, FetchPerpsTickersRequestSchema);
  const query = toSearchParams(params, snakeCase());
  const [tickers, statistics] = await Promise.all([
    unwrap(
      client.perps
        .get('/v1/info/tickers', { params: query })
        .andThen(validateWith(FetchPerpsTickersResponseSchema)),
    ),
    unwrap(
      client.perps
        .get('/v1/info/statistics', { params: query })
        .andThen(validateWith(FetchPerpsStatisticsResponseSchema)),
    ),
  ]);
  const statisticsByInstrument = new Map(
    statistics.map((statistic) => [statistic.instrumentId, statistic]),
  );

  return tickers.map((ticker) => {
    const statistic = statisticsByInstrument.get(ticker.instrumentId);

    return {
      ...ticker,
      openPrice: statistic?.openPrice,
      volume24h: statistic?.volume,
    };
  });
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsBookDepth = 10 | 100 | 500 | 1000;

const PerpsBookDepthSchema: z.ZodType<PerpsBookDepth> = z.union([
  z.literal(10),
  z.literal(100),
  z.literal(500),
  z.literal(1000),
]);

const FetchPerpsBookRequestSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  depth: PerpsBookDepthSchema.default(100),
}) satisfies z.ZodType<FetchPerpsBookRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsBookRequest = {
  /** Perps instrument identifier whose order book should be fetched. */
  instrumentId: number;
  /** Number of price levels to return on each side. */
  depth?: PerpsBookDepth;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsBookError = PerpsPublicReadError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsBookError = PerpsPublicReadError;

/**
 * Fetches a Perps order book.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchPerpsBookError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsBook(
  client: BaseClient,
  request: FetchPerpsBookRequest,
): Promise<PerpsBook> {
  const params = parseUserInput(request, FetchPerpsBookRequestSchema);

  return unwrap(
    client.perps
      .get('/v1/info/book', {
        params: toSearchParams(params, snakeCase()),
      })
      .andThen(validateWith(PerpsBookSchema)),
  );
}

const ListPerpsCandlesInitialRequestSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  interval: PerpsKlineIntervalSchema,
  start: TimestampInputSchema.optional(),
  end: TimestampInputSchema.optional(),
  cursor: PaginationCursorSchema.optional(),
}) satisfies z.ZodType<
  Extract<ListPerpsCandlesRequest, { instrumentId: number }>
>;

const ListPerpsCandlesCursorRequestSchema = z.object({
  cursor: PaginationCursorSchema,
}) satisfies z.ZodType<
  Extract<ListPerpsCandlesRequest, { cursor: PaginationCursor }>
>;

const ListPerpsCandlesRequestSchema = z.union([
  ListPerpsCandlesInitialRequestSchema.transform(({ cursor, ...request }) => ({
    cursor,
    params: toPerpsCandlesParams(request),
  })),
  ListPerpsCandlesCursorRequestSchema.transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ListPerpsCandlesRequest =
  | {
      /** Perps instrument identifier whose candles should be listed. */
      instrumentId: number;
      /** Candle interval. */
      interval: PerpsKlineInterval;
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
export type ListPerpsCandlesError = PerpsPublicReadError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ListPerpsCandlesError = PerpsPublicReadError;

/**
 * Lists Perps candles for an instrument with SDK-owned pagination.
 *
 * @remarks
 * Defaults to the past 24 hours when `start` is omitted.
 *
 * @throws {@link ListPerpsCandlesError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function listPerpsCandles(
  client: BaseClient,
  request: ListPerpsCandlesRequest,
): Paginated<PerpsCandle[]> {
  const { cursor: initialCursor, params } = parseUserInput(
    request,
    ListPerpsCandlesRequestSchema,
  );

  return paginate((cursor) => {
    const state =
      cursor === undefined
        ? createInitialPerpsCandlesCursor(params)
        : decodePerpsCandlesCursor(cursor);

    return client.perps
      .get('/v1/info/klines', {
        params: toSearchParams(
          {
            endTimestamp: state.endTimestamp,
            instrumentId: state.instrumentId,
            interval: state.interval,
            startTimestamp: state.startTimestamp,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(FetchPerpsCandlesResponseSchema))
      .map((response) => {
        const last = response.data.at(-1);
        const hasMore = response.more && last !== undefined;

        return {
          items: response.data,
          hasMore,
          nextCursor: hasMore
            ? encodePerpsCursor({
                ...state,
                startTimestamp:
                  last.timestamp +
                  perpsKlineIntervalMilliseconds(state.interval),
              })
            : undefined,
        };
      });
  }, initialCursor);
}

const TimeRangePerpsRequestBaseSchema = z.object({
  instrumentId: PerpsInstrumentIdSchema,
  start: TimestampInputSchema.optional(),
  end: TimestampInputSchema.optional(),
});

const ListPerpsFundingHistoryInitialRequestSchema =
  TimeRangePerpsRequestBaseSchema.extend({
    cursor: PaginationCursorSchema.optional(),
  }) satisfies z.ZodType<
    Extract<ListPerpsFundingHistoryRequest, { instrumentId: number }>
  >;

const ListPerpsFundingHistoryCursorRequestSchema = z.object({
  cursor: PaginationCursorSchema,
}) satisfies z.ZodType<
  Extract<ListPerpsFundingHistoryRequest, { cursor: PaginationCursor }>
>;

const ListPerpsFundingHistoryRequestSchema = z.union([
  ListPerpsFundingHistoryInitialRequestSchema.transform(
    ({ cursor, ...request }) => ({
      cursor,
      params: toPerpsTimeRangeParams(request),
    }),
  ),
  ListPerpsFundingHistoryCursorRequestSchema.transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

const ListPerpsTradesInitialRequestSchema =
  TimeRangePerpsRequestBaseSchema.extend({
    cursor: PaginationCursorSchema.optional(),
  }) satisfies z.ZodType<
    Extract<ListPerpsTradesRequest, { instrumentId: number }>
  >;

const ListPerpsTradesCursorRequestSchema = z.object({
  cursor: PaginationCursorSchema,
}) satisfies z.ZodType<
  Extract<ListPerpsTradesRequest, { cursor: PaginationCursor }>
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ListPerpsFundingHistoryRequest =
  | {
      /** Perps instrument identifier whose funding history should be listed. */
      instrumentId: number;
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
export type ListPerpsFundingHistoryError = PerpsPublicReadError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ListPerpsFundingHistoryError = PerpsPublicReadError;

/**
 * Lists Perps funding-rate history for an instrument with SDK-owned pagination.
 *
 * @remarks
 * Defaults to the past 24 hours when `start` is omitted.
 *
 * @throws {@link ListPerpsFundingHistoryError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function listPerpsFundingHistory(
  client: BaseClient,
  request: ListPerpsFundingHistoryRequest,
): Paginated<PerpsFundingRate[]> {
  const { cursor: initialCursor, params } = parseUserInput(
    request,
    ListPerpsFundingHistoryRequestSchema,
  );

  return paginate((cursor) => {
    const state =
      cursor === undefined
        ? createInitialPerpsFundingCursor(params)
        : decodePerpsFundingCursor(cursor);

    return client.perps
      .get('/v1/info/funding', {
        params: toSearchParams(
          {
            endTimestamp: state.endTimestamp,
            instrumentId: state.instrumentId,
            startTimestamp: state.startTimestamp,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(FetchPerpsFundingHistoryResponseSchema))
      .map((response) => {
        const last = response.data.at(-1);
        const hasMore =
          response.more &&
          last !== undefined &&
          last.timestamp > state.startTimestamp;

        return {
          items: response.data,
          hasMore,
          nextCursor: hasMore
            ? encodePerpsCursor({
                ...state,
                endTimestamp: last.timestamp - 1,
              })
            : undefined,
        };
      });
  }, initialCursor);
}

const ListPerpsTradesRequestSchema = z.union([
  ListPerpsTradesInitialRequestSchema.transform(({ cursor, ...request }) => ({
    cursor,
    params: toPerpsTimeRangeParams(request),
  })),
  ListPerpsTradesCursorRequestSchema.transform(({ cursor }) => ({
    cursor,
    params: undefined,
  })),
]);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ListPerpsTradesRequest =
  | {
      /** Perps instrument identifier whose recent trades should be listed. */
      instrumentId: number;
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
export type ListPerpsTradesError = PerpsPublicReadError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ListPerpsTradesError = PerpsPublicReadError;

/**
 * Lists recent Perps trades for an instrument with SDK-owned pagination.
 *
 * @remarks
 * Defaults to the past 24 hours when `start` is omitted.
 *
 * @throws {@link ListPerpsTradesError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function listPerpsTrades(
  client: BaseClient,
  request: ListPerpsTradesRequest,
): Paginated<PerpsPublicTrade[]> {
  const { cursor: initialCursor, params } = parseUserInput(
    request,
    ListPerpsTradesRequestSchema,
  );

  return paginate((cursor) => {
    const state =
      cursor === undefined
        ? createInitialPerpsTradesCursor(params)
        : decodePerpsTradesCursor(cursor);
    const seenTradeIds = new Set(state.seenTradeIds);

    return client.perps
      .get('/v1/info/trades', {
        params: toSearchParams(
          {
            endTimestamp: state.endTimestamp,
            instrumentId: state.instrumentId,
            startTimestamp: state.startTimestamp,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(FetchPerpsTradesResponseSchema))
      .map((response) => {
        const items = response.data.filter(
          (trade) => !seenTradeIds.has(trade.tradeId),
        );
        const rawLast = response.data.at(-1);
        const last = items.at(-1);
        const cursorTimestamp = last?.timestamp ?? rawLast?.timestamp;
        const hasMore =
          response.more &&
          cursorTimestamp !== undefined &&
          cursorTimestamp > state.startTimestamp;

        return {
          items,
          hasMore,
          nextCursor: hasMore
            ? encodePerpsCursor({
                ...state,
                endTimestamp:
                  last === undefined ? cursorTimestamp - 1 : cursorTimestamp,
                seenTradeIds:
                  last === undefined
                    ? []
                    : nextPerpsTradeCursorSeenIds(state, items, last),
              })
            : undefined,
        };
      });
  }, initialCursor);
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsFeesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsFeesError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
);

/**
 * Fetches the Perps fee schedule.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchPerpsFeesError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsFees(
  client: BaseClient,
): Promise<PerpsFeeScheduleEntry[]> {
  const response = await unwrap(
    client.perps
      .get('/v1/info/fees')
      .andThen(validateWith(FetchPerpsFeesResponseSchema)),
  );

  return response.feeSchedule;
}

const PerpsCandlesCursorStateSchema = z.object({
  kind: z.literal('perpsCandles'),
  instrumentId: PerpsInstrumentIdSchema,
  interval: PerpsKlineIntervalSchema,
  startTimestamp: TimestampInputSchema,
  endTimestamp: TimestampInputSchema,
});

const PerpsFundingCursorStateSchema = z.object({
  kind: z.literal('perpsFundingHistory'),
  instrumentId: PerpsInstrumentIdSchema,
  startTimestamp: TimestampInputSchema,
  endTimestamp: TimestampInputSchema,
});

const PerpsTradesCursorStateSchema = z.object({
  kind: z.literal('perpsTrades'),
  instrumentId: PerpsInstrumentIdSchema,
  startTimestamp: TimestampInputSchema,
  endTimestamp: TimestampInputSchema,
  seenTradeIds: z.array(PerpsTradeIdSchema),
});

type PerpsCandlesCursorState = z.infer<typeof PerpsCandlesCursorStateSchema>;
type PerpsFundingCursorState = z.infer<typeof PerpsFundingCursorStateSchema>;
type PerpsTradesCursorState = z.infer<typeof PerpsTradesCursorStateSchema>;

function toPerpsCandlesParams(
  request: Omit<
    z.output<typeof ListPerpsCandlesInitialRequestSchema>,
    'cursor'
  >,
): PerpsCandlesParams {
  const now = Date.now();
  return {
    endTimestamp: request.end ?? now,
    instrumentId: request.instrumentId,
    interval: request.interval,
    startTimestamp: request.start ?? now - ONE_DAY_MS,
  };
}

function toPerpsTimeRangeParams(
  request: z.output<typeof TimeRangePerpsRequestBaseSchema>,
): PerpsTimeRangeParams {
  const now = Date.now();
  return {
    endTimestamp: request.end ?? now,
    instrumentId: request.instrumentId,
    startTimestamp: request.start ?? now - ONE_DAY_MS,
  };
}

function createInitialPerpsCandlesCursor(
  params: PerpsCandlesParams | undefined,
): PerpsCandlesCursorState {
  invariant(params !== undefined, 'Expected initial Perps candles params.');
  return { kind: 'perpsCandles', ...params };
}

function createInitialPerpsFundingCursor(
  params: PerpsTimeRangeParams | undefined,
): PerpsFundingCursorState {
  invariant(params !== undefined, 'Expected initial Perps funding params.');
  return { kind: 'perpsFundingHistory', ...params };
}

function createInitialPerpsTradesCursor(
  params: PerpsTimeRangeParams | undefined,
): PerpsTradesCursorState {
  invariant(params !== undefined, 'Expected initial Perps trades params.');
  return { kind: 'perpsTrades', seenTradeIds: [], ...params };
}

function decodePerpsCandlesCursor(
  cursor: PaginationCursor,
): PerpsCandlesCursorState {
  return decodePerpsCursor(cursor, PerpsCandlesCursorStateSchema);
}

function decodePerpsFundingCursor(
  cursor: PaginationCursor,
): PerpsFundingCursorState {
  return decodePerpsCursor(cursor, PerpsFundingCursorStateSchema);
}

function decodePerpsTradesCursor(
  cursor: PaginationCursor,
): PerpsTradesCursorState {
  return decodePerpsCursor(cursor, PerpsTradesCursorStateSchema);
}

function decodePerpsCursor<T>(
  cursor: PaginationCursor,
  schema: z.ZodType<T>,
): T {
  try {
    return schema.parse(JSON.parse(atob(cursor)));
  } catch (error) {
    throw new UserInputError('Invalid Perps pagination cursor', {
      cause: error,
    });
  }
}

function encodePerpsCursor(
  state:
    | PerpsCandlesCursorState
    | PerpsFundingCursorState
    | PerpsTradesCursorState,
): PaginationCursor {
  return toPaginationCursor(btoa(JSON.stringify(state)));
}

function perpsKlineIntervalMilliseconds(interval: PerpsKlineInterval): number {
  switch (interval) {
    case '1s':
      return 1000;
    case '1m':
      return 60 * 1000;
    case '5m':
      return 5 * 60 * 1000;
    case '15m':
      return 15 * 60 * 1000;
    case '1h':
      return 60 * 60 * 1000;
    case '4h':
      return 4 * 60 * 60 * 1000;
    case '1d':
      return 24 * 60 * 60 * 1000;
    case '1w':
      return 7 * 24 * 60 * 60 * 1000;
  }
  invariant(false, `Unsupported Perps kline interval: ${String(interval)}`);
}

function nextPerpsTradeCursorSeenIds(
  state: PerpsTradesCursorState,
  items: PerpsPublicTrade[],
  last: PerpsPublicTrade,
) {
  const seen = new Set(
    state.endTimestamp === last.timestamp ? state.seenTradeIds : [],
  );
  for (const item of items) {
    if (item.timestamp === last.timestamp) seen.add(item.tradeId);
  }
  return Array.from(seen);
}

const PrivateKeySchema = z.custom<PrivateKey>(
  (value) => isPrivateKey(value),
  'Expected a hex-encoded 32-byte private key.',
);

const PerpsCredentialsSchema = z.object({
  proxy: z.string().transform((value) => expectEvmAddress(value)),
  privateKey: PrivateKeySchema,
  secret: z.string().min(1),
  expiresAt: z.number().int().positive(),
});

const DEFAULT_PERPS_CREDENTIAL_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000;

const CreatePerpsSessionRequestSchema = z.strictObject({
  expiresIn: z
    .number()
    .int()
    .positive()
    .default(DEFAULT_PERPS_CREDENTIAL_EXPIRES_IN),
  label: z.string().min(1).optional(),
}) satisfies z.ZodType<CreatePerpsSessionRequest>;

const ResumePerpsSessionRequestSchema = z.strictObject({
  credentials: PerpsCredentialsSchema,
}) satisfies z.ZodType<ResumePerpsSessionRequest>;

const OpenPerpsSessionRequestSchema = z.union([
  CreatePerpsSessionRequestSchema,
  ResumePerpsSessionRequestSchema,
]) satisfies z.ZodType<OpenPerpsSessionRequest>;

const RevokePerpsCredentialsRequestInputSchema = z.object({
  proxy: z.string(),
}) satisfies z.ZodType<RevokePerpsCredentialsRequest>;

const RevokePerpsCredentialsRequestSchema =
  RevokePerpsCredentialsRequestInputSchema.transform((request) => ({
    proxy: expectEvmAddress(request.proxy),
  }));

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type CreatePerpsSessionRequest = {
  /** Delegated credential lifetime in milliseconds. */
  expiresIn?: number;
  /** Optional label for the delegated credentials. */
  label?: string;
};
type ParsedCreatePerpsSessionRequest = z.output<
  typeof CreatePerpsSessionRequestSchema
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ResumePerpsSessionRequest = {
  /** Existing delegated Perps credentials to validate and resume. */
  credentials: PerpsCredentials;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type OpenPerpsSessionRequest =
  | CreatePerpsSessionRequest
  | ResumePerpsSessionRequest;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type RevokePerpsCredentialsRequest = {
  /** Proxy address whose delegated credentials should be revoked. */
  proxy: string;
};

const PerpsBaseUnitAmountSchema = z.bigint().positive().max(MAX_UINT256);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsDepositWorkflowRequest =
  | GaslessWorkflowRequest
  | SendPerpsDepositTransactionRequest;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsDepositWorkflow = AsyncGenerator<
  PerpsDepositWorkflowRequest,
  TransactionHandle,
  EvmAddress | EvmSignature | TransactionHandle
>;

const DepositToPerpsRequestSchema = z.object({
  amount: PerpsBaseUnitAmountSchema,
  metadata: GaslessTransactionMetadataSchema.optional(),
}) satisfies z.ZodType<DepositToPerpsRequest>;

const WithdrawFromPerpsRequestSchema = z.object({
  amount: PerpsBaseUnitAmountSchema,
}) satisfies z.ZodType<WithdrawFromPerpsRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type DepositToPerpsRequest = {
  /** Collateral amount in base units. */
  amount: bigint;
  /** Optional wallet-visible metadata for gasless deposit workflows. */
  metadata?: string;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type WithdrawFromPerpsRequest = {
  /** Collateral amount in base units. */
  amount: bigint;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type OpenPerpsSessionError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const OpenPerpsSessionError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type RevokePerpsCredentialsError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const RevokePerpsCredentialsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PreparePerpsDepositError = UserInputError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const PreparePerpsDepositError = makeErrorGuard(UserInputError);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type DepositToPerpsError =
  | RateLimitError
  | RequestRejectedError
  | CancelledSigningError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const DepositToPerpsError = makeErrorGuard(
  CancelledSigningError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type WithdrawFromPerpsError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const WithdrawFromPerpsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Opens a Perps account session.
 *
 * @remarks
 * Omit `expiresIn` to create new delegated Perps credentials that expire after
 * one week. Pass `expiresIn` as a duration in milliseconds to use a shorter or
 * longer credential lifetime, or pass existing credentials to validate and
 * resume a previous session.
 *
 * @throws {@link OpenPerpsSessionError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function openPerpsSession(
  client: BaseSecureClient,
  request: OpenPerpsSessionRequest = {},
): Promise<PerpsSession> {
  const params = parseUserInput(request, OpenPerpsSessionRequestSchema);
  const credentials =
    'credentials' in params
      ? await resumePerpsCredentials(client, params.credentials)
      : await createPerpsCredentials(client, params);
  return client.webSockets.perpsSession.connect(credentials);
}

/**
 * Revokes delegated Perps credentials by proxy address.
 *
 * @remarks
 * This signs the revocation with the owner account. It can revoke credentials
 * outside the currently open Perps session.
 *
 * @throws {@link RevokePerpsCredentialsError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function revokePerpsCredentials(
  client: BaseSecureClient,
  request: RevokePerpsCredentialsRequest,
): Promise<void> {
  const params = parseUserInput(request, RevokePerpsCredentialsRequestSchema);
  const op = {
    type: 'deleteProxy' as const,
    args: {
      proxy: params.proxy,
    },
  };
  const signedOp = [
    'deleteProxy',
    [params.proxy],
  ] as const satisfies PerpsSignedOp;
  const salt = randomUint32();
  const timestamp = Date.now();
  const signature = await signPerpsOwnerOp(client, {
    salt,
    signedOp,
    timestamp,
  });

  const response = await unwrap(
    client.perps
      .del('/v1/account/proxy', {
        json: {
          op,
          salt,
          sig: signature,
          ts: timestamp,
        },
      })
      .andThen(validateWith(PerpsDeleteProxyResponseSchema)),
  );

  if (response.status === 'err') {
    throw new RequestRejectedError(
      response.error ?? 'Perps credentials revocation was rejected.',
      { status: 200 },
    );
  }
}

/**
 * Starts a Perps deposit workflow.
 *
 * @remarks
 * The deposit sends approved collateral into the Perps deposit contract and
 * credits the authenticated signer account. It does not approve collateral
 * spending; call `setupTradingApprovals` first when allowance is missing.
 *
 * @throws {@link PreparePerpsDepositError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function preparePerpsDeposit(
  client: BaseSecureClient,
  request: DepositToPerpsRequest,
): Promise<PerpsDepositWorkflow> {
  const params = parseUserInput(request, DepositToPerpsRequestSchema);
  const { contracts } = client.environment;
  const call = perpsDepositCall(
    contracts.perpsDepositContract,
    contracts.collateralToken,
    params.amount,
    client.account.signer,
  );

  return async function* (): PerpsDepositWorkflow {
    if (client.account.walletType === WalletType.EOA) {
      return expectTransactionHandle(
        yield sendPerpsDepositTransaction(
          signerTransactionRequest(client.environment.chainId, call),
        ),
      );
    }

    return yield* await prepareGaslessTransaction(client, {
      calls: [call],
      metadata:
        params.metadata ??
        `Deposit ${params.amount} of ${contracts.collateralToken} to Perps`,
    });
  }.call(null);
}

/**
 * Deposits collateral into Perps for the authenticated signer account.
 *
 * @throws {@link DepositToPerpsError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function depositToPerps(
  client: BaseSecureClient,
  request: DepositToPerpsRequest,
): Promise<TransactionHandle> {
  return preparePerpsDeposit(client, request).then(completeWith(client.signer));
}

/**
 * Requests a Perps withdrawal to the authenticated wallet.
 *
 * @remarks
 * The withdrawal is signed by the owner account and sends funds to the SDK
 * wallet address associated with the authenticated account.
 *
 * @throws {@link WithdrawFromPerpsError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function withdrawFromPerps(
  client: BaseSecureClient,
  request: WithdrawFromPerpsRequest,
): Promise<PerpsWithdrawalId> {
  const params = parseUserInput(request, WithdrawFromPerpsRequestSchema);
  const timestamp = Math.floor(Date.now() / 1000);
  const salt = randomUint32();
  const op = {
    type: 'withdraw' as const,
    args: {
      account: client.account.signer,
      token: client.environment.contracts.collateralToken,
      amount: params.amount.toString(),
      to: client.account.wallet,
    },
  };
  const signature = await signPerpsWithdraw(client, {
    amount: params.amount,
    salt,
    timestamp,
  });

  const response = await unwrap(
    client.perps
      .post('/v1/account/withdraw', {
        json: {
          op,
          salt,
          sig: signature,
          ts: timestamp,
        },
      })
      .andThen(validateWith(PerpsWithdrawResponseSchema)),
  );

  if (response.status === 'err') {
    throw new RequestRejectedError(
      response.error ?? 'Perps withdrawal was rejected.',
      { status: 200 },
    );
  }

  if (response.withdrawalId === undefined) {
    throw new UnexpectedResponseError(
      'Perps withdrawal response did not include a withdrawal ID.',
    );
  }

  return response.withdrawalId;
}

async function createPerpsCredentials(
  client: BaseSecureClient,
  request: ParsedCreatePerpsSessionRequest,
): Promise<PerpsCredentials> {
  const privateKey = createPerpsProxyPrivateKey();
  const proxy = addressFromPrivateKey(privateKey);
  const owner = client.account.signer;
  const expiresAt = Date.now() + request.expiresIn;
  const timestamp = Date.now();
  const salt = randomUint32();
  const op = {
    args: {
      expiry: expiresAt,
      owner,
      proxy,
    },
    type: 'createProxy' as const,
  };
  const signature = await signPerpsCreateProxy(client, {
    expiresAt,
    proxy,
    salt,
    timestamp,
  });
  const body: Record<string, unknown> = {
    op,
    salt,
    sig: signature,
    ts: timestamp,
  };
  if (request.label !== undefined) body.label = request.label;

  const response = await unwrap(
    client.perps
      .post('/v1/account/proxy', { json: body })
      .andThen(validateWith(PerpsCreateProxyResponseSchema)),
  );
  const credentials = {
    expiresAt,
    privateKey,
    proxy,
    secret: response.secret,
  };

  return validatePerpsCredentials(client, credentials);
}

async function resumePerpsCredentials(
  client: BaseSecureClient,
  credentials: PerpsCredentials,
): Promise<PerpsCredentials> {
  assertPerpsCredentialsKeyMatchesProxy(credentials);
  return validatePerpsCredentials(client, credentials);
}

async function validatePerpsCredentials(
  client: BaseSecureClient,
  credentials: PerpsCredentials,
): Promise<PerpsCredentials> {
  const response = await unwrap(
    client.perps
      .get('/v1/account/credentials', {
        headers: perpsCredentialHeaders(credentials),
      })
      .andThen(validateWith(PerpsCredentialsResponseSchema)),
  );

  if (!isSameEvmAddress(response.address, client.account.signer)) {
    throw new UnexpectedResponseError(
      'Perps credentials belong to a different signer account.',
    );
  }

  const proxyKey = response.keys.find((key) =>
    isSameEvmAddress(key.proxy, credentials.proxy),
  );
  if (proxyKey === undefined) {
    throw new UnexpectedResponseError(
      'Perps credentials were not returned by the API.',
    );
  }
  if (proxyKey.expiresAt <= Date.now()) {
    throw new UnexpectedResponseError('Perps credentials are expired.');
  }

  return {
    ...credentials,
    expiresAt: proxyKey.expiresAt,
  };
}

type PerpsCreateProxySignatureRequest = {
  expiresAt: number;
  proxy: EvmAddress;
  salt: number;
  timestamp: number;
};

async function signPerpsCreateProxy(
  client: BaseSecureClient,
  request: PerpsCreateProxySignatureRequest,
) {
  try {
    return await client.signer.signTypedData(
      createPerpsCreateProxyTypedDataPayload({
        chainId: client.environment.chainId,
        ...request,
      }),
    );
  } catch (error) {
    throw SigningError.fromError(
      error,
      'Could not sign the Perps proxy credentials request',
    );
  }
}

type PerpsOpSignatureRequest = {
  salt: number;
  signedOp: PerpsSignedOp;
  timestamp: number;
};

async function signPerpsOwnerOp(
  client: BaseSecureClient,
  request: PerpsOpSignatureRequest,
) {
  try {
    return await client.signer.signTypedData(
      createPerpsOpTypedDataPayload({
        chainId: client.environment.chainId,
        op: request.signedOp,
        salt: request.salt,
        timestamp: request.timestamp,
      }),
    );
  } catch (error) {
    throw SigningError.fromError(
      error,
      'Could not sign the Perps operation request',
    );
  }
}

type PerpsWithdrawSignatureRequest = {
  amount: bigint;
  salt: number;
  timestamp: number;
};

async function signPerpsWithdraw(
  client: BaseSecureClient,
  request: PerpsWithdrawSignatureRequest,
) {
  try {
    return await client.signer.signTypedData(
      createPerpsWithdrawTypedDataPayload({
        account: client.account.signer,
        chainId: client.environment.chainId,
        contract: client.environment.contracts.perpsDepositContract,
        token: client.environment.contracts.collateralToken,
        to: client.account.wallet,
        ...request,
      }),
    );
  } catch (error) {
    throw SigningError.fromError(
      error,
      'Could not sign the Perps withdrawal request',
    );
  }
}

type CreatePerpsWithdrawTypedDataPayloadRequest =
  PerpsWithdrawSignatureRequest & {
    account: EvmAddress;
    chainId: number;
    contract: EvmAddress;
    token: EvmAddress;
    to: EvmAddress;
  };

function createPerpsWithdrawTypedDataPayload(
  request: CreatePerpsWithdrawTypedDataPayloadRequest,
): TypedDataPayload {
  return {
    domain: {
      chainId: request.chainId,
      name: 'Polymarket',
      verifyingContract: request.contract,
      version: '1',
    },
    message: {
      account: request.account,
      amount: request.amount,
      fee: 0n,
      salt: request.salt,
      token: request.token,
      to: request.to,
      ts: request.timestamp,
    },
    primaryType: 'Withdraw',
    types: {
      Withdraw: [
        { name: 'account', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'fee', type: 'uint256' },
        { name: 'to', type: 'address' },
        { name: 'salt', type: 'uint64' },
        { name: 'ts', type: 'uint64' },
      ],
    },
  };
}

type CreatePerpsCreateProxyTypedDataPayloadRequest =
  PerpsCreateProxySignatureRequest & {
    chainId: number;
  };

function createPerpsCreateProxyTypedDataPayload(
  request: CreatePerpsCreateProxyTypedDataPayloadRequest,
): TypedDataPayload {
  return {
    domain: {
      chainId: request.chainId,
      name: 'Polymarket',
      version: '1',
    },
    message: {
      addr: request.proxy,
      exp: request.expiresAt,
      salt: request.salt,
      ts: request.timestamp,
    },
    primaryType: 'CreateProxy',
    types: {
      CreateProxy: [
        { name: 'addr', type: 'address' },
        { name: 'exp', type: 'uint64' },
        { name: 'salt', type: 'uint64' },
        { name: 'ts', type: 'uint64' },
      ],
    },
  };
}

function createPerpsProxyPrivateKey(): PrivateKey {
  return expectPrivateKey(
    Secp256k1.randomPrivateKey(),
    'Generated invalid Perps proxy key.',
  );
}

function addressFromPrivateKey(privateKey: PrivateKey) {
  return expectEvmAddress(
    Address.fromPublicKey(Secp256k1.getPublicKey({ privateKey })),
  );
}

function assertPerpsCredentialsKeyMatchesProxy(
  credentials: PerpsCredentials,
): void {
  const privateKeyAddress = addressFromPrivateKey(credentials.privateKey);
  if (!isSameEvmAddress(privateKeyAddress, credentials.proxy)) {
    throw new UserInputError(
      'Perps credentials private key does not match the proxy address.',
    );
  }
}

function perpsCredentialHeaders(
  credentials: Pick<PerpsCredentials, 'proxy' | 'secret'>,
): HeadersInit {
  return {
    'POLYMARKET-PROXY': credentials.proxy,
    'POLYMARKET-SECRET': credentials.secret,
  };
}

function sendPerpsDepositTransaction(
  request: SignerTransactionRequest,
): SendPerpsDepositTransactionRequest {
  return {
    kind: 'sendPerpsDepositTransaction',
    request,
  };
}

function randomUint32(): number {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  invariant(
    value !== undefined,
    'Expected crypto.getRandomValues to return a salt.',
  );
  return value;
}

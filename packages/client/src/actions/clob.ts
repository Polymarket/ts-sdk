import {
  BuilderCodeSchema,
  type ConditionId,
  ConditionIdSchema,
  OrderSideSchema,
  PaginationCursorSchema,
  type TickSizeValue,
  TokenIdSchema,
  toPaginationCursor,
} from '@polymarket/bindings';
import {
  type BuilderFeeRates,
  type CurrentReward,
  END_CURSOR,
  FetchBuilderFeeRatesResponseSchema,
  FetchMarketInfoResponseSchema,
  FetchNegRiskResponseSchema,
  FetchOrderBookResponseSchema,
  FetchTickSizeResponseSchema,
  type LastTradePrice,
  type LastTradePriceForToken,
  LastTradePriceSchema,
  LastTradePricesSchema,
  type MarketInfo,
  type MarketReward,
  MidpointSchema,
  MidpointsSchema,
  type OrderBook,
  OrderBooksSchema,
  PaginatedCurrentRewardsSchema,
  PaginatedMarketRewardsSchema,
  PriceHistoryIntervalSchema,
  type PriceHistoryPoint,
  PriceHistorySchema,
  PriceSchema,
  type Prices,
  PricesSchema,
  ResolveConditionByTokenResponseSchema,
  SpreadSchema,
  SpreadsSchema,
} from '@polymarket/bindings/clob';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseClient } from '../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import { type Paginated, paginate } from '../pagination';
import { validateWith } from '../response';
import { snakeCase, toSearchParams } from './params';

const FetchMidpointRequestSchema = z.object({
  tokenId: z.string(),
});

export type FetchMidpointRequest = z.input<typeof FetchMidpointRequestSchema>;

export type FetchMidpointError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchMidpointError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the midpoint price for a token.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchMidpointError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const midpoint = await fetchMidpoint(client, {
 *   tokenId:
 *     '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 * });
 *
 * // midpoint === '0.53'
 * ```
 *
 */
export async function fetchMidpoint(
  client: BaseClient,
  request: FetchMidpointRequest,
): Promise<string> {
  const params = parseUserInput(request, FetchMidpointRequestSchema);
  const response = await unwrap(
    client.clob
      .get('/midpoint', {
        params: toSearchParams(params, snakeCase()),
      })
      .andThen(validateWith(MidpointSchema)),
  );

  return response.mid;
}

const FetchMidpointsRequestSchema = z
  .array(
    z.object({
      tokenId: z.string(),
    }),
  )
  .min(1);

export type FetchMidpointsRequest = z.input<typeof FetchMidpointsRequestSchema>;

export type FetchMidpointsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchMidpointsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches midpoint prices for multiple tokens.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchMidpointsError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const midpoints = await fetchMidpoints(client, [
 *   {
 *     tokenId:
 *       '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 *   },
 * ]);
 *
 * // midpoints[tokenId] === '0.53'
 * ```
 *
 */
export async function fetchMidpoints(
  client: BaseClient,
  request: FetchMidpointsRequest,
): Promise<Record<string, string>> {
  const params = parseUserInput(request, FetchMidpointsRequestSchema);

  return unwrap(
    client.clob
      .post('midpoints', {
        json: toTokenRequestPayload(params),
      })
      .andThen(validateWith(MidpointsSchema)),
  );
}

const FetchTickSizeRequestSchema = z.object({
  tokenId: z.string(),
});

export type FetchTickSizeRequest = z.input<typeof FetchTickSizeRequestSchema>;

export type FetchTickSizeError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchTickSizeError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the minimum price tick size for a token's order book.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchTickSizeError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const tickSize = await fetchTickSize(client, {
 *   tokenId:
 *     '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 * });
 *
 * // tickSize === 0.01
 * ```
 */
export async function fetchTickSize(
  client: BaseClient,
  request: FetchTickSizeRequest,
): Promise<TickSizeValue> {
  const params = parseUserInput(request, FetchTickSizeRequestSchema);
  const response = await unwrap(
    client.clob
      .get('/tick-size', {
        params: toSearchParams(params, snakeCase()),
      })
      .andThen(validateWith(FetchTickSizeResponseSchema)),
  );

  return response.minimumTickSize;
}

const FetchNegRiskRequestSchema = z.object({
  tokenId: z.string(),
});

export type FetchNegRiskRequest = z.input<typeof FetchNegRiskRequestSchema>;

export type FetchNegRiskError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchNegRiskError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches whether a token is in a negative-risk market.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchNegRiskError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const negRisk = await fetchNegRisk(client, {
 *   tokenId:
 *     '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 * });
 *
 * // negRisk === false
 * ```
 */
export async function fetchNegRisk(
  client: BaseClient,
  request: FetchNegRiskRequest,
): Promise<boolean> {
  const params = parseUserInput(request, FetchNegRiskRequestSchema);
  const response = await unwrap(
    client.clob
      .get('/neg-risk', {
        params: toSearchParams(params, snakeCase()),
      })
      .andThen(validateWith(FetchNegRiskResponseSchema)),
  );

  return response.negRisk;
}

const ResolveConditionByTokenRequestSchema = z.object({
  tokenId: TokenIdSchema,
});

export type ResolveConditionByTokenRequest = z.input<
  typeof ResolveConditionByTokenRequestSchema
>;

export type ResolveConditionByTokenError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ResolveConditionByTokenError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Resolves the condition ID for a token.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ResolveConditionByTokenError}
 * Thrown on failure.
 */
export async function resolveConditionByToken(
  client: BaseClient,
  request: ResolveConditionByTokenRequest,
): Promise<ConditionId> {
  const params = parseUserInput(request, ResolveConditionByTokenRequestSchema);

  return unwrap(
    client.clob
      .get(`/markets-by-token/${params.tokenId}`)
      .andThen(validateWith(ResolveConditionByTokenResponseSchema)),
  );
}

const FetchMarketInfoRequestSchema = z.object({
  conditionId: ConditionIdSchema,
});

export type FetchMarketInfoRequest = z.input<
  typeof FetchMarketInfoRequestSchema
>;

export type FetchMarketInfoError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchMarketInfoError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches market-level metadata for a condition.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchMarketInfoError}
 * Thrown on failure.
 */
export async function fetchMarketInfo(
  client: BaseClient,
  request: FetchMarketInfoRequest,
): Promise<MarketInfo> {
  const params = parseUserInput(request, FetchMarketInfoRequestSchema);

  return unwrap(
    client.clob
      .get(`/clob-markets/${params.conditionId}`)
      .andThen(validateWith(FetchMarketInfoResponseSchema)),
  );
}

const FetchBuilderFeeRatesRequestSchema = z.object({
  builderCode: BuilderCodeSchema,
});

export type FetchBuilderFeeRatesRequest = z.input<
  typeof FetchBuilderFeeRatesRequestSchema
>;

export type FetchBuilderFeeRatesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchBuilderFeeRatesError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches builder maker and taker fee rates.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchBuilderFeeRatesError}
 * Thrown on failure.
 */
export async function fetchBuilderFeeRates(
  client: BaseClient,
  request: FetchBuilderFeeRatesRequest,
): Promise<BuilderFeeRates> {
  const params = parseUserInput(request, FetchBuilderFeeRatesRequestSchema);

  return unwrap(
    client.clob
      .get(`/fees/builder-fees/${params.builderCode}`)
      .andThen(validateWith(FetchBuilderFeeRatesResponseSchema))
      .mapErr((error) => {
        if (error instanceof RequestRejectedError && error.status === 404) {
          return new UserInputError(
            `Unknown builder code: ${params.builderCode}`,
            { cause: error },
          );
        }

        return error;
      }),
  );
}

const FetchPriceRequestSchema = z.object({
  tokenId: z.string(),
  side: OrderSideSchema,
});

export type FetchPriceRequest = z.input<typeof FetchPriceRequestSchema>;

export type FetchPriceError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchPriceError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the current quoted price for a token and side.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchPriceError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const price = await fetchPrice(client, {
 *   tokenId:
 *     '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 *   side: OrderSide.BUY,
 * });
 *
 * // price === '0.52'
 * ```
 *
 */
export async function fetchPrice(
  client: BaseClient,
  request: FetchPriceRequest,
): Promise<string> {
  const params = parseUserInput(request, FetchPriceRequestSchema);
  const response = await unwrap(
    client.clob
      .get('/price', {
        params: toSearchParams(params, snakeCase()),
      })
      .andThen(validateWith(PriceSchema)),
  );

  return response.price;
}

const FetchPricesRequestSchema = z
  .array(
    z.object({
      tokenId: z.string(),
      side: OrderSideSchema,
    }),
  )
  .min(1);

export type FetchPricesRequest = z.input<typeof FetchPricesRequestSchema>;

export type FetchPricesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchPricesError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches quoted prices for multiple tokens.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchPricesError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const prices = await fetchPrices(client, [
 *   {
 *     tokenId:
 *       '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 *     side: OrderSide.BUY,
 *   },
 * ]);
 *
 * // prices[tokenId]?.BUY === '0.52'
 * ```
 *
 */
export async function fetchPrices(
  client: BaseClient,
  request: FetchPricesRequest,
): Promise<Prices> {
  const params = parseUserInput(request, FetchPricesRequestSchema);

  return unwrap(
    client.clob
      .post('prices', {
        json: toTokenWithSideRequestPayload(params),
      })
      .andThen(validateWith(PricesSchema)),
  );
}

const FetchOrderBookRequestSchema = z.object({
  tokenId: z.string(),
});

export type FetchOrderBookRequest = z.input<typeof FetchOrderBookRequestSchema>;

export type FetchOrderBookError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchOrderBookError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the current order book for a token.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchOrderBookError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const orderBook = await fetchOrderBook(client, {
 *   tokenId:
 *     '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 * });
 *
 * // orderBook.bids / orderBook.asks
 * ```
 */
export async function fetchOrderBook(
  client: BaseClient,
  request: FetchOrderBookRequest,
): Promise<OrderBook> {
  const params = parseUserInput(request, FetchOrderBookRequestSchema);

  return unwrap(
    client.clob
      .get('/book', {
        params: toSearchParams(params, snakeCase()),
      })
      .andThen(validateWith(FetchOrderBookResponseSchema)),
  );
}

const FetchOrderBooksRequestSchema = z
  .array(
    z.object({
      tokenId: z.string(),
    }),
  )
  .min(1);

export type FetchOrderBooksRequest = z.input<
  typeof FetchOrderBooksRequestSchema
>;

export type FetchOrderBooksError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchOrderBooksError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches order books for multiple tokens.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchOrderBooksError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const books = await fetchOrderBooks(client, [
 *   {
 *     tokenId:
 *       '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 *   },
 * ])
 *
 * // books: OrderBook[]
 * ```
 */
export async function fetchOrderBooks(
  client: BaseClient,
  request: FetchOrderBooksRequest,
): Promise<OrderBook[]> {
  const params = parseUserInput(request, FetchOrderBooksRequestSchema);

  return unwrap(
    client.clob
      .post('books', {
        json: toTokenRequestPayload(params),
      })
      .andThen(validateWith(OrderBooksSchema)),
  );
}

const FetchSpreadRequestSchema = z.object({
  tokenId: z.string(),
});

export type FetchSpreadRequest = z.input<typeof FetchSpreadRequestSchema>;

export type FetchSpreadError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchSpreadError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the spread for a token.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchSpreadError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const spread = await fetchSpread(client, {
 *   tokenId:
 *     '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 * });
 *
 * // spread === '0.02'
 * ```
 *
 */
export async function fetchSpread(
  client: BaseClient,
  request: FetchSpreadRequest,
): Promise<string> {
  const params = parseUserInput(request, FetchSpreadRequestSchema);
  const response = await unwrap(
    client.clob
      .get('/spread', {
        params: toSearchParams(params, snakeCase()),
      })
      .andThen(validateWith(SpreadSchema)),
  );

  return response.spread;
}

const FetchSpreadsRequestSchema = z
  .array(
    z.object({
      tokenId: z.string(),
    }),
  )
  .min(1);

export type FetchSpreadsRequest = z.input<typeof FetchSpreadsRequestSchema>;

export type FetchSpreadsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchSpreadsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches spreads for multiple tokens.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchSpreadsError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const spreads = await fetchSpreads(client, [
 *   {
 *     tokenId:
 *       '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 *   },
 * ]);
 *
 * // spreads[tokenId] === '0.02'
 * ```
 *
 */
export async function fetchSpreads(
  client: BaseClient,
  request: FetchSpreadsRequest,
): Promise<Record<string, string>> {
  const params = parseUserInput(request, FetchSpreadsRequestSchema);

  return unwrap(
    client.clob
      .post('spreads', {
        json: toTokenRequestPayload(params),
      })
      .andThen(validateWith(SpreadsSchema)),
  );
}

const FetchLastTradePriceRequestSchema = z.object({
  tokenId: z.string(),
});

export type FetchLastTradePriceRequest = z.input<
  typeof FetchLastTradePriceRequestSchema
>;

export type FetchLastTradePriceError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchLastTradePriceError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches the last traded price for a token.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchLastTradePriceError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const trade = await fetchLastTradePrice(client, {
 *   tokenId:
 *     '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 * });
 *
 * // trade === { price: '0.53', side: OrderSide.BUY }
 * ```
 *
 */
export async function fetchLastTradePrice(
  client: BaseClient,
  request: FetchLastTradePriceRequest,
): Promise<LastTradePrice> {
  const params = parseUserInput(request, FetchLastTradePriceRequestSchema);

  return unwrap(
    client.clob
      .get('/last-trade-price', {
        params: toSearchParams(params, snakeCase()),
      })
      .andThen(validateWith(LastTradePriceSchema)),
  );
}

const FetchLastTradePricesRequestSchema = z
  .array(
    z.object({
      tokenId: z.string(),
    }),
  )
  .min(1);

export type FetchLastTradePricesRequest = z.input<
  typeof FetchLastTradePricesRequestSchema
>;

export type FetchLastTradePricesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchLastTradePricesError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches last traded prices for multiple tokens.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchLastTradePricesError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const trades = await fetchLastTradePrices(client, [
 *   {
 *     tokenId:
 *       '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 *   },
 * ]);
 *
 * // trades[0] === { tokenId, price: '0.53', side: OrderSide.BUY }
 * ```
 *
 */
export async function fetchLastTradePrices(
  client: BaseClient,
  request: FetchLastTradePricesRequest,
): Promise<LastTradePriceForToken[]> {
  const params = parseUserInput(request, FetchLastTradePricesRequestSchema);

  return unwrap(
    client.clob
      .post('last-trades-prices', {
        json: toTokenRequestPayload(params),
      })
      .andThen(validateWith(LastTradePricesSchema)),
  );
}

const ListPriceHistoryRequestSchema = z.object({
  tokenId: z.string(),
  startTs: z.number().int().optional(),
  endTs: z.number().int().optional(),
  fidelity: z.number().int().positive().optional(),
  interval: PriceHistoryIntervalSchema.optional(),
});

export type FetchPriceHistoryRequest = z.input<
  typeof ListPriceHistoryRequestSchema
>;

export type FetchPriceHistoryError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchPriceHistoryError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches historical price points for a token.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchPriceHistoryError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const history = await fetchPriceHistory(client, {
 *   tokenId:
 *     '8501497159083948713316135768103773293754490207922884688769443031624417212426',
 *   interval: PriceHistoryInterval.ONE_DAY,
 *   fidelity: 60,
 * });
 *
 * // history === PriceHistoryPoint[]
 * ```
 *
 */
export async function fetchPriceHistory(
  client: BaseClient,
  request: FetchPriceHistoryRequest,
): Promise<PriceHistoryPoint[]> {
  const params = parseUserInput(request, ListPriceHistoryRequestSchema);
  const response = await unwrap(
    client.clob
      .get('/prices-history', {
        params: toSearchParams(params, {
          tokenId: 'market',
          startTs: 'startTs',
          endTs: 'endTs',
          fidelity: 'fidelity',
          interval: 'interval',
        }),
      })
      .andThen(validateWith(PriceHistorySchema)),
  );

  return response.history;
}

const ListCurrentRewardsRequestSchema = z
  .object({
    cursor: PaginationCursorSchema.optional(),
    sponsored: z.boolean().optional(),
  })
  .default({});

export type ListCurrentRewardsRequest = z.input<
  typeof ListCurrentRewardsRequestSchema
>;

export type ListCurrentRewardsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListCurrentRewardsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists current active market rewards.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListCurrentRewardsError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listCurrentRewards(client);
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: CurrentReward[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listCurrentRewards(client);
 *
 * for await (const page of result) {
 *   // page.items: CurrentReward[]
 * }
 * ```
 */
export function listCurrentRewards(
  client: BaseClient,
  request: ListCurrentRewardsRequest = {},
): Paginated<CurrentReward[]> {
  const { cursor, ...params } = parseUserInput(
    request,
    ListCurrentRewardsRequestSchema,
  );

  return paginate(
    (nextCursor) =>
      client.clob
        .get('/rewards/markets/current', {
          params: toSearchParams(
            {
              ...params,
              nextCursor,
            },
            snakeCase(),
          ),
        })
        .andThen(validateWith(PaginatedCurrentRewardsSchema))
        .map((response) => ({
          items: response.data,
          hasMore: response.nextCursor !== END_CURSOR,
          nextCursor:
            response.nextCursor === END_CURSOR
              ? undefined
              : toPaginationCursor(response.nextCursor),
          totalCount: response.count,
        })),
    cursor,
  );
}

const ListMarketRewardsRequestSchema = z.object({
  conditionId: ConditionIdSchema,
  cursor: PaginationCursorSchema.optional(),
  sponsored: z.boolean().optional(),
});

export type ListMarketRewardsRequest = z.input<
  typeof ListMarketRewardsRequestSchema
>;

export type ListMarketRewardsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListMarketRewardsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists reward configurations for a market.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListMarketRewardsError}
 * Thrown on failure.
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listMarketRewards(client, {
 *   conditionId:
 *     '0xbd31dc8a20211944f6b70f31557f1001557b59905b7738480ca09bd4532f84af',
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: MarketReward[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listMarketRewards(client, {
 *   conditionId:
 *     '0xbd31dc8a20211944f6b70f31557f1001557b59905b7738480ca09bd4532f84af',
 * });
 *
 * for await (const page of result) {
 *   // page.items: MarketReward[]
 * }
 * ```
 */
export function listMarketRewards(
  client: BaseClient,
  request: ListMarketRewardsRequest,
): Paginated<MarketReward[]> {
  const { cursor, ...params } = parseUserInput(
    request,
    ListMarketRewardsRequestSchema,
  );

  return paginate(
    (nextCursor) =>
      client.clob
        .get(`rewards/markets/${params.conditionId}`, {
          params: toSearchParams(
            {
              nextCursor,
              sponsored: params.sponsored,
            },
            snakeCase(),
          ),
        })
        .andThen(validateWith(PaginatedMarketRewardsSchema))
        .map((response) => ({
          items: response.data,
          hasMore: response.nextCursor !== END_CURSOR,
          nextCursor:
            response.nextCursor === END_CURSOR
              ? undefined
              : toPaginationCursor(response.nextCursor),
          totalCount: response.count,
        })),
    cursor,
  );
}

function toTokenRequestPayload(
  params: Array<{
    tokenId: string;
  }>,
) {
  return params.map(({ tokenId }) => ({
    token_id: tokenId,
  }));
}

function toTokenWithSideRequestPayload(
  params: Array<{
    tokenId: string;
    side: z.infer<typeof OrderSideSchema>;
  }>,
) {
  return params.map(({ tokenId, side }) => ({
    token_id: tokenId,
    side,
  }));
}

import {
  BuilderCodeSchema,
  type ConditionId,
  ConditionIdSchema,
  type DecimalString,
  type OrderSide,
  OrderSideSchema,
  PaginationCursorSchema,
  type PositionId,
  type TickSizeValue,
  type TokenId,
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
  type LastTradePriceForAsset,
  LastTradePriceSchema,
  LastTradePricesSchema,
  type MarketInfo,
  type MarketReward,
  MidpointSchema,
  type Midpoints,
  MidpointsSchema,
  type OrderBook,
  OrderBooksSchema,
  PaginatedCurrentRewardsSchema,
  PaginatedMarketRewardsSchema,
  PriceSchema,
  type Prices,
  PricesSchema,
  ResolveConditionByTokenResponseSchema,
  SpreadSchema,
  type Spreads,
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
import { exchangeAssetRequestSchema } from './exchange-asset';
import { snakeCase, toSearchParams } from './params';

const FetchMidpointRequestSchema = exchangeAssetRequestSchema({});

export type FetchMidpointRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
    };

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
 * Fetches the midpoint price for an exchange asset as a decimal string.
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
 *   assetId: '0x0122…0000',
 * });
 *
 * // midpoint === '0.53'
 * ```
 *
 */
export async function fetchMidpoint(
  client: BaseClient,
  request: FetchMidpointRequest,
): Promise<DecimalString> {
  const params = parseUserInput(request, FetchMidpointRequestSchema);
  const response = await unwrap(
    client.clob
      .get('/midpoint', {
        params: toAssetSearchParams(params),
      })
      .andThen(validateWith(MidpointSchema)),
  );

  return response.mid;
}

const FetchMidpointsRequestSchema = z
  .array(exchangeAssetRequestSchema({}))
  .min(1);

export type FetchMidpointsRequest = Array<
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
    }
>;

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
 * Fetches midpoint prices for multiple exchange assets as an asset ID keyed lookup.
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
 *     assetId: '0x0122…0000',
 *   },
 * ]);
 *
 * // midpoints['0x0122…0000'] === '0.53'
 * ```
 *
 */
export async function fetchMidpoints(
  client: BaseClient,
  request: FetchMidpointsRequest,
): Promise<Midpoints> {
  const params = parseUserInput(request, FetchMidpointsRequestSchema);

  return unwrap(
    client.clob
      .post('midpoints', {
        json: toTokenRequestPayload(params),
      })
      .andThen(validateWith(MidpointsSchema)),
  );
}

const FetchTickSizeRequestSchema = exchangeAssetRequestSchema({});

export type FetchTickSizeRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
    };

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
 * Fetches the minimum price tick size for an exchange asset's order book.
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
 *   assetId: '0x0122…0000',
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
        params: toAssetSearchParams(params),
      })
      .andThen(validateWith(FetchTickSizeResponseSchema)),
  );

  return response.minimumTickSize;
}

const FetchNegRiskRequestSchema = exchangeAssetRequestSchema({});

export type FetchNegRiskRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
    };

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
 * Fetches whether an exchange asset is in a negative-risk market.
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
 *   assetId: '0x0122…0000',
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
        params: toAssetSearchParams(params),
      })
      .andThen(validateWith(FetchNegRiskResponseSchema)),
  );

  return response.negRisk;
}

const ResolveConditionByTokenRequestSchema = exchangeAssetRequestSchema({});

export type ResolveConditionByTokenRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
    };

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
 * Resolves the condition ID for an exchange asset.
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
      .get(`/markets-by-token/${params.assetId ?? params.tokenId}`)
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

const FetchPriceRequestSchema = exchangeAssetRequestSchema({
  side: OrderSideSchema,
});

export type FetchPriceRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
      side: OrderSide;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
      side: OrderSide;
    };

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
 * Fetches the current quoted price for an exchange asset and side as a decimal string.
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
 *   assetId: '0x0122…0000',
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
): Promise<DecimalString> {
  const params = parseUserInput(request, FetchPriceRequestSchema);
  const response = await unwrap(
    client.clob
      .get('/price', {
        params: toAssetSearchParams(params),
      })
      .andThen(validateWith(PriceSchema)),
  );

  return response.price;
}

const FetchPricesRequestSchema = z
  .array(exchangeAssetRequestSchema({ side: OrderSideSchema }))
  .min(1);

export type FetchPricesRequest = Array<
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
      side: OrderSide;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
      side: OrderSide;
    }
>;

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
 * Fetches quoted prices for multiple exchange assets as an asset ID keyed lookup.
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
 *     assetId: '0x0122…0000',
 *     side: OrderSide.BUY,
 *   },
 * ]);
 *
 * // prices['0x0122…0000']?.BUY === '0.52'
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

const FetchOrderBookRequestSchema = exchangeAssetRequestSchema({});

export type FetchOrderBookRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
    };

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
 * Fetches the current order book for an exchange asset.
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
 *   assetId: '0x0122…0000',
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
        params: toAssetSearchParams(params),
      })
      .andThen(validateWith(FetchOrderBookResponseSchema)),
  );
}

const FetchOrderBooksRequestSchema = z
  .array(exchangeAssetRequestSchema({}))
  .min(1);

export type FetchOrderBooksRequest = Array<
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
    }
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
 * Fetches order books for multiple exchange assets.
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
 *     assetId: '0x0122…0000',
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

const FetchSpreadRequestSchema = exchangeAssetRequestSchema({});

export type FetchSpreadRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
    };

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
 * Fetches the spread for an exchange asset as a decimal string.
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
 *   assetId: '0x0122…0000',
 * });
 *
 * // spread === '0.02'
 * ```
 *
 */
export async function fetchSpread(
  client: BaseClient,
  request: FetchSpreadRequest,
): Promise<DecimalString> {
  const params = parseUserInput(request, FetchSpreadRequestSchema);
  const response = await unwrap(
    client.clob
      .get('/spread', {
        params: toAssetSearchParams(params),
      })
      .andThen(validateWith(SpreadSchema)),
  );

  return response.spread;
}

const FetchSpreadsRequestSchema = z
  .array(exchangeAssetRequestSchema({}))
  .min(1);

export type FetchSpreadsRequest = Array<
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
    }
>;

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
 * Fetches spreads for multiple exchange assets as an asset ID keyed lookup.
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
 *     assetId: '0x0122…0000',
 *   },
 * ]);
 *
 * // spreads['0x0122…0000'] === '0.02'
 * ```
 *
 */
export async function fetchSpreads(
  client: BaseClient,
  request: FetchSpreadsRequest,
): Promise<Spreads> {
  const params = parseUserInput(request, FetchSpreadsRequestSchema);

  return unwrap(
    client.clob
      .post('spreads', {
        json: toTokenRequestPayload(params),
      })
      .andThen(validateWith(SpreadsSchema)),
  );
}

const FetchLastTradePriceRequestSchema = exchangeAssetRequestSchema({});

export type FetchLastTradePriceRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
    };

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
 * Fetches the last traded price for an exchange asset.
 *
 * Returns `null` when the asset has not traded.
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
 *   assetId: '0x0122…0000',
 * });
 *
 * // trade === LastTradePrice | null
 * ```
 *
 */
export async function fetchLastTradePrice(
  client: BaseClient,
  request: FetchLastTradePriceRequest,
): Promise<LastTradePrice | null> {
  const params = parseUserInput(request, FetchLastTradePriceRequestSchema);

  return unwrap(
    client.clob
      .get('/last-trade-price', {
        params: toAssetSearchParams(params),
      })
      .andThen(validateWith(LastTradePriceSchema)),
  );
}

const FetchLastTradePricesRequestSchema = z
  .array(exchangeAssetRequestSchema({}))
  .min(1);

export type FetchLastTradePricesRequest = Array<
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId: string;
      tokenId?: never;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId: string;
    }
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
 * Fetches last traded prices for multiple exchange assets.
 *
 * Assets without trades are omitted from the response. Match returned rows by
 * `assetId`; the array is not positionally aligned with the request.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchLastTradePricesError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const trades = await fetchLastTradePrices(client, [{ assetId: '0x0122…0000' }]);
 *
 * const trade = trades.find((candidate) => candidate.assetId === '0x0122…0000');
 * ```
 *
 */
export async function fetchLastTradePrices(
  client: BaseClient,
  request: FetchLastTradePricesRequest,
): Promise<LastTradePriceForAsset[]> {
  const params = parseUserInput(request, FetchLastTradePricesRequestSchema);

  return unwrap(
    client.clob
      .post('last-trades-prices', {
        json: toTokenRequestPayload(params),
      })
      .andThen(validateWith(LastTradePricesSchema)),
  );
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
        })),
    cursor,
  );
}

type ExchangeAssetParams = {
  assetId?: TokenId | PositionId;
  tokenId?: string;
};

function toTokenRequestPayload(params: ExchangeAssetParams[]) {
  return params.map((request) => ({
    token_id: request.assetId ?? request.tokenId,
  }));
}

function toTokenWithSideRequestPayload(
  params: Array<ExchangeAssetParams & { side: OrderSide }>,
) {
  return params.map((request) => ({
    token_id: request.assetId ?? request.tokenId,
    side: request.side,
  }));
}

function toAssetSearchParams(
  params: ExchangeAssetParams & Record<string, unknown>,
): URLSearchParams {
  const { assetId: _, tokenId: __, ...rest } = params;
  return toSearchParams(
    { ...rest, tokenId: params.assetId ?? params.tokenId },
    snakeCase(),
  );
}

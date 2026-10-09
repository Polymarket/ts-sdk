import {
  PaginationCursorSchema,
  toPaginationCursor,
} from '@polymarket/bindings';
import {
  type AssetType,
  AssetTypeSchema,
  type BalanceAllowanceResponse,
  BalanceAllowanceResponseSchema,
  type ClobTrade,
  ClobTradesPageSchema,
  ClosedOnlyModeSchema,
  END_CURSOR,
  type NotificationsResponse,
  NotificationsResponseSchema,
  type OpenOrder,
  OpenOrderSchema,
  OpenOrdersPageSchema,
  OrderScoringResponseSchema,
  type OrdersScoringResponse,
  OrdersScoringResponseSchema,
  type RewardsPercentages,
  RewardsPercentagesSchema,
  type TotalUserEarning,
  TotalUserEarningsResponseSchema,
  type UserEarning,
  UserEarningsPageSchema,
  type UserRewardsEarning,
  UserRewardsEarningsPageSchema,
} from '@polymarket/bindings/clob';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseSecureClient } from '../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import { PageSizeSchema, type Paginated, paginate } from '../pagination';
import type { RequestOptions } from '../request-options';
import { validateWith } from '../response';
import { toSignatureType } from '../wallet';
import { optionalExchangeAssetRequestSchema } from './exchange-asset';
import { snakeCase, toSearchParams } from './params';

export type FetchClosedOnlyModeError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError;
export const FetchClosedOnlyModeError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
);

/**
 * Fetches whether the account is restricted to closed-only trading.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchClosedOnlyModeError}
 *
 * @example
 * ```ts
 * const closedOnly = await fetchClosedOnlyMode(client);
 * ```
 */
export async function fetchClosedOnlyMode(
  client: BaseSecureClient,
  options: RequestOptions = {},
): Promise<boolean> {
  const response = await unwrap(
    client.secureClob
      .get('/auth/ban-status/closed-only', options)
      .andThen(validateWith(ClosedOnlyModeSchema, options)),
  );

  return response.closedOnly;
}

const ListOpenOrdersRequestFieldsSchema = z.object({
  cursor: PaginationCursorSchema.optional(),
  id: z.string().optional(),
  market: z.string().optional(),
});

const ListOpenOrdersRequestSchema = optionalExchangeAssetRequestSchema(
  ListOpenOrdersRequestFieldsSchema.shape,
).default({});

export type ListOpenOrdersRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId?: string;
      tokenId?: never;
      cursor?: string;
      id?: string;
      market?: string;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId?: string;
      cursor?: string;
      id?: string;
      market?: string;
    };
export type ListOpenOrdersError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListOpenOrdersError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists open orders for the authenticated account across all pages.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListOpenOrdersError}
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listOpenOrders(client, {
 *   market: '0x0000000000000000000000000000000000000000000000000000000000000001',
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: OpenOrder[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listOpenOrders(client, {
 *   market: '0x0000000000000000000000000000000000000000000000000000000000000001',
 * });
 *
 * for await (const page of result) {
 *   // page.items: OpenOrder[]
 * }
 * ```
 */
export function listOpenOrders(
  client: BaseSecureClient,
  request?: ListOpenOrdersRequest,
  options: RequestOptions = {},
): Paginated<OpenOrder[]> {
  const params = parseUserInput(request, ListOpenOrdersRequestSchema);
  const { cursor } = params;

  return paginate(
    (nextCursor) =>
      client.secureClob
        .get('/data/orders', {
          signal: options.signal,
          params: toSearchParams(
            {
              assetId: params.assetId ?? params.tokenId,
              id: params.id,
              market: params.market,
              nextCursor,
            },
            snakeCase({ assetId: 'asset_id' }),
          ),
        })
        .andThen(validateWith(OpenOrdersPageSchema, options))
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

const FetchOrderRequestSchema = z.object({
  orderId: z.string(),
});

export type FetchOrderRequest = z.input<typeof FetchOrderRequestSchema>;
export type FetchOrderError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchOrderError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches a single order for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchOrderError}
 *
 * @example
 * ```ts
 * const order = await fetchOrder(client, {
 *   orderId: '123',
 * });
 * ```
 */
export async function fetchOrder(
  client: BaseSecureClient,
  request: FetchOrderRequest,
  options: RequestOptions = {},
): Promise<OpenOrder> {
  const params = parseUserInput(request, FetchOrderRequestSchema);

  return unwrap(
    client.secureClob
      .get(`/data/order/${params.orderId}`, options)
      .andThen(validateWith(OpenOrderSchema, options)),
  );
}

const ListAccountTradesRequestFields = {
  after: z.string().optional(),
  before: z.string().optional(),
  cursor: PaginationCursorSchema.optional(),
  id: z.string().optional(),
  makerAddress: z.string().optional(),
  market: z.string().optional(),
};

const ListAccountTradesRequestSchema = optionalExchangeAssetRequestSchema(
  ListAccountTradesRequestFields,
).default({});

export type ListAccountTradesRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId?: string;
      tokenId?: never;
      after?: string;
      before?: string;
      cursor?: string;
      id?: string;
      makerAddress?: string;
      market?: string;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId?: string;
      after?: string;
      before?: string;
      cursor?: string;
      id?: string;
      makerAddress?: string;
      market?: string;
    };
export type ListAccountTradesError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListAccountTradesError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists trades for the authenticated account across all pages.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListAccountTradesError}
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listAccountTrades(client, {
 *   market: '0x0000000000000000000000000000000000000000000000000000000000000001',
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: ClobTrade[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listAccountTrades(client, {
 *   market: '0x0000000000000000000000000000000000000000000000000000000000000001',
 * });
 *
 * for await (const page of result) {
 *   // page.items: ClobTrade[]
 * }
 * ```
 */
export function listAccountTrades(
  client: BaseSecureClient,
  request?: ListAccountTradesRequest,
  options: RequestOptions = {},
): Paginated<ClobTrade[]> {
  const params = parseUserInput(request, ListAccountTradesRequestSchema);
  const { cursor } = params;

  return paginate(
    (nextCursor) =>
      client.secureClob
        .get('/data/trades', {
          signal: options.signal,
          params: toSearchParams(
            {
              after: params.after,
              assetId: params.assetId ?? params.tokenId,
              before: params.before,
              id: params.id,
              makerAddress: params.makerAddress,
              market: params.market,
              nextCursor,
            },
            snakeCase({ assetId: 'asset_id' }),
          ),
        })
        .andThen(validateWith(ClobTradesPageSchema, options))
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

export type FetchNotificationsError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError;
export const FetchNotificationsError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
);

const DropNotificationsRequestSchema = z.object({
  ids: z.array(z.string()).min(1),
});

export type DropNotificationsRequest = z.input<
  typeof DropNotificationsRequestSchema
>;

/**
 * Fetches notifications for the authenticated account.
 * Notifications of a kind this SDK version does not recognize are omitted.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchNotificationsError}
 *
 * @example
 * ```ts
 * const notifications = await fetchNotifications(client);
 * ```
 */
export async function fetchNotifications(
  client: BaseSecureClient,
  options: RequestOptions = {},
): Promise<NotificationsResponse> {
  const signatureType = toSignatureType(client.account.walletType);

  return unwrap(
    client.secureClob
      .get('/notifications', {
        signal: options.signal,
        params: toSearchParams({ signatureType }, snakeCase()),
      })
      .andThen(validateWith(NotificationsResponseSchema, options)),
  );
}

export type DropNotificationsError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const DropNotificationsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Drops notifications for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link DropNotificationsError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * await dropNotifications(client, {
 *   ids: ['1', '2'],
 * });
 * ```
 */
export async function dropNotifications(
  client: BaseSecureClient,
  request: DropNotificationsRequest,
): Promise<void> {
  const params = parseUserInput(request, DropNotificationsRequestSchema);
  const signatureType = toSignatureType(client.account.walletType);
  const searchParams = toSearchParams(
    {
      ids: params.ids.join(','),
      signatureType,
    },
    snakeCase(),
  );

  await unwrap(
    client.secureClob.del('/notifications', {
      params: searchParams,
    }),
  );
}

const BalanceAllowanceRequestFieldsSchema = z.object({
  assetType: AssetTypeSchema,
});

const FetchBalanceAllowanceRequestSchema = optionalExchangeAssetRequestSchema(
  BalanceAllowanceRequestFieldsSchema.shape,
);

export type FetchBalanceAllowanceRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId?: string;
      tokenId?: never;
      assetType: AssetType;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId?: string;
      assetType: AssetType;
    };

export type FetchBalanceAllowanceError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchBalanceAllowanceError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches balance and allowance for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchBalanceAllowanceError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const balanceAllowance = await fetchBalanceAllowance(client, {
 *   assetType: AssetType.COLLATERAL,
 * });
 * ```
 */
export async function fetchBalanceAllowance(
  client: BaseSecureClient,
  request: FetchBalanceAllowanceRequest,
  options: RequestOptions = {},
): Promise<BalanceAllowanceResponse> {
  const params = parseUserInput(request, FetchBalanceAllowanceRequestSchema);
  const signatureType = toSignatureType(client.account.walletType);

  return unwrap(
    client.secureClob
      .get('/balance-allowance', {
        signal: options.signal,
        params: toSearchParams(
          {
            assetType: params.assetType,
            tokenId: params.assetId ?? params.tokenId,
            signatureType,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(BalanceAllowanceResponseSchema, options)),
  );
}

const UpdateBalanceAllowanceRequestSchema = optionalExchangeAssetRequestSchema(
  BalanceAllowanceRequestFieldsSchema.shape,
);

export type UpdateBalanceAllowanceRequest =
  | {
      /** Identifier for a CTF token or Polymarket V2 position. */
      assetId?: string;
      tokenId?: never;
      assetType: AssetType;
    }
  | {
      assetId?: never;
      /** @deprecated Use `assetId`. */
      tokenId?: string;
      assetType: AssetType;
    };

export type UpdateBalanceAllowanceError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const UpdateBalanceAllowanceError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Refreshes balance and allowance for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link UpdateBalanceAllowanceError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const balanceAllowance = await updateBalanceAllowance(client, {
 *   assetType: AssetType.COLLATERAL,
 * });
 * ```
 */
export async function updateBalanceAllowance(
  client: BaseSecureClient,
  request: UpdateBalanceAllowanceRequest,
): Promise<BalanceAllowanceResponse> {
  const params = parseUserInput(request, UpdateBalanceAllowanceRequestSchema);
  const signatureType = toSignatureType(client.account.walletType);
  const searchParams = toSearchParams(
    {
      assetType: params.assetType,
      tokenId: params.assetId ?? params.tokenId,
      signatureType,
    },
    snakeCase(),
  );

  await unwrap(
    client.secureClob.get('/balance-allowance/update', {
      params: searchParams,
    }),
  );

  return fetchBalanceAllowance(client, params);
}

const FetchOrderScoringRequestSchema = z.object({
  orderId: z.string(),
});

export type FetchOrderScoringRequest = z.input<
  typeof FetchOrderScoringRequestSchema
>;
export type FetchOrderScoringError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchOrderScoringError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches whether a single order is currently scoring.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchOrderScoringError}
 *
 * @example
 * ```ts
 * const scoring = await fetchOrderScoring(client, {
 *   orderId: '123',
 * });
 * ```
 */
export async function fetchOrderScoring(
  client: BaseSecureClient,
  request: FetchOrderScoringRequest,
  options: RequestOptions = {},
): Promise<boolean> {
  const params = parseUserInput(request, FetchOrderScoringRequestSchema);
  const response = await unwrap(
    client.secureClob
      .get('/order-scoring', {
        signal: options.signal,
        params: toSearchParams(params, snakeCase()),
      })
      .andThen(validateWith(OrderScoringResponseSchema, options)),
  );

  return response.scoring;
}

const FetchOrdersScoringRequestSchema = z.object({
  orderIds: z.array(z.string()),
});

export type FetchOrdersScoringRequest = z.input<
  typeof FetchOrdersScoringRequestSchema
>;
export type FetchOrdersScoringError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchOrdersScoringError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches scoring state for multiple orders.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchOrdersScoringError}
 *
 * @example
 * ```ts
 * const scoring = await fetchOrdersScoring(client, {
 *   orderIds: ['1', '2'],
 * });
 * ```
 */
export async function fetchOrdersScoring(
  client: BaseSecureClient,
  request: FetchOrdersScoringRequest,
  options: RequestOptions = {},
): Promise<OrdersScoringResponse> {
  const params = parseUserInput(request, FetchOrdersScoringRequestSchema);
  const body = params.orderIds;

  return unwrap(
    client.secureClob
      .post('/orders-scoring', { signal: options.signal, json: body })
      .andThen(validateWith(OrdersScoringResponseSchema, options)),
  );
}

const ListUserEarningsForDayRequestSchema = z.object({
  cursor: PaginationCursorSchema.optional(),
  date: z.string(),
});

export type ListUserEarningsForDayRequest = z.input<
  typeof ListUserEarningsForDayRequestSchema
>;
export type ListUserEarningsForDayError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListUserEarningsForDayError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists per-market earnings for the authenticated account on a given day.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListUserEarningsForDayError}
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listUserEarningsForDay(client, {
 *   date: '2026-04-16',
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: UserEarning[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listUserEarningsForDay(client, {
 *   date: '2026-04-16',
 * });
 *
 * for await (const page of result) {
 *   // page.items: UserEarning[]
 * }
 * ```
 */
export function listUserEarningsForDay(
  client: BaseSecureClient,
  request: ListUserEarningsForDayRequest,
  options: RequestOptions = {},
): Paginated<UserEarning[]> {
  const { cursor, ...params } = parseUserInput(
    request,
    ListUserEarningsForDayRequestSchema,
  );
  const signatureType = toSignatureType(client.account.walletType);

  return paginate(
    (nextCursor) =>
      client.secureClob
        .get('/rewards/user', {
          signal: options.signal,
          params: toSearchParams(
            {
              ...params,
              nextCursor,
              signatureType,
            },
            snakeCase(),
          ),
        })
        .andThen(validateWith(UserEarningsPageSchema, options))
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

export type FetchTotalEarningsForUserForDayRequest = z.input<
  typeof ListUserEarningsForDayRequestSchema
>;
export type FetchTotalEarningsForUserForDayError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchTotalEarningsForUserForDayError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches total earnings for the authenticated account on a given day.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchTotalEarningsForUserForDayError}
 *
 * @example
 * ```ts
 * const earnings = await fetchTotalEarningsForUserForDay(client, {
 *   date: '2026-04-16',
 * });
 * ```
 */
export async function fetchTotalEarningsForUserForDay(
  client: BaseSecureClient,
  request: FetchTotalEarningsForUserForDayRequest,
  options: RequestOptions = {},
): Promise<TotalUserEarning[]> {
  const params = parseUserInput(request, ListUserEarningsForDayRequestSchema);
  const signatureType = toSignatureType(client.account.walletType);

  return unwrap(
    client.secureClob
      .get('/rewards/user/total', {
        signal: options.signal,
        params: toSearchParams(
          {
            ...params,
            signatureType,
          },
          snakeCase(),
        ),
      })
      .andThen(validateWith(TotalUserEarningsResponseSchema, options)),
  );
}

const ListUserEarningsAndMarketsConfigRequestSchema = z.object({
  cursor: PaginationCursorSchema.optional(),
  date: z.string(),
  noCompetition: z.boolean().optional(),
  orderBy: z.string().optional(),
  pageSize: PageSizeSchema.max(500).default(100),
  position: z.string().optional(),
});

export type ListUserEarningsAndMarketsConfigRequest = z.input<
  typeof ListUserEarningsAndMarketsConfigRequestSchema
>;
export type ListUserEarningsAndMarketsConfigError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListUserEarningsAndMarketsConfigError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists market reward configuration and earnings for the authenticated account on a given day.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link ListUserEarningsAndMarketsConfigError}
 *
 * @example
 * Fetch the first page of results:
 * ```ts
 * const result = listUserEarningsAndMarketsConfig(client, {
 *   date: '2026-04-16',
 * });
 *
 * const firstPage = await result.firstPage();
 *
 * // Optionally, fetch additional pages:
 * for await (const page of result.from(firstPage.nextCursor)) {
 *   // page.items: UserRewardsEarning[]
 * }
 * ```
 *
 * @example
 * Loop through all pages with `for await`:
 * ```ts
 * const result = listUserEarningsAndMarketsConfig(client, {
 *   date: '2026-04-16',
 * });
 *
 * for await (const page of result) {
 *   // page.items: UserRewardsEarning[]
 * }
 * ```
 */
export function listUserEarningsAndMarketsConfig(
  client: BaseSecureClient,
  request: ListUserEarningsAndMarketsConfigRequest,
  options: RequestOptions = {},
): Paginated<UserRewardsEarning[]> {
  const { cursor, ...params } = parseUserInput(
    request,
    ListUserEarningsAndMarketsConfigRequestSchema,
  );
  const signatureType = toSignatureType(client.account.walletType);

  return paginate(
    (nextCursor) =>
      client.secureClob
        .get('/rewards/user/markets', {
          signal: options.signal,
          params: toSearchParams(
            {
              ...params,
              nextCursor,
              signatureType,
            },
            snakeCase(),
          ),
        })
        .andThen(validateWith(UserRewardsEarningsPageSchema, options))
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

export type FetchRewardPercentagesError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError;
export const FetchRewardPercentagesError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
);

/**
 * Fetches reward percentages for the authenticated account.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchRewardPercentagesError}
 *
 * @example
 * ```ts
 * const percentages = await fetchRewardPercentages(client);
 * ```
 */
export async function fetchRewardPercentages(
  client: BaseSecureClient,
  options: RequestOptions = {},
): Promise<RewardsPercentages> {
  const signatureType = toSignatureType(client.account.walletType);

  return unwrap(
    client.secureClob
      .get('/rewards/user/percentages', {
        signal: options.signal,
        params: toSearchParams({ signatureType }, snakeCase()),
      })
      .andThen(validateWith(RewardsPercentagesSchema, options)),
  );
}

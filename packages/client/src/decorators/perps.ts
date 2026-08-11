import type {
  PerpsBook,
  PerpsCandle,
  PerpsFeeScheduleEntry,
  PerpsFundingRate,
  PerpsInstrument,
  PerpsPublicTrade,
  PerpsTicker,
  PerpsWithdrawalId,
} from '@polymarket/bindings/perps';
import {
  type DepositToPerpsRequest,
  depositToPerps,
  type FetchPerpsBookRequest,
  type FetchPerpsInstrumentsRequest,
  type FetchPerpsTickerRequest,
  type FetchPerpsTickersRequest,
  fetchPerpsBook,
  fetchPerpsFees,
  fetchPerpsInstruments,
  fetchPerpsTicker,
  fetchPerpsTickers,
  type ListPerpsCandlesRequest,
  type ListPerpsFundingHistoryRequest,
  type ListPerpsTradesRequest,
  listPerpsCandles,
  listPerpsFundingHistory,
  listPerpsTrades,
  type OpenPerpsSessionRequest,
  openPerpsSession,
  type PerpsSession,
  type RevokePerpsCredentialsRequest,
  revokePerpsCredentials,
  type WithdrawFromPerpsRequest,
  withdrawFromPerps,
} from '../actions';
import type {
  BaseClient,
  BasePublicClient,
  BaseSecureClient,
} from '../clients';
import type { Paginated } from '../pagination';
import type { TransactionHandle } from '../types';

export type {
  ArmPerpsAutoCancelRequest,
  CancelAllPerpsOrdersRequest,
  CancelPerpsOrderRequest,
  CancelPerpsOrdersRequest,
  CreatePerpsSessionRequest,
  DepositToPerpsRequest,
  DisarmPerpsAutoCancelRequest,
  FetchPerpsAccountConfigRequest,
  FetchPerpsBookRequest,
  FetchPerpsInstrumentsRequest,
  FetchPerpsOpenOrdersRequest,
  FetchPerpsOrdersRequest,
  FetchPerpsTickerRequest,
  FetchPerpsTickersRequest,
  ListPerpsCandlesRequest,
  ListPerpsDepositsRequest,
  ListPerpsEquityHistoryRequest,
  ListPerpsFillsRequest,
  ListPerpsFundingHistoryRequest,
  ListPerpsFundingPaymentsRequest,
  ListPerpsNotificationsRequest,
  ListPerpsPnlHistoryRequest,
  ListPerpsTradesRequest,
  ListPerpsWithdrawalsRequest,
  MarkPerpsNotificationsReadRequest,
  OpenPerpsSessionRequest,
  PerpsAutoCancelStatus,
  PerpsBookDepth,
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
  ResumePerpsSessionRequest,
  RevokePerpsCredentialsRequest,
  UpdatePerpsLeverageRequest,
  UpdatePerpsMarginRequest,
  WithdrawFromPerpsRequest,
} from '../actions';
export {
  ArmPerpsAutoCancelError,
  DepositToPerpsError,
  FetchPerpsBookError,
  FetchPerpsFeesError,
  FetchPerpsInstrumentsError,
  FetchPerpsTickerError,
  FetchPerpsTickersError,
  ListPerpsCandlesError,
  ListPerpsFundingHistoryError,
  ListPerpsTradesError,
  OpenPerpsSessionError,
  RevokePerpsCredentialsError,
  UpdatePerpsLeverageError,
  UpdatePerpsMarginError,
  WithdrawFromPerpsError,
} from '../actions';

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PublicPerpsActions = {
  /**
   * Fetches Perps instruments.
   *
   * @example
   * ```ts
   * const instruments = await client.fetchPerpsInstruments();
   * ```
   *
   * @throws {@link FetchPerpsInstrumentsError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  fetchPerpsInstruments(
    request?: FetchPerpsInstrumentsRequest,
  ): Promise<PerpsInstrument[]>;

  /**
   * Fetches the current Perps ticker for an instrument.
   *
   * @example
   * ```ts
   * const ticker = await client.fetchPerpsTicker({ instrumentId: 1 });
   * ```
   *
   * @throws {@link FetchPerpsTickerError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  fetchPerpsTicker(request: FetchPerpsTickerRequest): Promise<PerpsTicker>;

  /**
   * Fetches current Perps tickers.
   *
   * @example
   * ```ts
   * const tickers = await client.fetchPerpsTickers();
   * ```
   *
   * @throws {@link FetchPerpsTickersError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  fetchPerpsTickers(request?: FetchPerpsTickersRequest): Promise<PerpsTicker[]>;

  /**
   * Fetches a Perps order book.
   *
   * @example
   * ```ts
   * const book = await client.fetchPerpsBook({ instrumentId: 1, depth: 100 });
   * ```
   *
   * @throws {@link FetchPerpsBookError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  fetchPerpsBook(request: FetchPerpsBookRequest): Promise<PerpsBook>;

  /**
   * Lists Perps candles for an instrument with SDK-owned pagination.
   *
   * @example
   * ```ts
   * for await (const candles of client.listPerpsCandles({
   *   instrumentId: 1,
   *   interval: PerpsKlineInterval.OneMinute,
   * })) {
   *   console.log(candles);
   * }
   * ```
   *
   * @throws {@link ListPerpsCandlesError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  listPerpsCandles(request: ListPerpsCandlesRequest): Paginated<PerpsCandle[]>;

  /**
   * Lists Perps funding-rate history for an instrument with SDK-owned pagination.
   *
   * @example
   * ```ts
   * for await (const rates of client.listPerpsFundingHistory({
   *   instrumentId: 1,
   * })) {
   *   console.log(rates);
   * }
   * ```
   *
   * @throws {@link ListPerpsFundingHistoryError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  listPerpsFundingHistory(
    request: ListPerpsFundingHistoryRequest,
  ): Paginated<PerpsFundingRate[]>;

  /**
   * Lists recent Perps trades for an instrument with SDK-owned pagination.
   *
   * @example
   * ```ts
   * for await (const trades of client.listPerpsTrades({ instrumentId: 1 })) {
   *   console.log(trades);
   * }
   * ```
   *
   * @throws {@link ListPerpsTradesError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  listPerpsTrades(
    request: ListPerpsTradesRequest,
  ): Paginated<PerpsPublicTrade[]>;

  /**
   * Fetches the Perps fee schedule.
   *
   * @example
   * ```ts
   * const fees = await client.fetchPerpsFees();
   * ```
   *
   * @throws {@link FetchPerpsFeesError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  fetchPerpsFees(): Promise<PerpsFeeScheduleEntry[]>;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type SecurePerpsActions = PublicPerpsActions & {
  /**
   * Deposits collateral into Perps for the authenticated signer account.
   *
   * @example
   * ```ts
   * const transaction = await client.depositToPerps({ amount: 100_000_000n });
   * ```
   *
   * @throws {@link DepositToPerpsError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  depositToPerps(request: DepositToPerpsRequest): Promise<TransactionHandle>;

  /**
   * Opens a Perps account session.
   *
   * @remarks
   * Omit `expiresIn` to create new delegated Perps credentials that expire after
   * one week. Pass `expiresIn` as a duration in milliseconds to use a shorter or
   * longer credential lifetime, or pass existing credentials to validate and
   * resume a previous session.
   *
   * @example
   * ```ts
   * const session = await client.openPerpsSession();
   * ```
   *
   * @throws {@link OpenPerpsSessionError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  openPerpsSession(request?: OpenPerpsSessionRequest): Promise<PerpsSession>;

  /**
   * Revokes delegated Perps credentials by proxy address.
   *
   * @remarks
   * This can revoke credentials outside the currently open Perps session.
   *
   * @example
   * ```ts
   * await client.revokePerpsCredentials({ proxy: session.credentials.proxy });
   * ```
   *
   * @throws {@link RevokePerpsCredentialsError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  revokePerpsCredentials(request: RevokePerpsCredentialsRequest): Promise<void>;

  /**
   * Requests a Perps withdrawal to the authenticated wallet.
   *
   * @example
   * ```ts
   * const withdrawalId = await client.withdrawFromPerps({ amount: 100_000_000n });
   * ```
   *
   * @throws {@link WithdrawFromPerpsError}
   * Thrown on failure.
   *
   * @experimental This API may change in a breaking way in any release, including patch releases.
   */
  withdrawFromPerps(
    request: WithdrawFromPerpsRequest,
  ): Promise<PerpsWithdrawalId>;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsActions = PublicPerpsActions;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function perpsActions(client: BasePublicClient): PublicPerpsActions;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function perpsActions(client: BaseSecureClient): SecurePerpsActions;
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function perpsActions(
  client: BaseClient,
): PublicPerpsActions | SecurePerpsActions {
  const actions: PublicPerpsActions = {
    fetchPerpsBook: (request) => fetchPerpsBook(client, request),
    fetchPerpsFees: () => fetchPerpsFees(client),
    fetchPerpsInstruments: (request) => fetchPerpsInstruments(client, request),
    fetchPerpsTicker: (request) => fetchPerpsTicker(client, request),
    fetchPerpsTickers: (request) => fetchPerpsTickers(client, request),
    listPerpsCandles: (request) => listPerpsCandles(client, request),
    listPerpsFundingHistory: (request) =>
      listPerpsFundingHistory(client, request),
    listPerpsTrades: (request) => listPerpsTrades(client, request),
  };

  if (!client.isSecureClient()) return actions;

  return {
    ...actions,
    depositToPerps: (request) => depositToPerps(client, request),
    openPerpsSession: (request) => openPerpsSession(client, request),
    revokePerpsCredentials: (request) =>
      revokePerpsCredentials(client, request),
    withdrawFromPerps: (request) => withdrawFromPerps(client, request),
  };
}

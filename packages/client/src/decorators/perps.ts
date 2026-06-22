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

export type { PerpsSession, PerpsSessionEvent } from '../actions';

export type PublicPerpsActions = {
  /**
   * Fetches Perps instruments.
   *
   * @throws {@link FetchPerpsInstrumentsError}
   * Thrown on failure.
   */
  fetchPerpsInstruments(
    request?: FetchPerpsInstrumentsRequest,
  ): Promise<PerpsInstrument[]>;

  /**
   * Fetches the current Perps ticker for an instrument.
   *
   * @throws {@link FetchPerpsTickerError}
   * Thrown on failure.
   */
  fetchPerpsTicker(request: FetchPerpsTickerRequest): Promise<PerpsTicker>;

  /**
   * Fetches current Perps tickers.
   *
   * @throws {@link FetchPerpsTickersError}
   * Thrown on failure.
   */
  fetchPerpsTickers(request?: FetchPerpsTickersRequest): Promise<PerpsTicker[]>;

  /**
   * Fetches a Perps order book.
   *
   * @throws {@link FetchPerpsBookError}
   * Thrown on failure.
   */
  fetchPerpsBook(request: FetchPerpsBookRequest): Promise<PerpsBook>;

  /**
   * Lists Perps candles for an instrument with SDK-owned pagination.
   *
   * @throws {@link ListPerpsCandlesError}
   * Thrown on failure.
   */
  listPerpsCandles(request: ListPerpsCandlesRequest): Paginated<PerpsCandle[]>;

  /**
   * Lists Perps funding-rate history for an instrument with SDK-owned pagination.
   *
   * @throws {@link ListPerpsFundingHistoryError}
   * Thrown on failure.
   */
  listPerpsFundingHistory(
    request: ListPerpsFundingHistoryRequest,
  ): Paginated<PerpsFundingRate[]>;

  /**
   * Lists recent Perps trades for an instrument with SDK-owned pagination.
   *
   * @throws {@link ListPerpsTradesError}
   * Thrown on failure.
   */
  listPerpsTrades(
    request: ListPerpsTradesRequest,
  ): Paginated<PerpsPublicTrade[]>;

  /**
   * Fetches the Perps fee schedule.
   *
   * @throws {@link FetchPerpsFeesError}
   * Thrown on failure.
   */
  fetchPerpsFees(): Promise<PerpsFeeScheduleEntry[]>;
};

export type SecurePerpsActions = PublicPerpsActions & {
  /**
   * Deposits collateral into Perps for the authenticated signer account.
   *
   * @throws {@link DepositToPerpsError}
   * Thrown on failure.
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
   * @throws {@link OpenPerpsSessionError}
   * Thrown on failure.
   */
  openPerpsSession(request?: OpenPerpsSessionRequest): Promise<PerpsSession>;

  /**
   * Revokes delegated Perps credentials by proxy address.
   *
   * @remarks
   * This can revoke credentials outside the currently open Perps session.
   *
   * @throws {@link RevokePerpsCredentialsError}
   * Thrown on failure.
   */
  revokePerpsCredentials(request: RevokePerpsCredentialsRequest): Promise<void>;

  /**
   * Requests a Perps withdrawal to the authenticated wallet.
   *
   * @throws {@link WithdrawFromPerpsError}
   * Thrown on failure.
   */
  withdrawFromPerps(
    request: WithdrawFromPerpsRequest,
  ): Promise<PerpsWithdrawalId>;
};

export type PerpsActions = PublicPerpsActions;

export function perpsActions(client: BasePublicClient): PublicPerpsActions;
export function perpsActions(client: BaseSecureClient): SecurePerpsActions;
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

import { PerpsInstrumentCategory } from '@polymarket/bindings/perps';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  CancelAllPerpsOrdersRequest,
  CancelPerpsOrderRequest,
  CancelPerpsOrdersRequest,
  DepositToPerpsRequest,
  FetchPerpsAccountConfigRequest,
  FetchPerpsBookRequest,
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
  ListPerpsInternalTransfersRequest,
  ListPerpsPnlHistoryRequest,
  ListPerpsTradesRequest,
  ListPerpsWithdrawalsRequest,
  OpenPerpsSessionRequest,
  PerpsInternalTransfer,
  PerpsInternalTransferId,
  PerpsSessionAccountError,
  PerpsSessionLifecycleError,
  PerpsSessionTradingError,
  PlacePerpsOrderRequest,
  PlacePerpsOrderWithTpSlRequest,
  PlacePerpsPositionTpSlRequest,
  PostPerpsOrdersRequest,
  PublicPerpsActions,
  RevokePerpsCredentialsRequest,
  FetchPerpsInstrumentsRequest as RootFetchPerpsInstrumentsRequest,
  SecurePerpsActions,
  TransferPerpsCollateralRequest,
  UpdatePerpsLeverageRequest,
  UpdatePerpsMarginRequest,
  WithdrawFromPerpsRequest,
} from '../index';
import { FetchPerpsTickerError, UpdatePerpsMarginError } from '../index';
import type { FetchPerpsInstrumentsRequest } from './perps';

describe('FetchPerpsInstrumentsRequest', () => {
  it('allows current instrument filters', () => {
    const request: FetchPerpsInstrumentsRequest = {
      category: PerpsInstrumentCategory.Crypto,
      instrumentId: 1,
    };
    void request;
  });

  it('does not expose instrument type filtering', () => {
    const request: FetchPerpsInstrumentsRequest = {
      category: PerpsInstrumentCategory.Crypto,
      // @ts-expect-error instrument type has no meaningful public filter today.
      instrumentType: 'perpetual',
    };
    void request;
  });
});

describe('public Perps exports', () => {
  it('exports Perps request types from the root entry point', () => {
    expectTypeOf<RootFetchPerpsInstrumentsRequest>().toEqualTypeOf<FetchPerpsInstrumentsRequest>();
    expectTypeOf<FetchPerpsTickerRequest>().toEqualTypeOf<{
      instrumentId: number;
    }>();

    type RootPerpsRequests = [
      FetchPerpsTickersRequest,
      FetchPerpsBookRequest,
      ListPerpsCandlesRequest,
      ListPerpsFundingHistoryRequest,
      ListPerpsTradesRequest,
      DepositToPerpsRequest,
      OpenPerpsSessionRequest,
      RevokePerpsCredentialsRequest,
      WithdrawFromPerpsRequest,
      FetchPerpsAccountConfigRequest,
      FetchPerpsOpenOrdersRequest,
      FetchPerpsOrdersRequest,
      ListPerpsFillsRequest,
      ListPerpsFundingPaymentsRequest,
      ListPerpsInternalTransfersRequest,
      ListPerpsDepositsRequest,
      ListPerpsWithdrawalsRequest,
      ListPerpsEquityHistoryRequest,
      ListPerpsPnlHistoryRequest,
      PlacePerpsOrderRequest,
      PlacePerpsOrderWithTpSlRequest,
      PostPerpsOrdersRequest,
      PlacePerpsPositionTpSlRequest,
      CancelAllPerpsOrdersRequest,
      CancelPerpsOrderRequest,
      CancelPerpsOrdersRequest,
      UpdatePerpsLeverageRequest,
      UpdatePerpsMarginRequest,
      TransferPerpsCollateralRequest,
    ];

    expectTypeOf<RootPerpsRequests>().toEqualTypeOf<RootPerpsRequests>();
  });

  it('exports Perps error helpers from the root entry point', () => {
    type RootPerpsSessionErrors = [
      PerpsSessionAccountError,
      PerpsSessionLifecycleError,
      PerpsSessionTradingError,
    ];

    expectTypeOf<RootPerpsSessionErrors>().toEqualTypeOf<RootPerpsSessionErrors>();
    void FetchPerpsTickerError;
    void UpdatePerpsMarginError;
  });

  it('exposes owner transfers only on secure Perps actions', () => {
    const secureActions = {} as SecurePerpsActions;
    const publicActions = {} as PublicPerpsActions;

    expectTypeOf(secureActions.transferPerpsCollateral).returns.toEqualTypeOf<
      Promise<PerpsInternalTransferId>
    >();
    // @ts-expect-error Collateral movement requires an owner-capable secure client.
    void publicActions.transferPerpsCollateral;
  });

  it('exposes normalized internal-transfer history on Perps sessions', () => {
    const session = {} as import('../index').PerpsSession;

    expectTypeOf(session.listInternalTransfers).returns.toMatchTypeOf<
      import('../index').Paginated<PerpsInternalTransfer[]>
    >();
  });
});

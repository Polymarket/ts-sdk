import {
  type PerpsCredentials,
  PerpsInstrumentCategory,
} from '@polymarket/bindings/perps';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  ApprovePerpsBuilderFeeRequest,
  CancelAllPerpsOrdersRequest,
  CancelPerpsOrderRequest,
  CancelPerpsOrdersRequest,
  DepositToPerpsRequest,
  FetchPerpsAccountConfigRequest,
  FetchPerpsBookRequest,
  FetchPerpsBuilderApprovalsRequest,
  FetchPerpsBuilderEarningsSummaryRequest,
  FetchPerpsBuilderStatusRequest,
  FetchPerpsOpenOrdersRequest,
  FetchPerpsOrdersRequest,
  FetchPerpsTickerRequest,
  FetchPerpsTickersRequest,
  ListPerpsBuilderEarningsRequest,
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
  PerpsBuilderApproval,
  PerpsBuilderEarning,
  PerpsBuilderEarningsPage,
  PerpsBuilderEarningsPaginator,
  PerpsBuilderEarningsSummary,
  PerpsBuilderFillsEvent,
  PerpsBuilderStatus,
  PerpsBuilderTermsInput,
  PerpsCancelOptions,
  PerpsCancelOrderErrorCode,
  PerpsCancelOrderResult,
  PerpsCancelRetryOptions,
  PerpsInternalTransfer,
  PerpsInternalTransferId,
  PerpsSession,
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
  SubscriptionHandle,
  TransferPerpsCollateralRequest,
  UpdatePerpsLeverageRequest,
  UpdatePerpsMarginRequest,
  WithdrawFromPerpsRequest,
} from '../index';
import {
  ApprovePerpsBuilderFeeError,
  FetchPerpsBuilderApprovalsError,
  FetchPerpsBuilderEarningsSummaryError,
  FetchPerpsBuilderStatusError,
  FetchPerpsTickerError,
  ListPerpsBuilderEarningsError,
  PerpsCancelRetryError,
  PerpsKnownCancelOrderErrorCode,
  PerpsLiquidityRole,
  SubscribePerpsBuilderFillsError,
  UpdatePerpsMarginError,
} from '../index';
import type {
  CreatePerpsSessionRequest,
  FetchPerpsInstrumentsRequest,
  ResumePerpsSessionRequest,
} from './perps';

describe('Perps session builder defaults', () => {
  it('accepts plain address and exact fee strings when creating or resuming', () => {
    const builder = {
      address: '0x1111111111111111111111111111111111111111',
      feeRate: '0.0005',
    };
    const create: CreatePerpsSessionRequest = { builder, expiresIn: 60_000 };
    function resume(credentials: PerpsCredentials): ResumePerpsSessionRequest {
      return { credentials, builder };
    }
    expectTypeOf(create).toExtend<OpenPerpsSessionRequest>();
    expectTypeOf(resume).returns.toExtend<OpenPerpsSessionRequest>();
  });

  it('rejects incomplete terms and the order-only opt-out marker at setup', () => {
    const incomplete: CreatePerpsSessionRequest = {
      // @ts-expect-error Session builder defaults require both terms.
      builder: { address: '0x1111111111111111111111111111111111111111' },
    };
    const disabled: CreatePerpsSessionRequest = {
      // @ts-expect-error Omit builder to open a session without attribution.
      builder: null,
    };
    void incomplete;
    void disabled;
  });
});

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
  it('exposes owner consent and typed builder reporting through root imports', () => {
    expectTypeOf<PublicPerpsActions>()
      .toHaveProperty('fetchPerpsBuilderStatus')
      .parameters.toEqualTypeOf<[FetchPerpsBuilderStatusRequest]>();
    expectTypeOf<PublicPerpsActions>()
      .toHaveProperty('fetchPerpsBuilderStatus')
      .returns.toEqualTypeOf<Promise<PerpsBuilderStatus>>();
    expectTypeOf<PublicPerpsActions>().not.toHaveProperty(
      'approvePerpsBuilderFee',
    );
    expectTypeOf<SecurePerpsActions>()
      .toHaveProperty('approvePerpsBuilderFee')
      .parameters.toEqualTypeOf<[ApprovePerpsBuilderFeeRequest]>();
    expectTypeOf<SecurePerpsActions>()
      .toHaveProperty('approvePerpsBuilderFee')
      .returns.toEqualTypeOf<Promise<PerpsBuilderApproval>>();
    expectTypeOf<PerpsSession>().not.toHaveProperty('approvePerpsBuilderFee');

    expectTypeOf<PerpsSession>()
      .toHaveProperty('fetchBuilderApprovals')
      .parameters.toEqualTypeOf<[FetchPerpsBuilderApprovalsRequest?]>();
    expectTypeOf<PerpsSession>()
      .toHaveProperty('fetchBuilderApprovals')
      .returns.toEqualTypeOf<Promise<PerpsBuilderApproval[]>>();
    expectTypeOf<PerpsSession>()
      .toHaveProperty('listBuilderEarnings')
      .parameters.toEqualTypeOf<[ListPerpsBuilderEarningsRequest?]>();
    expectTypeOf<PerpsSession>()
      .toHaveProperty('listBuilderEarnings')
      .returns.toEqualTypeOf<PerpsBuilderEarningsPaginator>();
    expectTypeOf<PerpsSession>()
      .toHaveProperty('fetchBuilderEarningsSummary')
      .parameters.toEqualTypeOf<[FetchPerpsBuilderEarningsSummaryRequest?]>();
    expectTypeOf<PerpsSession>()
      .toHaveProperty('fetchBuilderEarningsSummary')
      .returns.toEqualTypeOf<Promise<PerpsBuilderEarningsSummary>>();
    expectTypeOf<PerpsSession>()
      .toHaveProperty('subscribeBuilderFills')
      .returns.toEqualTypeOf<
        Promise<SubscriptionHandle<PerpsBuilderFillsEvent>>
      >();
    expectTypeOf<PerpsBuilderEarningsPage>()
      .toHaveProperty('items')
      .toEqualTypeOf<PerpsBuilderEarning[]>();
    expectTypeOf<PerpsBuilderTermsInput>().toEqualTypeOf<{
      readonly address: string;
      readonly feeRate: string;
    }>();

    expectTypeOf(ApprovePerpsBuilderFeeError.isError).toBeFunction();
    expectTypeOf(FetchPerpsBuilderStatusError.isError).toBeFunction();
    expectTypeOf(FetchPerpsBuilderApprovalsError.isError).toBeFunction();
    expectTypeOf(ListPerpsBuilderEarningsError.isError).toBeFunction();
    expectTypeOf(FetchPerpsBuilderEarningsSummaryError.isError).toBeFunction();
    expectTypeOf(SubscribePerpsBuilderFillsError.isError).toBeFunction();
    expectTypeOf(PerpsLiquidityRole.Maker).toExtend<PerpsLiquidityRole>();
  });
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
      PerpsCancelOptions,
      PerpsCancelRetryOptions,
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

  it('exports known cancel rejections and narrows rejected results', () => {
    const result = undefined as unknown as PerpsCancelOrderResult;

    if (result.status === 'err') {
      expectTypeOf(result.error).toEqualTypeOf<PerpsCancelOrderErrorCode>();
    } else {
      expectTypeOf(result.error).toEqualTypeOf<undefined>();
    }
    void PerpsKnownCancelOrderErrorCode.OrderInFlight;
  });

  it('exposes retry failures with typed historical results for reconciliation', () => {
    const error = new PerpsCancelRetryError('Retry failed', {
      results: [],
      pendingIndexes: [],
      cause: new Error('Connection lost'),
    });

    expectTypeOf(error.results).toEqualTypeOf<
      readonly PerpsCancelOrderResult[]
    >();
    expectTypeOf(error.pendingIndexes).toEqualTypeOf<readonly number[]>();
    expectTypeOf(error.cause).toEqualTypeOf<unknown>();
    expectTypeOf<
      Extract<PerpsSessionTradingError, PerpsCancelRetryError>
    >().toEqualTypeOf<PerpsCancelRetryError>();
  });
});

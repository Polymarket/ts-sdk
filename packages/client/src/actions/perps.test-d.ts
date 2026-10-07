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
  DecimalString,
  DepositToPerpsRequest,
  EpochMilliseconds,
  FetchPerpsAccountConfigRequest,
  FetchPerpsBookRequest,
  FetchPerpsOpenOrdersRequest,
  FetchPerpsOrdersRequest,
  FetchPerpsRegistrationRequest,
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
  PerpsCancelOptions,
  PerpsCancelOrderErrorCode,
  PerpsCancelOrderResult,
  PerpsCancelRetryOptions,
  PerpsInstrumentSettlement,
  PerpsInternalTransfer,
  PerpsInternalTransferId,
  PerpsPositionDeleveragedNotification,
  PerpsSession,
  PerpsSessionAccountError,
  PerpsSessionEvent,
  PerpsSessionLifecycleError,
  PerpsSessionTradingError,
  PlacePerpsOrderRequest,
  PlacePerpsOrderWithTpSlRequest,
  PlacePerpsPositionTpSlRequest,
  PostPerpsOrdersRequest,
  PublicPerpsActions,
  RevokePerpsCredentialsRequest,
  FetchPerpsInstrumentsRequest as RootFetchPerpsInstrumentsRequest,
  SecureClientOptions,
  SecurePerpsActions,
  TransferPerpsCollateralRequest,
  UpdatePerpsLeverageRequest,
  UpdatePerpsMarginRequest,
  WithdrawFromPerpsRequest,
} from '../index';
import {
  FetchPerpsTickerError,
  PerpsCancelRetryError,
  PerpsKnownCancelOrderErrorCode,
  UpdatePerpsMarginError,
} from '../index';
import type {
  CreatePerpsSessionRequest,
  FetchPerpsInstrumentsRequest,
  ResumePerpsSessionRequest,
} from './perps';

describe('registration lookup types', () => {
  it('accepts a plain address and returns a boolean', () => {
    function read(
      client: PublicPerpsActions,
      request: FetchPerpsRegistrationRequest,
    ) {
      expectTypeOf(client.fetchPerpsRegistration(request)).toEqualTypeOf<
        Promise<boolean>
      >();
      client.fetchPerpsRegistration({
        address: '0x1111111111111111111111111111111111111111',
      });
      // @ts-expect-error An address is required.
      client.fetchPerpsRegistration({});
    }
    expectTypeOf(read).toBeFunction();
  });
});

describe('session notification recovery', () => {
  it('narrows server recovery metadata from the public session iterator', () => {
    async function consume(session: PerpsSession) {
      for await (const event of session) {
        expectTypeOf(event).toEqualTypeOf<PerpsSessionEvent>();
        if (event.type !== 'resync') continue;
        expectTypeOf(event.previousSequence).toEqualTypeOf<
          number | undefined
        >();
        if (event.reason === 'server') {
          expectTypeOf(event.channel).toEqualTypeOf<'notifications'>();
          expectTypeOf(event.sequence).toEqualTypeOf<number>();
          expectTypeOf(event.timestamp).toEqualTypeOf<EpochMilliseconds>();
          expectTypeOf(event.previousSequence).toEqualTypeOf<undefined>();
          expectTypeOf(event).not.toHaveProperty('payload');
        } else {
          expectTypeOf(event.reason).toEqualTypeOf<
            'reconnect' | 'sequence_gap'
          >();
          expectTypeOf(event.previousSequence).toEqualTypeOf<
            number | undefined
          >();
        }
      }
    }
    void consume;
  });
});

describe('session builder consent', () => {
  it('requires an explicit maximum and keeps versions internal', () => {
    function approve(session: PerpsSession) {
      void session.approveBuilderFee({
        builderAddress: '0x1111111111111111111111111111111111111111',
        maxFeeRate: '0.0003',
      });
      void session.approveBuilderFee({ maxFeeRate: '0.0005' });
      // @ts-expect-error Consent requires an explicit maximum.
      void session.approveBuilderFee();
      // @ts-expect-error Selecting a builder does not specify an approved maximum.
      void session.approveBuilderFee({
        builderAddress: '0x1111111111111111111111111111111111111111',
      });
      void session.revokeBuilderFee();
    }
    void approve;
    expectTypeOf<ApprovePerpsBuilderFeeRequest>().not.toHaveProperty(
      'approvalVersion',
    );
  });

  it('accepts an address selector and receipts option on creation and resume', () => {
    const create: CreatePerpsSessionRequest = {
      builderAttribution: '0x1111111111111111111111111111111111111111',
      includeBuilderFills: true,
    };
    function resume(credentials: PerpsCredentials): ResumePerpsSessionRequest {
      return { ...create, credentials };
    }
    expectTypeOf(create).toExtend<OpenPerpsSessionRequest>();
    expectTypeOf(resume).returns.toExtend<OpenPerpsSessionRequest>();
    expectTypeOf<SecureClientOptions>().not.toHaveProperty(
      'perpsBuilderAttribution',
    );
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

  it('narrows ADL notifications from session history and events', async () => {
    const session = {} as PerpsSession;
    const page = await session.listNotifications().firstPage();
    for (const entry of page.items) {
      if (entry.notification.type === 'position_deleveraged') {
        expectTypeOf(
          entry.notification,
        ).toEqualTypeOf<PerpsPositionDeleveragedNotification>();
      }
    }
    for await (const event of session) {
      if (
        event.type === 'notification' &&
        event.payload.type === 'position_deleveraged'
      ) {
        expectTypeOf(
          event.payload,
        ).toEqualTypeOf<PerpsPositionDeleveragedNotification>();
      }
    }
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

import type {
  CreatePerpsTwapRequest,
  PausePerpsTwapRequest,
  PerpsTwap,
  PerpsTwapAccepted,
} from '../index';

it('exposes authenticated TWAP session calls and public models', () => {
  expectTypeOf<PerpsSession>()
    .toHaveProperty('createTwap')
    .toEqualTypeOf<
      (request: CreatePerpsTwapRequest) => Promise<PerpsTwapAccepted>
    >();
  expectTypeOf<PerpsSession>()
    .toHaveProperty('fetchTwaps')
    .toEqualTypeOf<() => Promise<PerpsTwap[]>>();
  expectTypeOf<PerpsSession>()
    .toHaveProperty('pauseTwap')
    .toEqualTypeOf<(request: PausePerpsTwapRequest) => Promise<void>>();
});

describe('instrument retirement metadata', () => {
  it('exposes canonical metadata through the public client read', () => {
    async function read(client: PublicPerpsActions) {
      const instruments = await client.fetchPerpsInstruments();
      for (const instrument of instruments) {
        expectTypeOf(instrument.closeOnly).toEqualTypeOf<boolean>();
        expectTypeOf(instrument.displaySymbol).toEqualTypeOf<
          string | undefined
        >();
        expectTypeOf(instrument.settlement).toEqualTypeOf<
          PerpsInstrumentSettlement | undefined
        >();
        if (instrument.settlement) {
          expectTypeOf(instrument.settlement.sequence).toEqualTypeOf<number>();
          expectTypeOf(
            instrument.settlement.timestamp,
          ).toEqualTypeOf<EpochMilliseconds>();
          expectTypeOf(
            instrument.settlement.price,
          ).toEqualTypeOf<DecimalString>();
          expectTypeOf(
            instrument.settlement.insuranceDebit,
          ).toEqualTypeOf<DecimalString>();
        }
      }
    }
    void read;
  });
});

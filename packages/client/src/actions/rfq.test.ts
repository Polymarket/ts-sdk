import {
  OrderSide,
  toBaseUnits,
  toBuilderCode,
  toComboConditionId,
  toDecimalString,
  toEpochMilliseconds,
  toPositionId,
  toRfqId,
  toRfqQuoteId,
} from '@polymarket/bindings';
import { SignatureType } from '@polymarket/bindings/clob';
import {
  type BuilderRfqQuoteReadyResponse,
  type BuilderRfqStatusResponse,
  ComboAcceptFailureReason,
  ComboQuoteUnavailableReason,
  RfqDirection,
  RfqRejectionCode,
  RfqRequestedSizeUnit,
  RfqSide,
  RfqStatus,
} from '@polymarket/bindings/combos';
import { expectEvmAddress, expectEvmSignature } from '@polymarket/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { production } from '../environments';
import {
  RequestRejectedError,
  TimeoutError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { createExchangeV3OrderDomain } from '../exchange';
import { parseUserInput } from '../input';
import type { OrderIdentity } from '../wallet';
import {
  RfqRequestRejectedError,
  toRfqRequestRejection,
} from './rfq/request-errors';
import {
  AcceptComboQuoteParamsSchema,
  acceptComboQuoteOutcome,
  buildComboQuoteRequest,
  createComboAcceptanceOrder,
  pollComboFill,
  resolveComboQuote,
  signComboAcceptanceOrder,
} from './rfq/requester';

const signer = expectEvmAddress('0x1111111111111111111111111111111111111111');
const identity: OrderIdentity = {
  maker: signer,
  signer,
  signatureType: SignatureType.EOA,
};
const signature = expectEvmSignature(`0x${'11'.repeat(65)}`);
const builderCode = toBuilderCode(`0x${'ab'.repeat(32)}`);
const rfqId = toRfqId('rfq-1');
const takerOrderHash = `0x${'ef'.repeat(32)}`;
const legs = ['123', '456'];
const buy = {
  direction: OrderSide.BUY,
  amount: 100,
  legPositionIds: legs,
} as const;
const ready: BuilderRfqQuoteReadyResponse = {
  rfqId,
  status: RfqStatus.AwaitingRequesterAcceptance,
  expiresAt: toEpochMilliseconds(1_773_890_765_500),
  builderCode,
  request: {
    rfqId,
    legPositionIds: legs.map(toPositionId),
    conditionId: toComboConditionId(`0x03${'0'.repeat(60)}`),
    yesPositionId: toPositionId('789'),
    noPositionId: toPositionId('790'),
    direction: RfqDirection.Buy,
    side: RfqSide.Yes,
    requestedSize: {
      unit: RfqRequestedSizeUnit.Notional,
      valueE6: toBaseUnits('100000000'),
    },
  },
  quote: {
    quoteId: toRfqQuoteId('quote-1'),
    blendedPrice: toDecimalString('0.45'),
    makerAmount: toDecimalString('0.966191'),
    takerAmount: toDecimalString('1.932381'),
    totalRequired: toDecimalString('1'),
  },
};
const sellReady: BuilderRfqQuoteReadyResponse = {
  ...ready,
  request: {
    ...ready.request,
    direction: RfqDirection.Sell,
    requestedSize: {
      unit: RfqRequestedSizeUnit.Shares,
      valueE6: toBaseUnits('2500000'),
    },
  },
  quote: {
    ...ready.quote,
    makerAmount: toDecimalString('2.5'),
    takerAmount: toDecimalString('1.125'),
    totalRequired: toDecimalString('2.5'),
    netReceive: toDecimalString('1.09'),
  },
};
const executing: BuilderRfqStatusResponse = {
  rfqId,
  status: RfqStatus.Executing,
};
const pending: BuilderRfqStatusResponse = {
  rfqId,
  status: RfqStatus.AwaitingMakerConfirmation,
  takerOrderHash,
};

afterEach(() => vi.useRealTimers());

describe('combo quote construction and projection', () => {
  it('builds the BUY request and returns a self-contained quote', () => {
    const request = buildComboQuoteRequest(identity, buy);
    expect(request).toEqual({
      direction: 'BUY',
      leg_position_ids: legs,
      maker_address: signer,
      requested_size: { unit: 'notional', value_e6: '100000000' },
      side: 'YES',
      signature_type: 0,
      signer_address: signer,
    });
    expect(resolveComboQuote(ready, request)).toEqual({
      rfqId,
      quote: {
        ...ready.quote,
        rfqId,
        builderCode,
        expiresAt: ready.expiresAt,
        positionId: '789',
        direction: OrderSide.BUY,
      },
    });
  });

  it('canonicalizes leg order before comparing the response echo', () => {
    const request = buildComboQuoteRequest(identity, {
      ...buy,
      legPositionIds: [...legs].reverse(),
    });
    expect(request.leg_position_ids).toEqual(legs);
    expect(resolveComboQuote(ready, request).quote).not.toBeNull();
  });

  it('builds SELL share units and preserves exact net proceeds', () => {
    const request = buildComboQuoteRequest(identity, {
      direction: OrderSide.SELL,
      size: '2.5',
      legPositionIds: legs,
    });
    expect(request.requested_size).toEqual({
      unit: 'shares',
      value_e6: '2500000',
    });
    expect(resolveComboQuote(sellReady, request).quote).toMatchObject({
      direction: OrderSide.SELL,
      makerAmount: '2.5',
      takerAmount: '1.125',
      netReceive: '1.09',
      totalRequired: '2.5',
    });
  });

  it('rejects SELL quotes without net proceeds', () => {
    const { netReceive: _netReceive, ...quote } = sellReady.quote;
    const request = buildComboQuoteRequest(identity, {
      direction: OrderSide.SELL,
      size: '2.5',
      legPositionIds: legs,
    });
    expect(() => resolveComboQuote({ ...sellReady, quote }, request)).toThrow(
      /omitted net sell proceeds/,
    );
  });

  it.each([
    { field: 'rfqId', request: { ...ready.request, rfqId: toRfqId('other') } },
    {
      field: 'direction',
      request: { ...ready.request, direction: RfqDirection.Sell },
    },
    { field: 'side', request: { ...ready.request, side: RfqSide.No } },
    {
      field: 'legPositionIds',
      request: {
        ...ready.request,
        legPositionIds: [...ready.request.legPositionIds].reverse(),
      },
    },
    {
      field: 'requestedSize',
      request: {
        ...ready.request,
        requestedSize: {
          ...ready.request.requestedSize,
          valueE6: toBaseUnits('99999999'),
        },
      },
    },
  ])('rejects mismatched $field in the response echo', ({ request }) => {
    expect(() =>
      resolveComboQuote(
        { ...ready, request },
        buildComboQuoteRequest(identity, buy),
      ),
    ).toThrow(UnexpectedResponseError);
  });

  it('returns no quote as a business outcome', () => {
    expect(
      resolveComboQuote(
        {
          rfqId,
          status: RfqStatus.Failed,
          error: { code: 'NO_QUOTES', message: 'no quotes' },
        },
        buildComboQuoteRequest(identity, buy),
      ),
    ).toEqual({
      rfqId,
      quote: null,
      reason: ComboQuoteUnavailableReason.NoQuotes,
    });
  });

  it('rejects canonically duplicate leg IDs while building the request', () => {
    expect(() =>
      buildComboQuoteRequest(identity, { ...buy, legPositionIds: ['01', '1'] }),
    ).toThrow(UserInputError);
  });

  it.each([
    {
      code: 'CONTRADICTORY_LEGS',
      status: 400,
      expected: RfqRejectionCode.ContradictoryLegs,
    },
    {
      code: 'SOMETHING_NEW',
      status: 400,
      expected: RfqRejectionCode.RequestFailed,
    },
    { code: undefined, status: 502, expected: RfqRejectionCode.RequestFailed },
  ])('classifies rejection $code and preserves its cause', ({
    code,
    expected,
    status,
  }) => {
    const rejection = new RequestRejectedError('rejected', {
      code,
      status,
    });
    expect(toRfqRequestRejection(rejection)).toBeInstanceOf(
      RfqRequestRejectedError,
    );
    expect(toRfqRequestRejection(rejection)).toMatchObject({
      cause: rejection,
      code: expected,
      status,
    });
  });

  it('maps future final-state error codes and preserves the structured error', () => {
    const error = { code: 'SOMETHING_NEW', message: 'something new' };
    expect(() =>
      resolveComboQuote(
        { rfqId, status: RfqStatus.Failed, error },
        buildComboQuoteRequest(identity, buy),
      ),
    ).toThrow(
      expect.objectContaining({
        cause: error,
        code: RfqRejectionCode.RequestFailed,
        status: 200,
      }),
    );
  });
});

describe('combo acceptance signing', () => {
  it.each([
    {
      name: 'BUY',
      ready,
      side: 0,
      makerAmount: '966191',
      takerAmount: '1932381',
    },
    {
      name: 'SELL',
      ready: sellReady,
      side: 1,
      makerAmount: '2500000',
      takerAmount: '1125000',
    },
  ])('signs a serialized $name quote without relying on requester state', async ({
    ready,
    side,
    makerAmount,
    takerAmount,
  }) => {
    const request = buildComboQuoteRequest(
      identity,
      ready.request.direction === RfqDirection.Buy
        ? buy
        : { direction: OrderSide.SELL, size: '2.5', legPositionIds: legs },
    );
    const quote = resolveComboQuote(ready, request).quote;
    const input = parseUserInput(
      JSON.parse(JSON.stringify(quote)),
      AcceptComboQuoteParamsSchema,
    );
    const order = createComboAcceptanceOrder(identity, input);
    const sign = vi.fn(async () => signature);
    const signed = await signComboAcceptanceOrder(
      sign,
      createExchangeV3OrderDomain({
        chainId: production.chainId,
        exchange: production.contracts.exchangeV3,
      }),
      order,
    );
    expect(sign).toHaveBeenCalledTimes(1);
    expect(signed).toMatchObject({
      builder: builderCode,
      maker: signer,
      signer,
      makerAmount,
      takerAmount,
      side,
      signatureType: 0,
      signature,
      tokenId: '789',
      metadata: `0x${'0'.repeat(64)}`,
    });
  });
});

describe('combo acceptance outcome', () => {
  it.each([
    new TransportError('socket hang up'),
    new UnexpectedResponseError('invalid status'),
  ])('retries one dropped or unvalidated acceptance without rebuilding it: $name', async (error) => {
    const submit = vi
      .fn<() => Promise<BuilderRfqStatusResponse>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(executing);
    const read = vi.fn();
    await expect(acceptComboQuoteOutcome(rfqId, submit, read)).resolves.toEqual(
      { rfqId, status: 'executing' },
    );
    expect(submit).toHaveBeenCalledTimes(2);
    expect(read).not.toHaveBeenCalled();
  });

  it('stops after two unvalidated acceptance responses', async () => {
    const submit = vi
      .fn()
      .mockRejectedValue(new UnexpectedResponseError('invalid status'));
    await expect(
      acceptComboQuoteOutcome(rfqId, submit, vi.fn()),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('returns expiry after a dropped acceptance is retried', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new TransportError('dropped'))
      .mockRejectedValueOnce(
        new RequestRejectedError('expired rfq', {
          code: 'EXPIRED_RFQ',
          status: 409,
        }),
      );
    await expect(
      acceptComboQuoteOutcome(rfqId, submit, vi.fn()),
    ).resolves.toMatchObject({
      rfqId,
      status: 'failed',
      reason: ComboAcceptFailureReason.AcceptanceWindowExpired,
    });
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: 'maker decline',
      status: RfqStatus.Failed,
      code: 'MAKER_DECLINED',
      reason: ComboAcceptFailureReason.MakerDeclined,
    },
    {
      name: 'expiry',
      status: RfqStatus.Expired,
      code: 'EXPIRED_RFQ',
      reason: ComboAcceptFailureReason.AcceptanceWindowExpired,
    },
  ])('returns $name with its structured error', async ({
    status,
    code,
    reason,
  }) => {
    const error = { code, message: code };
    await expect(
      acceptComboQuoteOutcome(
        rfqId,
        async () => ({ rfqId, status, error }),
        vi.fn(),
      ),
    ).resolves.toEqual({ rfqId, status: 'failed', reason, error });
  });

  it('polls a pending maker outcome and keeps the accept response order hash', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue(executing);
    const outcome = acceptComboQuoteOutcome(rfqId, async () => pending, read);
    await vi.advanceTimersByTimeAsync(500);
    await expect(outcome).resolves.toEqual({
      rfqId,
      status: 'executing',
      takerOrderHash,
    });
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('combo fill polling', () => {
  it('returns terminal failures with their structured error', async () => {
    const error = {
      code: 'TRADE_SUBMISSION_FAILED',
      message: 'trade submission failed',
    };
    await expect(
      pollComboFill(rfqId, 30_000, 1000, async () => ({
        rfqId,
        status: RfqStatus.Failed,
        error,
      })),
    ).resolves.toEqual({ rfqId, status: RfqStatus.Failed, error });
  });

  it('times out when the RFQ remains non-terminal', async () => {
    vi.useFakeTimers();
    const result = expect(
      pollComboFill(rfqId, 10, 1, async () => executing),
    ).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await result;
  });
});

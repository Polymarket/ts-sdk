import { describe, expect, it } from 'vitest';
import {
  BuilderRfqCreateResponseSchema,
  BuilderRfqStatusResponseSchema,
  RfqStatus,
} from './builder-rfq';
import { RfqExecutionStatus } from './rfq';

const QUOTE_READY_WIRE = {
  rfq_id: 'rfq-1',
  status: 'AWAITING_REQUESTER_ACCEPTANCE',
  expires_at: 1_773_890_765_500,
  builder_code: `0x${'ab'.repeat(32)}`,
  request: {
    rfq_id: 'rfq-1',
    leg_position_ids: ['123', '456'],
    condition_id: `0x03${'0'.repeat(60)}`,
    yes_position_id: '789',
    no_position_id: '790',
    direction: 'BUY',
    side: 'YES',
    requested_size: { unit: 'notional', value_e6: '1000000' },
    created_at: 1_773_890_758_000,
  },
  quote: {
    quote_id: 'quote-1',
    blended_price_e6: '450000',
    maker_amount_e6: '966191',
    taker_amount_e6: '1932381',
    total_required_e6: '1000000',
  },
};

describe('BuilderRfqCreateResponseSchema', () => {
  it('parses a quote-ready response and converts e6 amounts to decimal strings', () => {
    const response = BuilderRfqCreateResponseSchema.parse(QUOTE_READY_WIRE);

    expect(response).toMatchObject({
      rfqId: 'rfq-1',
      status: RfqStatus.AwaitingRequesterAcceptance,
      expiresAt: 1_773_890_765_500,
      builderCode: `0x${'ab'.repeat(32)}`,
      request: {
        conditionId: `0x03${'0'.repeat(60)}`,
        direction: 'BUY',
        legPositionIds: ['123', '456'],
        noPositionId: '790',
        requestedSize: { unit: 'notional', valueE6: '1000000' },
        rfqId: 'rfq-1',
        side: 'YES',
        yesPositionId: '789',
      },
      quote: {
        quoteId: 'quote-1',
        blendedPrice: '0.45',
        makerAmount: '0.966191',
        takerAmount: '1.932381',
        totalRequired: '1',
      },
    });
  });

  it('parses a terminal no-quotes response', () => {
    const response = BuilderRfqCreateResponseSchema.parse({
      rfq_id: 'rfq-2',
      status: 'FAILED',
      builder_code: `0x${'ab'.repeat(32)}`,
      error: { code: 'NO_QUOTES', message: 'no quotes' },
    });

    expect(response).toEqual({
      rfqId: 'rfq-2',
      status: RfqStatus.Failed,
      error: { code: 'NO_QUOTES', message: 'no quotes' },
    });
  });
});

describe('BuilderRfqStatusResponseSchema', () => {
  it('parses lifecycle and merged execution status values', () => {
    expect(
      BuilderRfqStatusResponseSchema.parse({
        rfq_id: 'rfq-1',
        status: 'EXECUTING',
      }).status,
    ).toBe(RfqStatus.Executing);

    expect(
      BuilderRfqStatusResponseSchema.parse({
        rfq_id: 'rfq-1',
        status: 'CONFIRMED',
        tx_hash: `0x${'cd'.repeat(32)}`,
      }),
    ).toEqual({
      rfqId: 'rfq-1',
      status: RfqExecutionStatus.Confirmed,
      txHash: `0x${'cd'.repeat(32)}`,
    });
  });

  it('parses an accept response with a taker order hash and failure details', () => {
    expect(
      BuilderRfqStatusResponseSchema.parse({
        rfq_id: 'rfq-1',
        status: 'FAILED',
        taker_order_hash: `0x${'ef'.repeat(32)}`,
        error: { code: 'MAKER_DECLINED', message: 'maker declined' },
      }),
    ).toEqual({
      rfqId: 'rfq-1',
      status: RfqStatus.Failed,
      takerOrderHash: `0x${'ef'.repeat(32)}`,
      error: { code: 'MAKER_DECLINED', message: 'maker declined' },
    });
  });

  it('preserves error codes introduced after this SDK version', () => {
    expect(
      BuilderRfqStatusResponseSchema.parse({
        rfq_id: 'rfq-1',
        status: 'FAILED',
        error: { code: 'SOMETHING_NEW', message: 'something new' },
      }),
    ).toMatchObject({
      error: { code: 'SOMETHING_NEW', message: 'something new' },
      rfqId: 'rfq-1',
      status: RfqStatus.Failed,
    });
  });

  it('rejects unknown status values', () => {
    expect(
      BuilderRfqStatusResponseSchema.safeParse({
        rfq_id: 'rfq-1',
        status: 'SOMETHING_NEW',
      }).success,
    ).toBe(false);
  });
});

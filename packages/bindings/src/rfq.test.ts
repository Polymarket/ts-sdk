import { describe, expect, it } from 'vitest';
import { RfqKnownErrorCode, RfqQuoterInboundMessageSchema } from './rfq';

describe('RFQ quoter inbound messages', () => {
  it('parses confirmed trade broadcasts without maker identity', () => {
    const message = RfqQuoterInboundMessageSchema.parse({
      type: 'RFQ_TRADE',
      rfq_id: 'rfq-1',
      requester_id: 'req-1',
      condition_id:
        '0x032def24bfb0c5c57fb236fac08b94236a0000000000000000000000000000',
      leg_position_ids: ['1', '2'],
      direction: 'BUY',
      side: 'YES',
      price_e6: '125000',
      size_e6: '800000',
      executed_at: 1_780_854_786_039,
    });

    expect(message).toMatchObject({
      type: 'trade',
      rfqId: 'rfq-1',
      requesterId: 'req-1',
      price: '0.125',
      size: '0.8',
    });
    expect(message).not.toHaveProperty('makerAddress');
    expect(message).not.toHaveProperty('txHash');
  });

  it('parses known RFQ error codes', () => {
    const message = RfqQuoterInboundMessageSchema.parse({
      type: 'RFQ_ERROR',
      request_type: 'RFQ_QUOTE',
      rfq_id: 'rfq-1',
      code: 'MAKER_QUOTE_LIMITED',
      error: 'maker quote limited',
    });

    expect(message).toMatchObject({
      code: RfqKnownErrorCode.MakerQuoteLimited,
      type: 'rfq_error',
    });
  });

  it('passes unknown RFQ error codes through as strings', () => {
    const message = RfqQuoterInboundMessageSchema.parse({
      type: 'RFQ_ERROR',
      request_type: 'RFQ_QUOTE',
      rfq_id: 'rfq-1',
      code: 'FUTURE_ERROR_CODE',
      error: 'future request failed',
    });

    expect(message).toMatchObject({
      code: 'FUTURE_ERROR_CODE',
      type: 'rfq_error',
    });
  });
});

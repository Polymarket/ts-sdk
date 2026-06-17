import { describe, expect, it } from 'vitest';
import { RfqQuoterInboundMessageSchema } from './rfq';

describe('RFQ quoter inbound messages', () => {
  it('parses confirmed trade broadcasts without maker identity', () => {
    const message = RfqQuoterInboundMessageSchema.parse({
      type: 'RFQ_TRADE',
      rfq_id: 'rfq-1',
      requestor_public_id: 'req-1',
      condition_id:
        '0x032def24bfb0c5c57fb236fac08b94236a0000000000000000000000000000',
      leg_position_ids: ['1', '2'],
      direction: 'BUY',
      side: 'YES',
      price_e6: '125000',
      size_e6: '800000',
      tx_hash:
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      executed_at: 1_780_854_786_039,
    });

    expect(message).toMatchObject({
      type: 'trade',
      rfqId: 'rfq-1',
      requestorPublicId: 'req-1',
      price: '0.125',
      size: '0.8',
    });
    expect(message).not.toHaveProperty('makerAddress');
  });
});

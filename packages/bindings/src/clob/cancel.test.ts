import { describe, expect, it } from 'vitest';
import { toOrderId } from '../shared';
import { CancelOrdersResponseSchema } from './cancel';

const CANCELED_ORDER_ID = toOrderId(
  '0x38a73eed1e6184bf3b3d1417f0e72a039b3479ad272b0bad9b943ff29ce0f0eb',
);
const NOT_CANCELED_ORDER_ID = toOrderId(
  '0xaaf0e72a039b3479ad272b0bad9b943ff29ce0f0eb38a73eed1e6184bf3b3d14',
);

describe('CancelOrdersResponseSchema', () => {
  it('parses canceled order IDs and not-canceled reasons', () => {
    const response = CancelOrdersResponseSchema.parse({
      canceled: [CANCELED_ORDER_ID],
      not_canceled: {
        [NOT_CANCELED_ORDER_ID]: 'order not found',
      },
    });

    expect(response.canceled).toEqual([CANCELED_ORDER_ID]);
    expect(response.notCanceled[NOT_CANCELED_ORDER_ID]).toBe('order not found');
  });

  it('parses empty collections', () => {
    const response = CancelOrdersResponseSchema.parse({
      canceled: [],
      not_canceled: {},
    });

    expect(response.canceled).toEqual([]);
    expect(response.notCanceled).toEqual({});
  });

  it('rejects non-string canceled entries', () => {
    expect(() =>
      CancelOrdersResponseSchema.parse({
        canceled: [42],
        not_canceled: {},
      }),
    ).toThrow();
  });
});

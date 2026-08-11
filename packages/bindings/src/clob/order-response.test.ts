import { describe, expect, expectTypeOf, it } from 'vitest';
import type { OrderId } from '../shared';
import { OrderPostStatus, OrderResponseSchema } from './order-response';

describe('OrderResponseSchema', () => {
  it('normalizes empty making/taking amounts on a live order to zero', () => {
    const response = OrderResponseSchema.parse({
      errorMsg: '',
      makingAmount: '',
      orderID: 'order-1',
      status: 'live',
      success: true,
      takingAmount: '',
    });

    expect(response.ok).toBe(true);
    if (response.ok) {
      expectTypeOf(response.orderId).toEqualTypeOf<OrderId>();
      expect(response.status).toBe(OrderPostStatus.LIVE);
      expect(response.makingAmount).toBe('0');
      expect(response.takingAmount).toBe('0');
    }
  });

  it('passes populated making/taking amounts through unchanged', () => {
    const response = OrderResponseSchema.parse({
      errorMsg: '',
      makingAmount: '10.5',
      orderID: 'order-2',
      status: 'matched',
      success: true,
      takingAmount: '21',
      tradeIDs: ['trade-1'],
    });

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.makingAmount).toBe('10.5');
      expect(response.takingAmount).toBe('21');
    }
  });
});

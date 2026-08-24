import { describe, expect, expectTypeOf, it } from 'vitest';
import type { OrderId } from '../shared';
import {
  OrderPostStatus,
  OrderResponseErrorCode,
  OrderResponseSchema,
  OrderResponsesSchema,
} from './order-response';

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

  it('maps a post-only mode rejection to the post_only_mode code', () => {
    const response = OrderResponseSchema.parse({
      errorMsg: 'post-only mode: only post-only orders and cancels are allowed',
      makingAmount: '',
      orderID: '',
      status: '',
      success: true,
      takingAmount: '',
    });

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.code).toBe(OrderResponseErrorCode.POST_ONLY_MODE);
    }
  });

  it('maps batch post-only rejections to the post_only_mode code per order', () => {
    const rejection = {
      errorMsg: 'post-only mode: only post-only orders and cancels are allowed',
      makingAmount: '',
      orderID: '',
      status: '',
      success: true,
      takingAmount: '',
    };

    const responses = OrderResponsesSchema.parse([rejection, rejection]);

    expect(responses).toHaveLength(2);
    for (const response of responses) {
      expect(response.ok).toBe(false);
      if (!response.ok) {
        expect(response.code).toBe(OrderResponseErrorCode.POST_ONLY_MODE);
      }
    }
  });
});

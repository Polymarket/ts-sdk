import type { DecimalString, OrderSide, TokenId } from '@polymarket/bindings';
import type { Prices } from '@polymarket/bindings/clob';
import { describe, expectTypeOf, it } from 'vitest';
import type { DataActions } from '../decorators';
import type { fetchPrices } from './index';

describe('public CLOB price read types', () => {
  it('models fetchPrices results as token ID keyed partial side records', () => {
    expectTypeOf<Prices>().toEqualTypeOf<
      Record<TokenId, Partial<Record<OrderSide, DecimalString>>>
    >();
  });

  it('preserves fetchPrices return type on actions and decorators', () => {
    const actions = {} as DataActions;

    expectTypeOf<ReturnType<typeof fetchPrices>>().toEqualTypeOf<
      Promise<Prices>
    >();
    expectTypeOf<ReturnType<typeof actions.fetchPrices>>().toEqualTypeOf<
      Promise<Prices>
    >();
  });
});

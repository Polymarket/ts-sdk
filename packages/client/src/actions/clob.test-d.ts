import type { DecimalString, OrderSide, TokenId } from '@polymarket/bindings';
import type { Midpoints, Prices, Spreads } from '@polymarket/bindings/clob';
import { describe, expectTypeOf, it } from 'vitest';
import type { DataActions } from '../decorators';
import type {
  fetchMidpoint,
  fetchMidpoints,
  fetchPrice,
  fetchPrices,
  fetchSpread,
  fetchSpreads,
} from './index';

describe('public CLOB price read types', () => {
  it('preserves branded decimal action return types', () => {
    expectTypeOf<ReturnType<typeof fetchMidpoint>>().toEqualTypeOf<
      Promise<DecimalString>
    >();
    expectTypeOf<ReturnType<typeof fetchMidpoints>>().toEqualTypeOf<
      Promise<Midpoints>
    >();
    expectTypeOf<ReturnType<typeof fetchPrice>>().toEqualTypeOf<
      Promise<DecimalString>
    >();
    expectTypeOf<ReturnType<typeof fetchSpread>>().toEqualTypeOf<
      Promise<DecimalString>
    >();
    expectTypeOf<ReturnType<typeof fetchSpreads>>().toEqualTypeOf<
      Promise<Spreads>
    >();
  });

  it('preserves branded decimal decorator return types', () => {
    const actions = {} as DataActions;

    expectTypeOf<ReturnType<typeof actions.fetchMidpoint>>().toEqualTypeOf<
      Promise<DecimalString>
    >();
    expectTypeOf<ReturnType<typeof actions.fetchMidpoints>>().toEqualTypeOf<
      Promise<Midpoints>
    >();
    expectTypeOf<ReturnType<typeof actions.fetchPrice>>().toEqualTypeOf<
      Promise<DecimalString>
    >();
    expectTypeOf<ReturnType<typeof actions.fetchSpread>>().toEqualTypeOf<
      Promise<DecimalString>
    >();
    expectTypeOf<ReturnType<typeof actions.fetchSpreads>>().toEqualTypeOf<
      Promise<Spreads>
    >();
  });

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

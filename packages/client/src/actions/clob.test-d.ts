import type { DecimalString } from '@polymarket/bindings';
import type { Midpoints, Spreads } from '@polymarket/bindings/clob';
import { describe, expectTypeOf, it } from 'vitest';
import type { DataActions } from '../decorators';
import type {
  fetchMidpoint,
  fetchMidpoints,
  fetchPrice,
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
});

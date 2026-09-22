import {
  type DecimalString,
  type OrderSide,
  type PositionId,
  type TokenId,
  toPositionId,
  toTokenId,
} from '@polymarket/bindings';
import type {
  LastTradePrice,
  Midpoints,
  Prices,
  Spreads,
} from '@polymarket/bindings/clob';
import { describe, expectTypeOf, it } from 'vitest';
import type { DataActions } from '../decorators';
import type {
  FetchOrderBookRequest,
  fetchLastTradePrice,
  fetchMidpoint,
  fetchMidpoints,
  fetchPrice,
  fetchPrices,
  fetchSpread,
  fetchSpreads,
} from './index';

describe('public CLOB price read types', () => {
  it('accepts assetId and the tokenId compatibility input', () => {
    const assetRequest: FetchOrderBookRequest = { assetId: toTokenId('123') };
    const positionRequest: FetchOrderBookRequest = {
      assetId: toPositionId('456'),
    };
    const tokenRequest: FetchOrderBookRequest = { tokenId: '123' };
    const rawAssetRequest: FetchOrderBookRequest = { assetId: '123' };
    // @ts-expect-error Provide exactly one exchange asset identifier.
    const both: FetchOrderBookRequest = {
      assetId: toTokenId('123'),
      tokenId: '123',
    };
    // @ts-expect-error An exchange asset identifier is required.
    const neither: FetchOrderBookRequest = {};

    expectTypeOf(assetRequest).toMatchTypeOf<FetchOrderBookRequest>();
    expectTypeOf(positionRequest).toMatchTypeOf<FetchOrderBookRequest>();
    expectTypeOf(tokenRequest).toMatchTypeOf<FetchOrderBookRequest>();
    expectTypeOf(rawAssetRequest).toMatchTypeOf<FetchOrderBookRequest>();
    void both;
    void neither;
  });

  it('models batch price reads as asset ID keyed decimal records', () => {
    expectTypeOf<Midpoints>().toEqualTypeOf<
      Record<TokenId | PositionId, DecimalString>
    >();
    expectTypeOf<Prices>().toEqualTypeOf<
      Record<TokenId | PositionId, Partial<Record<OrderSide, DecimalString>>>
    >();
    expectTypeOf<Spreads>().toEqualTypeOf<
      Record<TokenId | PositionId, DecimalString>
    >();
  });

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

  it('preserves fetchPrices return type on actions and decorators', () => {
    const actions = {} as DataActions;

    expectTypeOf<ReturnType<typeof fetchPrices>>().toEqualTypeOf<
      Promise<Prices>
    >();
    expectTypeOf<ReturnType<typeof actions.fetchPrices>>().toEqualTypeOf<
      Promise<Prices>
    >();
  });

  it('models last trade absence in action and decorator return types', () => {
    const actions = {} as DataActions;

    expectTypeOf<LastTradePrice>().toMatchTypeOf<{
      price: DecimalString;
      side: OrderSide;
    }>();
    expectTypeOf<Extract<LastTradePrice, null>>().toEqualTypeOf<never>();
    expectTypeOf<ReturnType<typeof fetchLastTradePrice>>().toEqualTypeOf<
      Promise<LastTradePrice | null>
    >();
    expectTypeOf<
      ReturnType<typeof actions.fetchLastTradePrice>
    >().toEqualTypeOf<Promise<LastTradePrice | null>>();
  });
});

import { OrderSide } from '@polymarket/bindings';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  EstimateMarketPriceRequest,
  PrepareLimitOrderRequest,
  PrepareMarketOrderRequest,
} from './index';

describe('public order request types', () => {
  it('accepts assetId and the deprecated tokenId compatibility input', () => {
    const marketAssetRequest: PrepareMarketOrderRequest = {
      amount: 10,
      assetId: '123',
      side: OrderSide.BUY,
    };
    const marketTokenRequest: PrepareMarketOrderRequest = {
      amount: 10,
      side: OrderSide.BUY,
      tokenId: '123',
    };
    const limitAssetRequest: PrepareLimitOrderRequest = {
      assetId: '123',
      price: 0.52,
      side: OrderSide.BUY,
      size: 10,
    };
    const estimateAssetRequest: EstimateMarketPriceRequest = {
      assetId: '123',
      shares: 10,
      side: OrderSide.SELL,
    };

    expectTypeOf(marketAssetRequest).toMatchTypeOf<PrepareMarketOrderRequest>();
    expectTypeOf(marketTokenRequest).toMatchTypeOf<PrepareMarketOrderRequest>();
    expectTypeOf(limitAssetRequest).toMatchTypeOf<PrepareLimitOrderRequest>();
    expectTypeOf(
      estimateAssetRequest,
    ).toMatchTypeOf<EstimateMarketPriceRequest>();
  });

  it('requires exactly one supported asset field', () => {
    // @ts-expect-error Provide exactly one asset identifier.
    const both: PrepareLimitOrderRequest = {
      assetId: '123',
      price: 0.52,
      side: OrderSide.BUY,
      size: 10,
      tokenId: '123',
    };
    // @ts-expect-error An asset identifier is required.
    const neither: PrepareLimitOrderRequest = {
      price: 0.52,
      side: OrderSide.BUY,
      size: 10,
    };
    const positionId: PrepareLimitOrderRequest = {
      // @ts-expect-error positionId is no longer an order request field.
      positionId: '123',
      price: 0.52,
      side: OrderSide.BUY,
      size: 10,
    };

    void both;
    void neither;
    void positionId;
  });
});

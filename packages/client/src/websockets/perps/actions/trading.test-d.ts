import { OrderSide } from '@polymarket/bindings';
import { PerpsTimeInForce } from '@polymarket/bindings/perps';
import { describe, it } from 'vitest';
import type {
  PerpsPlaceFokOrderRequest,
  PerpsPlaceGtcOrderRequest,
  PerpsPlaceIocOrderRequest,
  PlacePerpsOrderRequest,
  PlacePerpsOrderWithTpSlRequest,
  PostPerpsOrdersRequest,
} from './trading';

const baseOrder = {
  instrumentId: 1,
  quantity: '1',
  side: OrderSide.BUY,
} as const;

describe('PlacePerpsOrderRequest', () => {
  it('allows priced GTC orders to be post-only', () => {
    const request: PerpsPlaceGtcOrderRequest = {
      ...baseOrder,
      postOnly: true,
      price: '100',
      timeInForce: PerpsTimeInForce.GTC,
    };
    const unionRequest: PlacePerpsOrderRequest = request;
    void unionRequest;
  });

  it('allows IOC and FOK orders without prices', () => {
    const iocRequest: PerpsPlaceIocOrderRequest = {
      ...baseOrder,
      timeInForce: PerpsTimeInForce.IOC,
    };

    const fokRequest: PerpsPlaceFokOrderRequest = {
      ...baseOrder,
      timeInForce: PerpsTimeInForce.FOK,
    };
    const iocUnionRequest: PlacePerpsOrderRequest = iocRequest;
    const fokUnionRequest: PlacePerpsOrderRequest = fokRequest;
    void iocUnionRequest;
    void fokUnionRequest;
  });

  it('rejects GTC orders without prices', () => {
    // @ts-expect-error GTC orders require a price.
    const request: PlacePerpsOrderRequest = {
      ...baseOrder,
      timeInForce: PerpsTimeInForce.GTC,
    };
    void request;
  });

  it('rejects IOC and FOK orders with postOnly', () => {
    // @ts-expect-error IOC orders do not accept postOnly.
    const postOnlyIocRequest: PlacePerpsOrderRequest = {
      ...baseOrder,
      postOnly: true,
      price: '100',
      timeInForce: PerpsTimeInForce.IOC,
    };

    // @ts-expect-error Explicit false still provides postOnly.
    const explicitPostOnlyIocRequest: PlacePerpsOrderRequest = {
      ...baseOrder,
      postOnly: false,
      price: '100',
      timeInForce: PerpsTimeInForce.IOC,
    };

    // @ts-expect-error FOK orders do not accept postOnly.
    const postOnlyFokRequest: PlacePerpsOrderRequest = {
      ...baseOrder,
      postOnly: true,
      price: '100',
      timeInForce: PerpsTimeInForce.FOK,
    };
    void postOnlyIocRequest;
    void explicitPostOnlyIocRequest;
    void postOnlyFokRequest;
  });

  it('applies the same order constraints to batch requests', () => {
    const request: PostPerpsOrdersRequest = {
      orders: [
        // @ts-expect-error Batch IOC orders do not accept postOnly.
        {
          ...baseOrder,
          postOnly: true,
          price: '100',
          timeInForce: PerpsTimeInForce.IOC,
        },
      ],
    };
    void request;
  });
});

describe('PlacePerpsOrderWithTpSlRequest', () => {
  const order = {
    ...baseOrder,
    price: '100',
    timeInForce: PerpsTimeInForce.GTC,
  } as const;

  it('allows market TP/SL triggers without limit prices', () => {
    const request: PlacePerpsOrderWithTpSlRequest = {
      order,
      stopLoss: {
        market: true,
        triggerPrice: '90',
      },
      takeProfit: {
        market: true,
        triggerPrice: '110',
      },
    };
    void request;
  });

  it('allows limit TP/SL triggers with prices', () => {
    const request: PlacePerpsOrderWithTpSlRequest = {
      order,
      stopLoss: {
        price: '89',
        triggerPrice: '90',
      },
    };
    void request;
  });

  it('rejects triggers without market execution or a limit price', () => {
    const request: PlacePerpsOrderWithTpSlRequest = {
      order,
      // @ts-expect-error Order-scoped TP/SL triggers must be market or priced.
      stopLoss: {
        triggerPrice: '90',
      },
    };
    void request;
  });

  it('rejects market triggers with limit prices', () => {
    const request: PlacePerpsOrderWithTpSlRequest = {
      order,
      takeProfit: {
        market: true,
        // @ts-expect-error Market TP/SL triggers must not include a limit price.
        price: '111',
        triggerPrice: '110',
      },
    };
    void request;
  });

  it('requires at least one TP/SL trigger', () => {
    // @ts-expect-error Expected at least one take-profit or stop-loss trigger.
    const request: PlacePerpsOrderWithTpSlRequest = { order };
    void request;
  });
});

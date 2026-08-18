import { OrderSide } from '@polymarket/bindings';
import { PerpsTimeInForce } from '@polymarket/bindings/perps';
import { describe, it } from 'vitest';
import type { PerpsSession } from '../session';
import type {
  PerpsPlaceFokOrderRequest,
  PerpsPlaceGtcOrderRequest,
  PerpsPlaceIocOrderRequest,
  PlacePerpsOrderRequest,
  PlacePerpsOrderWithTpSlRequest,
  PlacePerpsPositionTpSlRequest,
  PostPerpsOrdersRequest,
} from './trading';

const baseOrder = {
  instrumentId: 1,
  quantity: '1',
  side: OrderSide.BUY,
} as const;

const gtcOrder = {
  ...baseOrder,
  price: '100',
  timeInForce: PerpsTimeInForce.GTC,
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
      reduceOnly: true,
      timeInForce: PerpsTimeInForce.IOC,
    };

    const fokRequest: PerpsPlaceFokOrderRequest = {
      ...baseOrder,
      reduceOnly: true,
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
  it('allows market TP/SL triggers without limit prices', () => {
    const request: PlacePerpsOrderWithTpSlRequest = {
      ...gtcOrder,
      stopLoss: {
        triggerPrice: '90',
      },
      takeProfit: {
        triggerPrice: '110',
      },
    };
    void request;
  });

  it('allows limit TP/SL triggers with limit prices', () => {
    const request: PlacePerpsOrderWithTpSlRequest = {
      ...gtcOrder,
      reduceOnly: true,
      stopLoss: {
        limitPrice: '89',
        triggerPrice: '90',
      },
    };
    void request;
  });

  it('rejects backend trigger execution fields', () => {
    const request: PlacePerpsOrderWithTpSlRequest = {
      ...gtcOrder,
      stopLoss: {
        // @ts-expect-error Market execution is the default when limitPrice is omitted.
        market: true,
        triggerPrice: '90',
      },
      takeProfit: {
        // @ts-expect-error Use limitPrice for limit TP/SL execution.
        price: '109',
        triggerPrice: '110',
      },
    };
    void request;
  });

  it('requires at least one TP/SL trigger', () => {
    // @ts-expect-error Expected at least one take-profit or stop-loss trigger.
    const request: PlacePerpsOrderWithTpSlRequest = { ...gtcOrder };
    void request;
  });
});

describe('PerpsSession.placeOrder', () => {
  const session = undefined as unknown as PerpsSession;

  it('returns a stable order wrapper without TP/SL', async () => {
    const result = await session.placeOrder(gtcOrder);
    result.order.id;
    // @ts-expect-error Plain order placements do not include TP/SL metadata.
    result.tpSl;
  });

  it('adds TP/SL metadata when TP/SL triggers are present', async () => {
    const result = await session.placeOrder({
      ...gtcOrder,
      takeProfit: { triggerPrice: '110' },
    });
    result.order.id;
    result.tpSl.takeProfit?.orderId;
  });
});

describe('PlacePerpsPositionTpSlRequest', () => {
  it('rejects position side', () => {
    const request: PlacePerpsPositionTpSlRequest = {
      instrumentId: 1,
      // @ts-expect-error Position side is inferred from the current position.
      positionSide: 'long',
      stopLoss: { triggerPrice: '90' },
    };
    void request;
  });
});

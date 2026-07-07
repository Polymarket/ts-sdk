import { OrderSide } from '@polymarket/bindings';
import { PerpsTimeInForce } from '@polymarket/bindings/perps';
import { describe, expect, it } from 'vitest';
import { createPerpsOpTypedDataPayload } from '../signing';
import {
  type PerpsTradingTransport,
  postPerpsOrders,
  toPerpsCommandBodyOp,
} from './trading';

const CREATE_ORDER_DATA_HASH =
  '0x817207b7b8b31044a8f27e43c16e24d9fd5e11d3f106feb962f104f3ef28d52a';

describe('Perps trading actions', () => {
  describe('createPerpsOpTypedDataPayload', () => {
    it('signs entry orders with backend-compatible createOrders bytes', async () => {
      const transport: PerpsTradingTransport = {
        async sendSignedWsCommand(request) {
          const payload = createPerpsOpTypedDataPayload({
            chainId: 31_337,
            op: request.op,
            salt: 1,
            timestamp: 1_739_491_200_000,
          });

          expect(payload.message).toMatchObject({
            data: CREATE_ORDER_DATA_HASH,
            salt: 1n,
            ts: 1_739_491_200_000n,
          });
          expect(toPerpsCommandBodyOp(request.op)).toEqual({
            args: [
              {
                buy: true,
                iid: 1,
                p: '100.50',
                po: false,
                qty: '10',
                tif: 'gtc',
              },
            ],
            type: 'createOrders',
          });

          return request.responseSchema.parse([{ oid: 123, status: 'ok' }]);
        },
      };

      await expect(
        postPerpsOrders(transport, {
          orders: [
            {
              instrumentId: 1,
              postOnly: false,
              price: '100.50',
              quantity: '10',
              side: OrderSide.BUY,
              timeInForce: PerpsTimeInForce.GTC,
            },
          ],
        }),
      ).resolves.toMatchObject([{ orderId: 123, status: 'ok' }]);
    });

    it('serializes reduce-only entry orders', async () => {
      const transport: PerpsTradingTransport = {
        async sendSignedWsCommand(request) {
          expect(toPerpsCommandBodyOp(request.op)).toEqual({
            args: [
              {
                buy: false,
                iid: 1,
                p: '100.50',
                po: false,
                qty: '10',
                ro: true,
                tif: 'ioc',
              },
            ],
            type: 'createOrders',
          });

          return request.responseSchema.parse([{ oid: 123, status: 'ok' }]);
        },
      };

      await expect(
        postPerpsOrders(transport, {
          orders: [
            {
              instrumentId: 1,
              price: '100.50',
              quantity: '10',
              reduceOnly: true,
              side: OrderSide.SELL,
              timeInForce: PerpsTimeInForce.IOC,
            },
          ],
        }),
      ).resolves.toMatchObject([{ orderId: 123, status: 'ok' }]);
    });
  });
});

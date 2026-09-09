import { OrderSide } from '@polymarket/bindings';
import { PerpsTimeInForce } from '@polymarket/bindings/perps';
import { describe, expect, it } from 'vitest';
import { UserInputError } from '../../../errors';
import { createPerpsOpTypedDataPayload } from '../signing';
import {
  type PerpsCommandExecutor,
  postPerpsOrders,
  toPerpsCommandBodyOp,
  updatePerpsLeverages,
  updatePerpsMargin,
} from './trading';

const CREATE_ORDER_DATA_HASH =
  '0x817207b7b8b31044a8f27e43c16e24d9fd5e11d3f106feb962f104f3ef28d52a';
const UPDATE_MARGIN_DATA_HASH =
  '0xf61d7d83b4367ce136bf66cfee6a5d41303a8b2d8724f5458f9812c46f5e55b3';
const UPDATE_LEVERAGES_DATA_HASH =
  '0xdcdd40c029abb105bb4911882321a203c294e9c4da73a32c5957afdbfb34cfdc';

describe('Perps trading actions', () => {
  describe('createPerpsOpTypedDataPayload', () => {
    it('signs entry orders with backend-compatible createOrders bytes', async () => {
      const client: PerpsCommandExecutor = {
        async executeCommand(request, responseSchema) {
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

          return responseSchema.parse([{ oid: 123, status: 'ok' }]);
        },
      };

      await expect(
        postPerpsOrders(client, {
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
      const client: PerpsCommandExecutor = {
        async executeCommand(request, responseSchema) {
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

          return responseSchema.parse([{ oid: 123, status: 'ok' }]);
        },
      };

      await expect(
        postPerpsOrders(client, {
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

    it('signs isolated margin adjustments with backend-compatible bytes', async () => {
      const client: PerpsCommandExecutor = {
        async executeCommand(request, responseSchema) {
          const payload = createPerpsOpTypedDataPayload({
            chainId: 31_337,
            op: request.op,
            salt: 1,
            timestamp: 1_739_491_200_000,
          });

          expect(payload.message).toMatchObject({
            data: UPDATE_MARGIN_DATA_HASH,
            salt: 1n,
            ts: 1_739_491_200_000n,
          });
          expect(toPerpsCommandBodyOp(request.op)).toEqual({
            args: {
              amt: '-1234567890.123456789012345678',
              iid: 7,
            },
            type: 'updateMargin',
          });

          return responseSchema.parse({ status: 'ok' });
        },
      };

      await expect(
        updatePerpsMargin(client, {
          amount: '-1234567890.123456789012345678',
          instrumentId: 7,
        }),
      ).resolves.toBeUndefined();
    });

    it('signs ordered leverage batches with backend-compatible bytes', async () => {
      const client: PerpsCommandExecutor = {
        async executeCommand(request, responseSchema) {
          const payload = createPerpsOpTypedDataPayload({
            chainId: 31_337,
            op: request.op,
            salt: 1,
            timestamp: 1_739_491_200_000,
          });

          expect(payload.message).toMatchObject({
            data: UPDATE_LEVERAGES_DATA_HASH,
            salt: 1n,
            ts: 1_739_491_200_000n,
          });
          expect(request.op).toEqual([
            'updateLeverages',
            [
              [1, 5, false],
              [2, 10, true],
            ],
          ]);
          expect(toPerpsCommandBodyOp(request.op)).toEqual({
            args: [
              { cross: false, iid: 1, lev: 5 },
              { cross: true, iid: 2, lev: 10 },
            ],
            type: 'updateLeverages',
          });

          return responseSchema.parse([
            {
              status: 'ok',
              instrument_id: 1,
              leverage: 5,
              cross: false,
            },
            {
              status: 'err',
              instrument_id: 2,
              error: 'internal_error',
            },
          ]);
        },
      };

      await expect(
        updatePerpsLeverages(client, {
          updates: [
            { crossMargin: false, instrumentId: 1, leverage: 5 },
            { crossMargin: true, instrumentId: 2, leverage: 10 },
          ],
        }),
      ).resolves.toEqual([
        {
          status: 'ok',
          instrumentId: 1,
          leverage: 5,
          crossMargin: false,
        },
        { status: 'err', instrumentId: 2, error: 'internal_error' },
      ]);
    });
  });

  describe('updatePerpsLeverages', () => {
    it.each([1, 100])('accepts the %i-item boundary', async (size) => {
      let executions = 0;
      const client: PerpsCommandExecutor = {
        async executeCommand(request, responseSchema) {
          executions++;
          expect(request.op[1]).toHaveLength(size);
          return responseSchema.parse(
            Array.from({ length: size }, (_, instrumentId) => ({
              status: 'ok',
              instrument_id: instrumentId,
              leverage: 1,
              cross: true,
            })),
          );
        },
      };

      await expect(
        updatePerpsLeverages(client, {
          updates: Array.from({ length: size }, (_, instrumentId) => ({
            crossMargin: true,
            instrumentId,
            leverage: 1,
          })),
        }),
      ).resolves.toHaveLength(size);
      expect(executions).toBe(1);
    });

    it.each([
      ['an empty batch', []],
      [
        'more than 100 updates',
        Array.from({ length: 101 }, (_, instrumentId) => ({
          crossMargin: true,
          instrumentId,
          leverage: 1,
        })),
      ],
      [
        'duplicate instrument ids',
        [
          { crossMargin: true, instrumentId: 1, leverage: 1 },
          { crossMargin: false, instrumentId: 1, leverage: 2 },
        ],
      ],
      [
        'an instrument id above u32',
        [
          {
            crossMargin: true,
            instrumentId: 4_294_967_296,
            leverage: 1,
          },
        ],
      ],
      [
        'leverage above u32',
        [
          {
            crossMargin: true,
            instrumentId: 1,
            leverage: 4_294_967_296,
          },
        ],
      ],
    ])('rejects %s before executing the command', async (_, updates) => {
      let executions = 0;
      const client: PerpsCommandExecutor = {
        async executeCommand() {
          executions++;
          throw new Error('The executor should not be called.');
        },
      };

      await expect(
        updatePerpsLeverages(client, { updates }),
      ).rejects.toBeInstanceOf(UserInputError);
      expect(executions).toBe(0);
    });
  });
});

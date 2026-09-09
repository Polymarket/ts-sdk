import { OrderSide } from '@polymarket/bindings';
import {
  PerpsKnownCancelOrderErrorCode,
  PerpsTimeInForce,
} from '@polymarket/bindings/perps';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OperationAbortedError,
  RequestRejectedError,
  UnexpectedResponseError,
} from '../../../errors';
import { createPerpsOpTypedDataPayload } from '../signing';
import {
  cancelPerpsOrders,
  type PerpsCommandExecutor,
  type PerpsCommandRequest,
  postPerpsOrders,
  toPerpsCommandBodyOp,
  updatePerpsMargin,
} from './trading';

const CREATE_ORDER_DATA_HASH =
  '0x817207b7b8b31044a8f27e43c16e24d9fd5e11d3f106feb962f104f3ef28d52a';
const UPDATE_MARGIN_DATA_HASH =
  '0xf61d7d83b4367ce136bf66cfee6a5d41303a8b2d8724f5458f9812c46f5e55b3';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
  });

  describe('cancelPerpsOrders', () => {
    it('retries only in-flight orders and preserves result order', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { client, requests } = cancelExecutor([
        [
          { error: 'order_in_flight', oid: 1, status: 'err' },
          { error: 'unknown_error_code_18', oid: 2, status: 'err' },
          { oid: 3, status: 'ok' },
        ],
        [{ oid: 1, status: 'ok' }],
      ]);

      await expect(
        cancelPerpsOrders(client, {
          orderIds: [1, 2, 3],
          retry: { maxAttempts: 2, maxElapsedMs: 1_000 },
        }),
      ).resolves.toEqual([
        { clientOrderId: undefined, orderId: 1, status: 'ok' },
        {
          clientOrderId: undefined,
          error: 'unknown_error_code_18',
          orderId: 2,
          status: 'err',
        },
        { clientOrderId: undefined, orderId: 3, status: 'ok' },
      ]);
      expect(requests.map((request) => request.op)).toEqual([
        ['cancelOrders', [1, 2, 3]],
        ['cancelOrders', [1]],
      ]);
    });

    it.each([
      PerpsKnownCancelOrderErrorCode.OrderUnknown,
      PerpsKnownCancelOrderErrorCode.OrderNotInOrderbook,
      PerpsKnownCancelOrderErrorCode.OrderNotPendingEngine,
      PerpsKnownCancelOrderErrorCode.OrderNotFound,
    ])('does not retry the terminal %s result', async (error) => {
      const { client, requests } = cancelExecutor([
        [{ error, oid: 1, status: 'err' }],
      ]);

      const result = await cancelPerpsOrders(client, {
        orderIds: [1],
        retry: { maxAttempts: 4, maxElapsedMs: 2_000 },
      });

      expect(result[0]).toMatchObject({ error, status: 'err' });
      expect(requests).toHaveLength(1);
    });

    it('supports disabling automatic retries', async () => {
      const { client, requests } = cancelExecutor([
        [{ error: 'order_in_flight', oid: 1, status: 'err' }],
      ]);

      await expect(
        cancelPerpsOrders(client, { orderIds: [1], retry: false }),
      ).resolves.toMatchObject([
        {
          error: PerpsKnownCancelOrderErrorCode.OrderInFlight,
          status: 'err',
        },
      ]);
      expect(requests).toHaveLength(1);
    });

    it('returns the last in-flight rejection after max attempts', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { client, requests } = cancelExecutor([
        [{ error: 'order_in_flight', oid: 1, status: 'err' }],
        [{ error: 'order_in_flight', oid: 1, status: 'err' }],
        [{ error: 'order_in_flight', oid: 1, status: 'err' }],
      ]);

      const result = await cancelPerpsOrders(client, {
        orderIds: [1],
        retry: { maxAttempts: 3, maxElapsedMs: 2_000 },
      });

      expect(result).toMatchObject([
        {
          error: PerpsKnownCancelOrderErrorCode.OrderInFlight,
          orderId: 1,
          status: 'err',
        },
      ]);
      expect(requests).toHaveLength(3);
    });

    it('uses bounded exponential backoff with full jitter', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const rejection = {
        error: 'order_in_flight',
        oid: 1,
        status: 'err',
      };
      const { client, requests } = cancelExecutor([
        [rejection],
        [rejection],
        [rejection],
        [rejection],
      ]);

      const result = cancelPerpsOrders(client, {
        orderIds: [1],
        retry: { maxAttempts: 4, maxElapsedMs: 10_000 },
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(49);
      expect(requests).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(99);
      expect(requests).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(requests).toHaveLength(3);

      await vi.advanceTimersByTimeAsync(200);
      await expect(result).resolves.toMatchObject([
        {
          error: PerpsKnownCancelOrderErrorCode.OrderInFlight,
          status: 'err',
        },
      ]);
      expect(requests).toHaveLength(4);
    });

    it('does not start a retry outside the elapsed-time budget', async () => {
      vi.useFakeTimers({ now: 1_000 });
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const { client, requests } = cancelExecutor([
        [{ error: 'order_in_flight', oid: 1, status: 'err' }],
      ]);

      await expect(
        cancelPerpsOrders(client, {
          orderIds: [1],
          retry: { maxAttempts: 4, maxElapsedMs: 50 },
        }),
      ).resolves.toMatchObject([
        {
          error: PerpsKnownCancelOrderErrorCode.OrderInFlight,
          status: 'err',
        },
      ]);
      expect(requests).toHaveLength(1);
    });

    it('returns collected results when retry backoff is aborted', async () => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const controller = new AbortController();
      const { client, requests } = cancelExecutor([
        [
          { oid: 1, status: 'ok' },
          { error: 'order_in_flight', oid: 2, status: 'err' },
        ],
      ]);

      const result = cancelPerpsOrders(client, {
        orderIds: [1, 2],
        retry: { maxAttempts: 4, maxElapsedMs: 2_000 },
        signal: controller.signal,
      });
      await vi.advanceTimersByTimeAsync(0);
      controller.abort(new Error('stop retrying'));

      await expect(result).resolves.toEqual([
        { clientOrderId: undefined, orderId: 1, status: 'ok' },
        {
          clientOrderId: undefined,
          error: PerpsKnownCancelOrderErrorCode.OrderInFlight,
          orderId: 2,
          status: 'err',
        },
      ]);
      expect(requests).toHaveLength(1);
    });

    it('does not send a command when the signal is already aborted', async () => {
      const controller = new AbortController();
      const reason = new Error('do not cancel');
      controller.abort(reason);
      const { client, requests } = cancelExecutor([]);

      await expect(
        cancelPerpsOrders(client, {
          orderIds: [1],
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({
        cause: reason,
        name: OperationAbortedError.name,
      });
      expect(requests).toHaveLength(0);
    });

    it.each([
      'invalid_request',
      'ip_rate_limited',
      'action_rate_limited',
      'internal_error',
      'message_rate_limited',
    ])('throws the request-level %s rejection for one order', async (error) => {
      const { client, requests } = cancelExecutor([[{ error, status: 'err' }]]);

      await expect(
        cancelPerpsOrders(client, { orderIds: [1], retry: false }),
      ).rejects.toMatchObject({
        message: error,
        name: RequestRejectedError.name,
      });
      expect(requests).toHaveLength(1);
    });

    it('keeps identified internal errors after narrowing the retry batch', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const { client, requests } = cancelExecutor([
        [
          { oid: 1, status: 'ok' },
          { error: 'order_in_flight', oid: 2, status: 'err' },
        ],
        [{ error: 'internal_error', oid: 2, status: 'err' }],
      ]);

      await expect(
        cancelPerpsOrders(client, {
          orderIds: [1, 2],
          retry: { maxAttempts: 2, maxElapsedMs: 1_000 },
        }),
      ).resolves.toEqual([
        { clientOrderId: undefined, orderId: 1, status: 'ok' },
        {
          clientOrderId: undefined,
          error: 'internal_error',
          orderId: 2,
          status: 'err',
        },
      ]);
      expect(requests.map((request) => request.op)).toEqual([
        ['cancelOrders', [1, 2]],
        ['cancelOrders', [2]],
      ]);
    });

    it('does not map a request-level rejection to the first batch item', async () => {
      const { client } = cancelExecutor([
        [{ error: 'invalid_request', status: 'err' }],
      ]);

      await expect(
        cancelPerpsOrders(client, { orderIds: [1, 2], retry: false }),
      ).rejects.toMatchObject({
        message: 'invalid_request',
        name: RequestRejectedError.name,
      });
    });

    it('rejects responses with missing batch results', async () => {
      const { client } = cancelExecutor([[{ oid: 1, status: 'ok' }]]);

      await expect(
        cancelPerpsOrders(client, { orderIds: [1, 2], retry: false }),
      ).rejects.toBeInstanceOf(UnexpectedResponseError);
    });
  });
});

function cancelExecutor(responses: unknown[][]): {
  client: PerpsCommandExecutor;
  requests: PerpsCommandRequest[];
} {
  const requests: PerpsCommandRequest[] = [];
  let responseIndex = 0;
  return {
    client: {
      async executeCommand(request, responseSchema) {
        requests.push(request);
        const response = responses[responseIndex++];
        if (response === undefined) {
          throw new Error('Unexpected Perps cancel attempt.');
        }
        return responseSchema.parse(response);
      },
    },
    requests,
  };
}

import { OrderSide } from '@polymarket/bindings';
import {
  PerpsCancelOrderResultSchema,
  PerpsKnownCancelOrderErrorCode,
  PerpsTimeInForce,
} from '@polymarket/bindings/perps';
import { TypedData } from 'ox';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OperationAbortedError,
  PerpsCancelRetryError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../../errors';
import { createPerpsOpTypedDataPayload } from '../signing';
import {
  cancelPerpsOrder,
  cancelPerpsOrders,
  type PerpsCommandExecutor,
  type PerpsCommandRequest,
  type PerpsEventCommandExecutor,
  placePerpsOrder,
  placePerpsPositionTpSl,
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
  describe('builder attribution', () => {
    const builder = {
      address: '0x1111111111111111111111111111111111111111',
      feeRate: '0.0005000000000000000000000000',
    };
    const order = {
      instrumentId: 1,
      quantity: '10',
      side: OrderSide.BUY,
      timeInForce: PerpsTimeInForce.IOC,
    } as const;

    it('preserves exact builder terms in signed tuples and JSON', async () => {
      const executor: PerpsCommandExecutor = {
        async executeCommand(request, schema) {
          expect(request.op).toEqual([
            'createOrders',
            [
              [
                1,
                true,
                undefined,
                '10',
                'ioc',
                false,
                undefined,
                undefined,
                undefined,
                undefined,
                [builder.address, builder.feeRate],
              ],
            ],
          ]);
          expect(toPerpsCommandBodyOp(request.op)).toEqual({
            type: 'createOrders',
            args: [
              {
                iid: 1,
                buy: true,
                qty: '10',
                tif: 'ioc',
                po: false,
                builder: {
                  address: builder.address,
                  fee_rate: builder.feeRate,
                },
              },
            ],
          });
          expect(
            createPerpsOpTypedDataPayload({
              chainId: 31337,
              op: request.op,
              salt: 1,
              timestamp: 1739491200000,
            }).message.data,
          ).toEqual(
            createPerpsOpTypedDataPayload({
              chainId: 31337,
              op: [
                'createOrders',
                [
                  [
                    1,
                    true,
                    '10',
                    'ioc',
                    false,
                    [builder.address, builder.feeRate],
                  ],
                ],
              ],
              salt: 1,
              timestamp: 1739491200000,
            }).message.data,
          );
          return schema.parse([{ oid: 123, status: 'ok' }]);
        },
      };
      await postPerpsOrders(executor, { orders: [{ ...order, builder }] });
    });

    it('omits the explicit null opt-out from signed and JSON orders', async () => {
      const executor: PerpsCommandExecutor = {
        async executeCommand(request, schema) {
          expect(toPerpsCommandBodyOp(request.op)).toEqual({
            type: 'createOrders',
            args: [{ iid: 1, buy: true, qty: '10', tif: 'ioc', po: false }],
          });
          expect(
            createPerpsOpTypedDataPayload({
              chainId: 31337,
              op: request.op,
              salt: 1,
              timestamp: 1739491200000,
            }).message.data,
          ).toEqual(
            createPerpsOpTypedDataPayload({
              chainId: 31337,
              op: ['createOrders', [[1, true, '10', 'ioc', false]]],
              salt: 1,
              timestamp: 1739491200000,
            }).message.data,
          );
          return schema.parse([{ oid: 123, status: 'ok' }]);
        },
      };
      await postPerpsOrders(executor, {
        orders: [{ ...order, builder: null }],
      });
    });

    it.each([
      '-0.0001',
      '0.0010000000000000000000000001',
      '0.00000000000000000000000000001',
      '0.00100000000000000000000000000',
      'NaN',
      '5%',
      '1e-4',
    ])('rejects invalid rate %s before submitting any batch orders', async (feeRate) => {
      const executeCommand = vi.fn(async () => {
        throw new Error('Invalid orders must not be submitted');
      });
      await expect(
        postPerpsOrders(
          { executeCommand },
          {
            orders: [order, { ...order, builder: { ...builder, feeRate } }],
          },
        ),
      ).rejects.toBeInstanceOf(UserInputError);
      expect(executeCommand).not.toHaveBeenCalled();
    });

    it('applies the same terms to the entry and every generated TP/SL leg', async () => {
      const inspected = new Error('Inspected signing boundary');
      const executor: PerpsEventCommandExecutor = {
        async executeCommand() {
          throw new Error('Unexpected execution');
        },
        async executeCommandWithEvent(request) {
          expect(toPerpsCommandBodyOp(request.op)).toMatchObject({
            args: [
              {
                builder: {
                  address: builder.address,
                  fee_rate: builder.feeRate,
                },
              },
              {
                builder: {
                  address: builder.address,
                  fee_rate: builder.feeRate,
                },
              },
              {
                builder: {
                  address: builder.address,
                  fee_rate: builder.feeRate,
                },
              },
            ],
            grp: 'order',
          });
          throw inspected;
        },
      };
      await expect(
        placePerpsOrder(executor, {
          ...order,
          builder,
          takeProfit: { triggerPrice: '110' },
          stopLoss: { triggerPrice: '90' },
        }),
      ).rejects.toBe(inspected);
    });

    it('rejects invalid position exit terms before reading the position', async () => {
      const fetchPortfolio = vi.fn(async () => {
        throw new Error('Invalid builder terms must fail before the read');
      });
      const executeCommand = vi.fn(async () => {
        throw new Error('Invalid builder terms must not be submitted');
      });
      await expect(
        placePerpsPositionTpSl(
          { executeCommand, fetchPortfolio },
          {
            instrumentId: 1,
            builder: { ...builder, feeRate: '0.0010000000000000000000000001' },
            takeProfit: { triggerPrice: '110' },
          },
        ),
      ).rejects.toBeInstanceOf(UserInputError);
      expect(fetchPortfolio).not.toHaveBeenCalled();
      expect(executeCommand).not.toHaveBeenCalled();
    });
  });
  describe('createPerpsOpTypedDataPayload', () => {
    it('matches backend approval bytes and binds the version and maximum rate', () => {
      function approvalHash(maxFeeRate: string, approvalVersion: number) {
        return createPerpsOpTypedDataPayload({
          chainId: 31_337,
          op: [
            'approveBuilder',
            [
              '0x0000000000000000000000000000000000001234',
              maxFeeRate,
              approvalVersion,
            ],
          ],
          salt: 1,
          timestamp: 1_739_491_200_000,
        }).message.data;
      }
      // This serializer fixture comes from the backend; its above-cap rate
      // deliberately bypasses user-input validation to pin the signed bytes.
      const hash = approvalHash('0.002', 1);
      expect(hash).toBe(
        '0x3f1cc1f398302e8b00fa75c4f5d2ca0e8464014785a365873fd41582b7280a9b',
      );
      expect(approvalHash('0.002', 2)).not.toBe(hash);
      expect(approvalHash('0', 1)).not.toBe(hash);
    });
    it('matches the backend nested builder signing fixture', () => {
      // This backend serializer fixture intentionally exceeds the admission
      // cap; it tests signing independently of SDK user-input validation.
      const payload = createPerpsOpTypedDataPayload({
        chainId: 31_337,
        op: [
          'createOrders',
          [
            [
              1,
              true,
              '100.50',
              '10',
              'gtc',
              false,
              undefined,
              undefined,
              undefined,
              undefined,
              ['0x0000000000000000000000000000000000001234', '0.002'],
            ],
          ],
        ],
        salt: 1,
        timestamp: 1_739_491_200_000,
      });
      expect(payload.message.data).toBe(
        '0xb712d9d3d4ba4c722daf48c55e3b0c5450abb64477c7c6765fa5c09e1d4805c2',
      );
    });
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
          const { EIP712Domain, ...types } = payload.types;
          expect(EIP712Domain).toEqual([
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
          ]);
          expect(TypedData.getSignPayload(payload)).toBe(
            TypedData.getSignPayload({
              ...payload,
              types,
            }),
          );
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
      {
        failure: 'request-level rejection',
        response: [{ error: 'invalid_request', status: 'err' }],
        cause: expect.objectContaining({
          name: RequestRejectedError.name,
          message: 'invalid_request',
          status: 200,
        }),
      },
      {
        failure: 'transport failure',
        response: { error: new TransportError('Connection lost.') },
        cause: expect.any(TransportError),
      },
      {
        failure: 'missing result',
        response: [{ oid: 22, status: 'ok' }],
        cause: expect.any(UnexpectedResponseError),
      },
      {
        failure: 'extra result',
        response: [
          { oid: 22, status: 'ok' },
          { oid: 44, status: 'ok' },
          { oid: 55, status: 'ok' },
        ],
        cause: expect.any(UnexpectedResponseError),
      },
    ])('preserves collected results after a later $failure', async ({
      response,
      cause,
    }) => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const firstResults = [
        { oid: 11, status: 'ok' },
        { error: 'order_in_flight', oid: 22, status: 'err' },
        { error: 'unknown_error_code_18', oid: 33, status: 'err' },
        { error: 'order_in_flight', oid: 44, status: 'err' },
      ];
      const { client, requests } = cancelExecutor([firstResults, response]);

      const error = await cancelPerpsOrders(client, {
        orderIds: [11, 22, 33, 44],
      }).catch((error: unknown) => error);

      expect(error).toBeInstanceOf(PerpsCancelRetryError);
      expect(error).toMatchObject({
        cause,
        pendingIndexes: [1, 3],
        results: firstResults.map((result) =>
          PerpsCancelOrderResultSchema.parse(result),
        ),
      });
      if (!Array.isArray(response)) {
        if (!(error instanceof PerpsCancelRetryError)) throw error;
        expect(error.cause).toBe(response.error);
      }
      expect(requests.map((request) => request.op)).toEqual([
        ['cancelOrders', [11, 22, 33, 44]],
        ['cancelOrders', [22, 44]],
      ]);
    });

    it('keeps second-attempt updates when the third client-ID attempt fails', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const firstId = 'a'.repeat(32);
      const secondId = 'b'.repeat(32);
      const thirdId = 'c'.repeat(32);
      const fourthId = 'd'.repeat(32);
      const firstResults = [
        { coid: firstId, status: 'ok' },
        { error: 'order_in_flight', coid: secondId, status: 'err' },
        { error: 'order_in_flight', coid: thirdId, status: 'err' },
        { error: 'order_in_flight', coid: fourthId, status: 'err' },
      ];
      const secondResults = [
        { coid: secondId, status: 'ok' },
        { error: 'unknown_error_code_18', coid: thirdId, status: 'err' },
        { error: 'order_in_flight', coid: fourthId, status: 'err' },
      ];
      const cause = new TransportError('Connection lost.');
      const { client, requests } = cancelExecutor([
        firstResults,
        secondResults,
        { error: cause },
      ]);

      const error = await cancelPerpsOrders(client, {
        clientOrderIds: [firstId, secondId, thirdId, fourthId],
      }).catch((error: unknown) => error);

      expect(error).toBeInstanceOf(PerpsCancelRetryError);
      if (!(error instanceof PerpsCancelRetryError)) throw error;
      expect(error.cause).toBe(cause);
      expect(error.pendingIndexes).toEqual([3]);
      expect(error.results).toEqual(
        [firstResults[0], ...secondResults].map((result) =>
          PerpsCancelOrderResultSchema.parse(result),
        ),
      );
      expect(requests.map((request) => request.op)).toEqual([
        ['cancelOrdersCOID', [firstId, secondId, thirdId, fourthId]],
        ['cancelOrdersCOID', [secondId, thirdId, fourthId]],
        ['cancelOrdersCOID', [fourthId]],
      ]);
    });

    it.each([
      {
        request: { orderId: 7 },
        response: { oid: 7, status: 'err', error: 'order_in_flight' },
      },
      {
        request: { clientOrderId: 'a'.repeat(32) },
        response: {
          coid: 'a'.repeat(32),
          status: 'err',
          error: 'order_in_flight',
        },
      },
    ])('preserves retry failure details through the single-order wrapper for $request', async ({
      request,
      response,
    }) => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const cause = { message: 'Non-Error executor failure.' };
      const { client, requests } = cancelExecutor([
        [response],
        { error: cause },
      ]);

      const error = await cancelPerpsOrder(client, request).catch(
        (error: unknown) => error,
      );

      expect(error).toBeInstanceOf(PerpsCancelRetryError);
      if (!(error instanceof PerpsCancelRetryError)) throw error;
      expect(error.cause).toBe(cause);
      expect(error.pendingIndexes).toEqual([0]);
      expect(error.results).toEqual([
        PerpsCancelOrderResultSchema.parse(response),
      ]);
      expect(requests).toHaveLength(2);
    });

    it.each([
      new TransportError('Connection lost.'),
      { message: 'Executor failure.' },
    ])('propagates a first-attempt throwable unchanged', async (cause) => {
      const { client, requests } = cancelExecutor([{ error: cause }]);

      await expect(cancelPerpsOrders(client, { orderIds: [1] })).rejects.toBe(
        cause,
      );
      expect(requests).toHaveLength(1);
    });

    it('snapshots the retry error result and pending-index arrays', () => {
      const results = [
        PerpsCancelOrderResultSchema.parse({
          error: 'order_in_flight',
          oid: 1,
          status: 'err',
        }),
      ];
      const pendingIndexes = [0];
      const error = new PerpsCancelRetryError('Retry failed.', {
        results,
        pendingIndexes,
      });

      results.length = 0;
      pendingIndexes[0] = 2;

      expect(error.results).toEqual([
        {
          clientOrderId: undefined,
          error: 'order_in_flight',
          orderId: 1,
          status: 'err',
        },
      ]);
      expect(error.pendingIndexes).toEqual([0]);
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

    it('does not retry when expiresAt cuts the elapsed-time budget short', async () => {
      vi.useFakeTimers({ now: 1_000 });
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const { client, requests } = cancelExecutor([
        [{ error: 'order_in_flight', oid: 1, status: 'err' }],
      ]);

      await expect(
        cancelPerpsOrders(client, {
          orderIds: [1],
          expiresAt: 1_040,
          retry: { maxAttempts: 4, maxElapsedMs: 2_000 },
        }),
      ).resolves.toMatchObject([
        { error: 'order_in_flight', orderId: 1, status: 'err' },
      ]);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.expiresAt).toBe(1_040);
    });

    it('returns received results when aborted during the first attempt', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const controller = new AbortController();
      let completeAttempt: () => void = () => {
        throw new Error('Expected the first attempt to be pending.');
      };
      const firstAttempt = new Promise<void>((resolve) => {
        completeAttempt = resolve;
      });
      const requests: PerpsCommandRequest[] = [];
      const client: PerpsCommandExecutor = {
        async executeCommand(request, responseSchema) {
          requests.push(request);
          await firstAttempt;
          return responseSchema.parse([
            { oid: 1, status: 'ok' },
            { error: 'order_in_flight', oid: 2, status: 'err' },
          ]);
        },
      };

      const result = cancelPerpsOrders(client, {
        orderIds: [1, 2],
        signal: controller.signal,
      });
      expect(requests).toHaveLength(1);
      controller.abort(new Error('Stop retrying.'));
      completeAttempt();

      await expect(result).resolves.toMatchObject([
        { orderId: 1, status: 'ok' },
        { error: 'order_in_flight', orderId: 2, status: 'err' },
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

function cancelExecutor(responses: Array<unknown[] | { error: unknown }>): {
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
        if (!Array.isArray(response)) throw response.error;
        return responseSchema.parse(response);
      },
    },
    requests,
  };
}

import { OrderSide, toPaginationCursor } from '@polymarket/bindings';
import {
  type PerpsCredentials,
  PerpsPnlInterval,
  PerpsSortDirection,
  PerpsTimeInForce,
} from '@polymarket/bindings/perps';
import { expectEvmAddress, expectPrivateKey } from '@polymarket/types';
import { HttpResponse, http, ws } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { production } from '../../environments';
import {
  AutoCancelDailyLimitError,
  RequestRejectedError,
  TimeoutError,
  TransportError,
  UserInputError,
} from '../../errors';
import {
  captureConnection,
  expectDropsUnknownFrame,
  waitForNextEvent,
} from '../testing';
import { PerpsSession } from './session';

const perps = ws.link(production.perps.ws);
const server = setupServer();

/**
 * Bounds `for await` pagination loops so a pager that never reports the end of
 * the collection fails the surrounding assertion instead of spinning forever.
 */
const MAX_EXPECTED_PAGES = 3;

const credentials = {
  expiresAt: Date.now() + 30 * 60_000,
  privateKey: expectPrivateKey(
    '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  ),
  proxy: expectEvmAddress('0x0000000000000000000000000000000000000001'),
  secret: 'secret',
} satisfies PerpsCredentials;

describe('PerpsSession', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  afterEach(() => {
    server.resetHandlers();
    vi.useRealTimers();
  });

  afterAll(() => {
    server.close();
  });

  describe('successful session', () => {
    let frames: unknown[];

    beforeEach(() => {
      frames = mockSuccessfulSession();
    });

    it('authenticates and subscribes to session channels', async () => {
      const session = createSession();

      await session.connect();

      expect(frames).toEqual([
        {
          id: 1,
          op: {
            args: {
              proxy: credentials.proxy,
              secret: credentials.secret,
            },
            type: 'auth',
          },
          req: 'post',
        },
        {
          id: 2,
          req: 'sub',
          chs: [
            'balances',
            'portfolio',
            'orders',
            'fills',
            'funding',
            'deposits',
            'withdrawals',
            'notifications',
            'tpsl',
          ],
        },
      ]);

      await session.close();
    });

    it('emits resync on sequence gaps', async () => {
      const connection = captureConnection(server, perps);
      const session = createSession();

      await session.connect();

      const firstEvent = waitForNextEvent(session);
      await connection.send(balanceUpdate({ balance: '1', sequence: 1 }));
      await expect(firstEvent).resolves.toMatchObject({
        done: false,
        value: {
          channel: 'balances',
          payload: { asset: 'USDC', balance: '1', value: '1' },
          sequence: 1,
          type: 'balance',
        },
      });

      const nextEvent = waitForNextEvent(session);
      await connection.send(balanceUpdate({ balance: '2', sequence: 3 }));

      await expect(nextEvent).resolves.toMatchObject({
        done: false,
        value: {
          channel: 'balances',
          previousSequence: 1,
          reason: 'sequence_gap',
          sequence: 3,
          type: 'resync',
        },
      });
      await expect(waitForNextEvent(session)).resolves.toMatchObject({
        done: false,
        value: {
          channel: 'balances',
          payload: { asset: 'USDC', balance: '2', value: '2' },
          sequence: 3,
          type: 'balance',
        },
      });

      await session.close();
    });

    it('drops unknown frames without closing the session', async () => {
      await expectDropsUnknownFrame({
        expectedEvent: { channel: 'balances', type: 'balance' },
        link: perps,
        server,
        subscribe: async () => {
          const session = new PerpsSession({
            chainId: production.chainId,
            credentials,
            onClose: () => undefined,
            restUrl: production.perps.rest,
            wsUrl: production.perps.ws,
          });
          await session.connect();
          return { close: () => session.close(), events: session };
        },
        unknownFrame: { ch: 'future_channel', data: { hello: 'world' } },
        validFrame: balanceUpdate({ balance: '1', sequence: 1 }),
      });
    });

    it('emits one event for a batched fill frame', async () => {
      const connection = captureConnection(server, perps);
      const session = createSession();

      await session.connect();

      await connection.send(fillsUpdate({ sequence: 1, tradeIds: [1, 2] }));

      await expect(waitForNextEvent(session)).resolves.toMatchObject({
        done: false,
        value: {
          channel: 'fills',
          payload: [
            { instrumentId: 1, side: 'long', tradeId: 1 },
            { instrumentId: 1, side: 'long', tradeId: 2 },
          ],
          sequence: 1,
          type: 'fill',
        },
      });

      await session.close();
    });

    it('emits a funding event with the funding payment id', async () => {
      const connection = captureConnection(server, perps);
      const session = createSession();

      await session.connect();

      await connection.send(fundingUpdate({ id: 3_055_723_280_187_747 }));

      await expect(waitForNextEvent(session)).resolves.toMatchObject({
        done: false,
        value: {
          channel: 'funding',
          payload: {
            funding: '0.5',
            id: 3_055_723_280_187_747,
            instrumentId: 1,
          },
          sequence: 1,
          type: 'funding',
        },
      });

      await session.close();
    });
  });

  describe('reconnects', () => {
    let connectionFrames: Array<{
      client: { close: () => void };
      frames: unknown[];
    }>;

    beforeEach(() => {
      connectionFrames = mockSuccessfulSessions();
    });

    it('reauthenticates, resubscribes, and emits resync', async () => {
      const session = createSession();

      vi.useFakeTimers();

      try {
        await session.connect();
        await vi.waitFor(() => {
          expect(connectionFrames[0]?.frames).toHaveLength(2);
        });

        const nextEvent = waitForNextEvent(session);
        connectionFrames[0]?.client.close();
        await vi.advanceTimersToNextTimerAsync();

        await vi.waitFor(() => {
          expect(connectionFrames[1]?.frames).toEqual([
            {
              id: 3,
              op: {
                args: {
                  proxy: credentials.proxy,
                  secret: credentials.secret,
                },
                type: 'auth',
              },
              req: 'post',
            },
            {
              id: 4,
              req: 'sub',
              chs: [
                'balances',
                'portfolio',
                'orders',
                'fills',
                'funding',
                'deposits',
                'withdrawals',
                'notifications',
                'tpsl',
              ],
            },
          ]);
        });
        await expect(nextEvent).resolves.toMatchObject({
          done: false,
          value: {
            reason: 'reconnect',
            type: 'resync',
          },
        });
      } finally {
        await session.close();
      }
    });
  });

  describe('commands', () => {
    let frames: unknown[];

    beforeEach(() => {
      frames = mockCommandSession();
    });

    it('places signed orders over the session socket', async () => {
      const session = createSession();
      await session.connect();

      const [ack] = await session.postOrders({
        orders: [
          {
            clientOrderId: '0123456789abcdef0123456789abcdef',
            instrumentId: 1,
            postOnly: false,
            price: '100.00',
            quantity: '1.5',
            side: OrderSide.BUY,
            timeInForce: PerpsTimeInForce.GTC,
          },
        ],
      });

      expect(ack).toMatchObject({
        clientOrderId: '0123456789abcdef0123456789abcdef',
        orderId: 123,
        status: 'ok',
      });
      expect(frames[2]).toMatchObject({
        id: 3,
        op: {
          args: [
            {
              buy: true,
              c: '0123456789abcdef0123456789abcdef',
              iid: 1,
              p: '100.00',
              po: false,
              qty: '1.5',
              tif: 'gtc',
            },
          ],
          type: 'createOrders',
        },
        req: 'post',
        salt: expect.any(Number),
        sig: expect.stringMatching(/^0x[0-9a-f]{130}$/),
        ts: expect.any(Number),
      });

      await session.close();
    });

    it('waits for the matching private order update', async () => {
      const frames = mockOrderPlacementSession({ status: 'open' });
      const session = createSession();
      await session.connect();

      const nextEvent = waitForNextEvent(session);
      await expect(
        session.placeOrder({
          clientOrderId: '0123456789abcdef0123456789abcdef',
          instrumentId: 1,
          postOnly: false,
          price: '100.00',
          quantity: '1.5',
          side: OrderSide.BUY,
          timeInForce: PerpsTimeInForce.GTC,
        }),
      ).resolves.toMatchObject({
        order: {
          clientOrderId: '0123456789abcdef0123456789abcdef',
          id: 123,
          restingQuantity: '1.5',
          status: 'open',
        },
      });
      expect(frames[2]).toMatchObject({
        op: { type: 'createOrders' },
        req: 'post',
      });
      await expect(nextEvent).resolves.toMatchObject({
        done: false,
        value: {
          payload: {
            id: 123,
            status: 'open',
          },
          type: 'order',
        },
      });

      await session.close();
    });

    it('uses a matching private order update received before the acknowledgement', async () => {
      const frames = mockOrderPlacementSession({
        status: 'open',
        updateBeforeAck: true,
      });
      const session = createSession();
      await session.connect();

      try {
        await expect(
          session.placeOrder({
            instrumentId: 1,
            postOnly: false,
            price: '100.00',
            quantity: '1.5',
            side: OrderSide.BUY,
            timeInForce: PerpsTimeInForce.GTC,
          }),
        ).resolves.toMatchObject({
          order: {
            clientOrderId: expect.stringMatching(/^[0-9a-f]{32}$/),
            id: 123,
            restingQuantity: '1.5',
            status: 'open',
          },
        });
        expect(frames[2]).toMatchObject({
          op: {
            args: [{ c: expect.stringMatching(/^[0-9a-f]{32}$/) }],
          },
        });
      } finally {
        await session.close();
      }
    });

    it('times out waiting for an order update after the acknowledgement', async () => {
      const session = createSession();
      await session.connect();
      vi.useFakeTimers();

      try {
        const placement = session.placeOrder({
          instrumentId: 1,
          postOnly: false,
          price: '100.00',
          quantity: '1.5',
          side: OrderSide.BUY,
          timeInForce: PerpsTimeInForce.GTC,
        });
        const rejection =
          expect(placement).rejects.toBeInstanceOf(TimeoutError);

        await vi.advanceTimersByTimeAsync(2000);

        await rejection;
      } finally {
        await session.close();
      }
    });

    it('uses the command timeout while waiting for the acknowledgement', async () => {
      server.resetHandlers();
      mockCommandSession((frame) =>
        frame.op?.type === 'createOrders'
          ? NO_RESPONSE
          : responseForFrame(frame),
      );
      const session = createSession();
      await session.connect();
      vi.useFakeTimers();

      try {
        const placement = session.placeOrder({
          instrumentId: 1,
          postOnly: false,
          price: '100.00',
          quantity: '1.5',
          side: OrderSide.BUY,
          timeInForce: PerpsTimeInForce.GTC,
        });
        const rejection = expect(placement).rejects.toMatchObject({
          message: 'Perps command response timed out.',
          name: TransportError.name,
        });

        await vi.advanceTimersByTimeAsync(30_000);

        await rejection;
      } finally {
        await session.close();
      }
    });

    it('returns terminal placement updates after the ack', async () => {
      mockOrderPlacementSession({
        status: 'post_only_rejected',
      });
      const session = createSession();
      await session.connect();

      try {
        await expect(
          session.placeOrder({
            clientOrderId: '0123456789abcdef0123456789abcdef',
            instrumentId: 1,
            postOnly: true,
            price: '100.00',
            quantity: '1.5',
            side: OrderSide.BUY,
            timeInForce: PerpsTimeInForce.GTC,
          }),
        ).resolves.toMatchObject({
          order: {
            clientOrderId: '0123456789abcdef0123456789abcdef',
            id: 123,
            status: 'post_only_rejected',
          },
        });
      } finally {
        await session.close();
      }
    });

    it('throws when place order receives a rejected order acknowledgement', async () => {
      mockCommandSession((frame) => {
        if (frame.op?.type === 'createOrders') {
          return [
            {
              error: 'insufficient margin',
              status: 'err',
            },
          ];
        }

        return responseForFrame(frame);
      });
      const session = createSession();
      await session.connect();

      try {
        await expect(
          session.placeOrder({
            instrumentId: 1,
            price: '100',
            quantity: '1',
            side: OrderSide.BUY,
            timeInForce: PerpsTimeInForce.IOC,
          }),
        ).rejects.toBeInstanceOf(RequestRejectedError);
      } finally {
        await session.close();
      }
    });

    it('returns rejected post order acknowledgements', async () => {
      mockCommandSession((frame) => {
        if (frame.op?.type === 'createOrders') {
          return [
            {
              coid: '0123456789abcdef0123456789abcdef',
              error: 'order would cross post-only book',
              status: 'err',
            },
          ];
        }

        return responseForFrame(frame);
      });
      const session = createSession();
      await session.connect();

      try {
        await expect(
          session.postOrders({
            orders: [
              {
                clientOrderId: '0123456789abcdef0123456789abcdef',
                instrumentId: 1,
                price: '100',
                quantity: '1',
                side: OrderSide.BUY,
                timeInForce: PerpsTimeInForce.IOC,
              },
            ],
          }),
        ).resolves.toEqual([
          {
            clientOrderId: '0123456789abcdef0123456789abcdef',
            status: 'err',
            error: 'order would cross post-only book',
          },
        ]);
      } finally {
        await session.close();
      }
    });

    it('rejects request-level order errors', async () => {
      mockCommandSession((frame) => {
        if (frame.op?.type === 'createOrders') {
          return {
            error: 'price exceeds allowed precision',
            status: 'err',
          };
        }

        return responseForFrame(frame);
      });
      const session = createSession();
      await session.connect();

      try {
        await expect(
          session.placeOrder({
            instrumentId: 1,
            price: '100.123',
            quantity: '1',
            side: OrderSide.BUY,
            timeInForce: PerpsTimeInForce.GTC,
          }),
        ).rejects.toThrow(RequestRejectedError);
      } finally {
        await session.close();
      }
    });

    it('returns mixed batch order acknowledgements', async () => {
      mockCommandSession((frame) => {
        if (frame.op?.type === 'createOrders') {
          return [
            {
              oid: 123,
              status: 'ok',
            },
            {
              error: 'insufficient margin',
              status: 'err',
            },
          ];
        }

        return responseForFrame(frame);
      });
      const session = createSession();
      await session.connect();

      try {
        await expect(
          session.postOrders({
            orders: [
              {
                instrumentId: 1,
                price: '100',
                quantity: '1',
                side: OrderSide.BUY,
                timeInForce: PerpsTimeInForce.IOC,
              },
              {
                instrumentId: 1,
                price: '101',
                quantity: '2',
                side: OrderSide.SELL,
                timeInForce: PerpsTimeInForce.IOC,
              },
            ],
          }),
        ).resolves.toEqual([
          {
            orderId: 123,
            status: 'ok',
          },
          {
            error: 'insufficient margin',
            status: 'err',
          },
        ]);
        expect(frames[2]).toMatchObject({
          op: {
            args: [{ buy: true }, { buy: false }],
            type: 'createOrders',
          },
        });
      } finally {
        await session.close();
      }
    });

    it('places an order with take-profit and stop-loss triggers', async () => {
      const frames = mockOrderPlacementSession({
        status: 'open',
        updateBeforeAck: true,
      });
      const session = createSession();
      await session.connect();

      await expect(
        session.placeOrder({
          instrumentId: 1,
          price: '100.00',
          quantity: '1.5',
          side: OrderSide.BUY,
          timeInForce: PerpsTimeInForce.GTC,
          stopLoss: {
            limitPrice: '89.50',
            triggerPrice: '90.00',
          },
          takeProfit: {
            triggerPrice: '120.00',
          },
        }),
      ).resolves.toEqual({
        order: expect.objectContaining({
          id: 123,
          restingQuantity: '1.5',
          status: 'open',
        }),
        tpSl: {
          takeProfit: { orderId: 124 },
          stopLoss: { orderId: 125 },
        },
      });

      expect(frames[2]).toMatchObject({
        id: 3,
        op: {
          args: [
            {
              buy: true,
              c: expect.stringMatching(/^[0-9a-f]{32}$/),
              iid: 1,
              p: '100.00',
              po: false,
              qty: '1.5',
              tif: 'gtc',
            },
            {
              buy: false,
              iid: 1,
              po: false,
              qty: '1.5',
              ro: true,
              tr: { market: true, tpsl: 'tp', trp: '120.00' },
            },
            {
              buy: false,
              iid: 1,
              p: '89.50',
              po: false,
              qty: '1.5',
              ro: true,
              tr: { tpsl: 'sl', trp: '90.00' },
            },
          ],
          grp: 'order',
          type: 'createOrders',
        },
        req: 'post',
      });

      await session.close();
    });

    it('places full-position take-profit and stop-loss triggers', async () => {
      server.use(mockPortfolioPosition({ size: '1.5' }));
      const session = createSession();
      await session.connect();

      await expect(
        session.placePositionTpSl({
          instrumentId: 1,
          stopLoss: { triggerPrice: '90.00' },
          takeProfit: { triggerPrice: '120.00' },
        }),
      ).resolves.toEqual({
        tpSl: {
          takeProfit: { orderId: 123 },
          stopLoss: { orderId: 124 },
        },
      });

      expect(frames[2]).toMatchObject({
        op: {
          args: [
            {
              buy: false,
              iid: 1,
              po: false,
              qty: '0',
              ro: true,
              tr: { market: true, tpsl: 'tp', trp: '120.00' },
            },
            {
              buy: false,
              iid: 1,
              po: false,
              qty: '0',
              ro: true,
              tr: { market: true, tpsl: 'sl', trp: '90.00' },
            },
          ],
          grp: 'position',
          type: 'createOrders',
        },
        req: 'post',
      });

      await session.close();
    });

    it('infers short position TP/SL exit side', async () => {
      server.use(mockPortfolioPosition({ size: '-1.5' }));
      const session = createSession();
      await session.connect();

      await expect(
        session.placePositionTpSl({
          instrumentId: 1,
          stopLoss: { triggerPrice: '110.00' },
        }),
      ).resolves.toEqual({
        tpSl: {
          stopLoss: { orderId: 123 },
        },
      });

      expect(frames[2]).toMatchObject({
        op: {
          args: [
            {
              buy: true,
              iid: 1,
              qty: '0',
              ro: true,
              tr: { market: true, tpsl: 'sl', trp: '110.00' },
            },
          ],
          grp: 'position',
          type: 'createOrders',
        },
      });

      await session.close();
    });

    it('updates leverage over the session socket', async () => {
      const session = createSession();
      await session.connect();

      await expect(
        session.updateLeverage({
          crossMargin: false,
          instrumentId: 1,
          leverage: 5,
        }),
      ).resolves.toEqual({
        crossMargin: false,
        instrumentId: 1,
        leverage: 5,
        status: 'ok',
      });
      expect(frames[2]).toMatchObject({
        id: 3,
        op: {
          args: {
            cross: false,
            iid: 1,
            lev: 5,
          },
          type: 'updateLeverage',
        },
        req: 'post',
        salt: expect.any(Number),
        sig: expect.stringMatching(/^0x[0-9a-f]{130}$/),
        ts: expect.any(Number),
      });

      await session.close();
    });

    it('throws when leverage update is rejected', async () => {
      mockCommandSession((frame) => {
        if (frame.op?.type === 'updateLeverage') {
          return { status: 'err', error: 'invalid leverage' };
        }

        return responseForFrame(frame);
      });
      const session = createSession();
      await session.connect();

      try {
        await expect(
          session.updateLeverage({
            crossMargin: false,
            instrumentId: 1,
            leverage: 5,
          }),
        ).rejects.toBeInstanceOf(RequestRejectedError);
      } finally {
        await session.close();
      }
    });

    it('updates isolated margin over the session socket', async () => {
      const session = createSession();
      await session.connect();

      await expect(
        session.updateMargin({
          amount: '-1234567890.123456789012345678',
          instrumentId: 7,
        }),
      ).resolves.toBeUndefined();
      expect(frames[2]).toMatchObject({
        id: 3,
        op: {
          args: {
            amt: '-1234567890.123456789012345678',
            iid: 7,
          },
          type: 'updateMargin',
        },
        req: 'post',
        salt: expect.any(Number),
        sig: expect.stringMatching(/^0x[0-9a-f]{130}$/),
        ts: expect.any(Number),
      });

      await session.close();
    });

    it('validates isolated margin updates before sending a command', async () => {
      const session = createSession();
      await session.connect();

      try {
        await expect(
          session.updateMargin({ amount: '1', instrumentId: -1 }),
        ).rejects.toBeInstanceOf(UserInputError);
        await expect(
          session.updateMargin({
            // @ts-expect-error Runtime validation rejects non-decimal inputs.
            amount: true,
            instrumentId: 7,
          }),
        ).rejects.toBeInstanceOf(UserInputError);
        expect(frames).toHaveLength(2);
      } finally {
        await session.close();
      }
    });

    it('throws when an isolated margin update is rejected', async () => {
      mockCommandSession((frame) => {
        if (frame.op?.type === 'updateMargin') {
          return { status: 'err', error: 'invalid margin adjustment' };
        }

        return responseForFrame(frame);
      });
      const session = createSession();
      await session.connect();

      try {
        await expect(
          session.updateMargin({ amount: '1', instrumentId: 7 }),
        ).rejects.toMatchObject({
          message: 'invalid margin adjustment',
          name: RequestRejectedError.name,
        });
      } finally {
        await session.close();
      }
    });

    it('cancels a single order by client order id', async () => {
      const session = createSession();
      await session.connect();

      await expect(
        session.cancelOrder({
          clientOrderId: '0123456789abcdef0123456789abcdef',
        }),
      ).resolves.toEqual({
        clientOrderId: '0123456789abcdef0123456789abcdef',
        orderId: 123,
        status: 'ok',
      });
      expect(frames[2]).toMatchObject({
        id: 3,
        op: {
          args: ['0123456789abcdef0123456789abcdef'],
          type: 'cancelOrdersCOID',
        },
        req: 'post',
        salt: expect.any(Number),
        sig: expect.stringMatching(/^0x[0-9a-f]{130}$/),
        ts: expect.any(Number),
      });

      await session.close();
    });

    it('returns rejected cancel results', async () => {
      mockCommandSession((frame) => {
        if (frame.op?.type === 'cancelOrdersCOID') {
          return [
            {
              coid: '0123456789abcdef0123456789abcdef',
              error: 'order not found',
              status: 'err',
            },
          ];
        }

        return responseForFrame(frame);
      });
      const session = createSession();
      await session.connect();

      try {
        await expect(
          session.cancelOrder({
            clientOrderId: '0123456789abcdef0123456789abcdef',
          }),
        ).resolves.toEqual({
          clientOrderId: '0123456789abcdef0123456789abcdef',
          error: 'order not found',
          status: 'err',
        });
      } finally {
        await session.close();
      }
    });

    it('cancels all orders through the signed REST endpoint', async () => {
      const requests: Array<{
        body: unknown;
        proxy: string | null;
        secret: string | null;
      }> = [];
      server.use(
        http.delete(
          `${production.perps.rest}/v1/trade/orders/all`,
          async ({ request }) => {
            requests.push({
              body: await request.json(),
              proxy: request.headers.get('polymarket-proxy'),
              secret: request.headers.get('polymarket-secret'),
            });
            return HttpResponse.json({ status: 'ok' });
          },
        ),
      );
      const session = createSession();

      await session.cancelAllOrders({
        expiresAt: 1_700_000_005_000,
        instrumentId: 1,
      });
      await session.cancelAllOrders();

      expect(requests).toHaveLength(2);
      expect(requests[0]).toMatchObject({
        proxy: credentials.proxy,
        secret: credentials.secret,
        body: {
          exp: 1_700_000_005_000,
          op: { args: { iid: 1 }, type: 'cancelAll' },
          salt: expect.any(Number),
          sig: expect.stringMatching(/^0x[0-9a-f]{130}$/),
          ts: expect.any(Number),
        },
      });
      expect(requests[1]).toMatchObject({
        proxy: credentials.proxy,
        secret: credentials.secret,
        body: {
          op: { args: {}, type: 'cancelAll' },
          salt: expect.any(Number),
          sig: expect.stringMatching(/^0x[0-9a-f]{130}$/),
          ts: expect.any(Number),
        },
      });
      expect(requests[1]?.body).not.toHaveProperty('exp');
    });

    it('rejects arming auto-cancel less than five seconds ahead', async () => {
      const session = createSession();

      await expect(
        session.armAutoCancel({ cancelAt: Date.now() + 4_999 }),
      ).rejects.toBeInstanceOf(UserInputError);
    });

    it('throws AutoCancelDailyLimitError when arming hits the daily limit', async () => {
      server.use(
        http.patch(`${production.perps.rest}/v1/trade/auto-cancel`, () =>
          HttpResponse.json(
            { status: 'err', error: 'auto_cancel_daily_limit_reached' },
            { status: 422 },
          ),
        ),
      );
      const session = createSession();

      await expect(
        session.armAutoCancel({ cancelAt: Date.now() + 60_000 }),
      ).rejects.toBeInstanceOf(AutoCancelDailyLimitError);
    });
  });

  describe('TP/SL lifecycle events', () => {
    it('emits TP/SL lifecycle updates', async () => {
      mockSuccessfulSession();
      const connection = captureConnection(server, perps);
      const session = createSession();

      await session.connect();

      const nextEvent = waitForNextEvent(session);
      await connection.send({
        ch: 'tpsl::1',
        data: { oid: 123, st: 'armed' },
        sq: 1,
        ts: 1_700_000_000_000,
      });

      await expect(nextEvent).resolves.toMatchObject({
        done: false,
        value: {
          channel: 'tpsl::1',
          payload: { orderId: 123, status: 'armed' },
          sequence: 1,
          type: 'tpsl',
        },
      });

      await session.close();
    });

    it('drops TP/SL updates with unrecognized statuses without closing the session', async () => {
      mockSuccessfulSession();
      const connection = captureConnection(server, perps);
      const session = createSession();

      await session.connect();

      const nextEvent = waitForNextEvent(session);
      await connection.send({
        ch: 'tpsl::1',
        data: { oid: 123, st: 'future_status' },
        sq: 1,
        ts: 1_700_000_000_000,
      });
      await connection.send({
        ch: 'tpsl::1',
        data: { oid: 123, st: 'armed' },
        sq: 2,
        ts: 1_700_000_000_000,
      });

      // The unrecognized-status frame is dropped; the valid update sent
      // afterwards arriving as the next event proves the session survived.
      await expect(nextEvent).resolves.toMatchObject({
        done: false,
        value: {
          channel: 'tpsl::1',
          payload: { orderId: 123, status: 'armed' },
          sequence: 2,
          type: 'tpsl',
        },
      });

      await session.close();
    });
  });

  describe('notifications', () => {
    it('emits notification events from the notifications channel', async () => {
      mockSuccessfulSession();
      const connection = captureConnection(server, perps);
      const session = createSession();

      await session.connect();

      const nextEvent = waitForNextEvent(session);
      await connection.send(
        notificationUpdate({ sequence: 1042, type: 'position_opened' }),
      );

      await expect(nextEvent).resolves.toMatchObject({
        done: false,
        value: {
          channel: 'notifications',
          payload: {
            id: NOTIFICATION_ID,
            type: 'position_opened',
            instrumentId: 1,
            side: 'long',
            orderType: 'take_profit',
          },
          sequence: 1042,
          type: 'notification',
        },
      });

      await session.close();
    });

    it('drops server resync frames without emitting an event', async () => {
      mockSuccessfulSession();
      const connection = captureConnection(server, perps);
      const session = createSession();

      await session.connect();

      // The server resync control frame is parsed but intentionally not
      // surfaced until DEV-428; the notification sent afterwards arriving as
      // the next event proves it was dropped without closing the session.
      const nextEvent = waitForNextEvent(session);
      await connection.send({
        ch: 'notifications',
        sq: 1050,
        ts: 1_700_000_000_000,
        type: 'resync',
      });
      await connection.send(
        notificationUpdate({ sequence: 1051, type: 'position_opened' }),
      );

      await expect(nextEvent).resolves.toMatchObject({
        done: false,
        value: {
          channel: 'notifications',
          sequence: 1051,
          type: 'notification',
        },
      });

      await session.close();
    });

    it('does not synthesize sequence-gap resyncs for notification sequences', async () => {
      mockSuccessfulSession();
      const connection = captureConnection(server, perps);
      const session = createSession();

      await session.connect();

      // Notification frames carry sparse engine sequences: one event can emit
      // several notifications sharing a sequence and unrelated events skip
      // values. Neither shape may trigger a synthesized sequence_gap resync.
      const first = waitForNextEvent(session);
      await connection.send(
        notificationUpdate({ sequence: 10, type: 'position_opened' }),
      );
      await expect(first).resolves.toMatchObject({
        value: { sequence: 10, type: 'notification' },
      });

      const second = waitForNextEvent(session);
      await connection.send(
        notificationUpdate({ sequence: 10, type: 'position_increased' }),
      );
      await expect(second).resolves.toMatchObject({
        value: { sequence: 10, type: 'notification' },
      });

      const third = waitForNextEvent(session);
      await connection.send(
        notificationUpdate({ sequence: 25, type: 'position_reduced' }),
      );
      await expect(third).resolves.toMatchObject({
        value: { sequence: 25, type: 'notification' },
      });

      await session.close();
    });

    it('drops notification frames with unknown types without closing the session', async () => {
      mockSuccessfulSession();
      await expectDropsUnknownFrame({
        expectedEvent: { channel: 'notifications', type: 'notification' },
        link: perps,
        server,
        subscribe: async () => {
          const session = createSession();
          await session.connect();
          return { close: () => session.close(), events: session };
        },
        unknownFrame: {
          ch: 'notifications',
          data: { id: NOTIFICATION_ID, type: 'future_notification' },
          sq: 1,
          ts: 1_700_000_000_000,
        },
        validFrame: notificationUpdate({
          sequence: 2,
          type: 'position_opened',
        }),
      });
    });

    it('pages notifications and pins since_seq across pages', async () => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get(
          `${production.perps.rest}/v1/account/notifications`,
          ({ request }) => {
            const params = new URL(request.url).searchParams;
            requests.push(params);

            if (params.get('cursor') === null) {
              return HttpResponse.json({
                items: [
                  notificationEntry({ ts: 3000 }),
                  {
                    notification: {
                      id: NOTIFICATION_ID,
                      type: 'future_notification',
                    },
                    read_at: null,
                    ts: 2500,
                  },
                ],
                unread: 2,
                durable_source_seq: 1043,
                has_more: true,
                next_cursor: 'upstream-cursor-1',
              });
            }

            return HttpResponse.json({
              items: [notificationEntry({ ts: 2000 })],
              unread: 2,
              durable_source_seq: 1043,
              has_more: false,
              next_cursor: null,
            });
          },
        ),
      );
      const session = createSession();
      const pages = session.listNotifications({ limit: 1, sinceSeq: 1000 });

      const first = await pages.firstPage();
      // The unknown-type entry in the first page is omitted instead of
      // failing the read.
      expect(first.items).toHaveLength(1);
      expect(first.hasMore).toBe(true);

      const second = await pages.from(first.nextCursor).firstPage();
      expect(second.items).toHaveLength(1);
      expect(second.hasMore).toBe(false);
      expect(second.nextCursor).toBeUndefined();

      expect(requests[0]?.get('since_seq')).toBe('1000');
      expect(requests[0]?.get('limit')).toBe('1');
      expect(requests[0]?.get('cursor')).toBeNull();
      expect(requests[1]?.get('since_seq')).toBe('1000');
      expect(requests[1]?.get('limit')).toBe('1');
      expect(requests[1]?.get('cursor')).toBe('upstream-cursor-1');
    });

    it('fetches the unread notifications count even alongside unknown notification types', async () => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get(
          `${production.perps.rest}/v1/account/notifications`,
          ({ request }) => {
            requests.push(new URL(request.url).searchParams);
            return HttpResponse.json({
              items: [
                {
                  notification: {
                    id: NOTIFICATION_ID,
                    type: 'future_notification',
                  },
                  read_at: null,
                  ts: 3000,
                },
              ],
              unread: 7,
              durable_source_seq: 1043,
              has_more: true,
              next_cursor: 'upstream-cursor-1',
            });
          },
        ),
      );
      const session = createSession();

      await expect(session.fetchUnreadNotificationsCount()).resolves.toBe(7);
      expect(requests[0]?.get('limit')).toBe('1');
    });

    it('marks notifications read by id', async () => {
      const bodies: unknown[] = [];
      server.use(
        http.post(
          `${production.perps.rest}/v1/account/notifications/read`,
          async ({ request }) => {
            bodies.push(await request.json());
            return HttpResponse.json({ status: 'ok' });
          },
        ),
      );
      const session = createSession();

      await session.markNotificationsRead({ ids: [NOTIFICATION_ID] });

      expect(bodies).toEqual([{ ids: [NOTIFICATION_ID] }]);
    });

    it('marks notifications read up to a notification via a base64url cursor', async () => {
      const bodies: Array<{ before?: string }> = [];
      server.use(
        http.post(
          `${production.perps.rest}/v1/account/notifications/read`,
          async ({ request }) => {
            bodies.push((await request.json()) as { before?: string });
            return HttpResponse.json({ status: 'ok' });
          },
        ),
      );
      const session = createSession();

      await session.markNotificationsRead({
        upTo: { id: NOTIFICATION_ID, timestamp: 1_767_225_600_000 },
      });

      const before = bodies[0]?.before;
      expect(before).toBeDefined();
      expect(before).not.toMatch(/[+/=]/);
      expect(
        JSON.parse(atob(String(before).replace(/-/g, '+').replace(/_/g, '/'))),
      ).toEqual({ id: NOTIFICATION_ID, ts: 1_767_225_600_000 });
    });

    it('throws when the read request is rejected in-band', async () => {
      server.use(
        http.post(
          `${production.perps.rest}/v1/account/notifications/read`,
          () => HttpResponse.json({ status: 'err', error: 'unauthorized' }),
        ),
      );
      const session = createSession();

      await expect(
        session.markNotificationsRead({ ids: [NOTIFICATION_ID] }),
      ).rejects.toBeInstanceOf(RequestRejectedError);
    });
  });

  describe('account reads', () => {
    it('sends session credentials as REST auth headers', async () => {
      server.use(
        http.get(
          `${production.perps.rest}/v1/account/balances`,
          ({ request }) => {
            expect(request.headers.get('polymarket-proxy')).toBe(
              credentials.proxy,
            );
            expect(request.headers.get('polymarket-secret')).toBe(
              credentials.secret,
            );
            return HttpResponse.json([
              { asset: 'USDC', balance: '12.34', value: '12.34' },
            ]);
          },
        ),
      );
      const session = createSession();

      await expect(session.fetchBalances()).resolves.toEqual([
        { asset: 'USDC', balance: '12.34', value: '12.34' },
      ]);
    });

    it('fetches account stats', async () => {
      server.use(
        http.get(`${production.perps.rest}/v1/account/stats`, () =>
          HttpResponse.json({
            volume_7d: '5000000',
            taker_volume_7d: '3500000',
            maker_volume_7d: '1500000',
            account_maker_share_7d: '0.35',
            entity_maker_share_7d: '0.40',
            entity_id: 42,
            entity_name: 'desk',
          }),
        ),
      );
      const session = createSession();

      await expect(session.fetchStats()).resolves.toEqual({
        volume7d: '5000000',
        takerVolume7d: '3500000',
        makerVolume7d: '1500000',
        accountMakerShare7d: '0.35',
        entityMakerShare7d: '0.40',
        entityId: 42,
        entityName: 'desk',
      });
    });

    it('throws user input errors for invalid account pagination cursors', () => {
      const cursor = toPaginationCursor(
        btoa(JSON.stringify({ kind: 'perpsTrades' })),
      );
      const session = createSession();

      let thrown: unknown;
      try {
        session.listFundingPayments({ cursor }).firstPage();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(UserInputError);
      expect(thrown).toMatchObject({
        message: 'Invalid Perps account pagination cursor',
        cause: expect.any(Error),
      });
    });

    it('pages fills with the native cursor while keeping the requested filters', async () => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get(`${production.perps.rest}/v1/account/fills`, ({ request }) => {
          const params = new URL(request.url).searchParams;
          requests.push(params);

          if (params.get('cursor') === null) {
            return HttpResponse.json({
              data: [accountFill(3, 3000), accountFill(2, 2000)],
              more: true,
            });
          }

          return HttpResponse.json({
            data: [accountFill(1, 1000)],
            more: false,
          });
        }),
      );
      const session = createSession();

      const pages: number[][] = [];
      for await (const page of session.listFills({ end: 3000, start: 0 })) {
        pages.push(page.items.map((fill) => fill.tradeId));
        if (pages.length > MAX_EXPECTED_PAGES) break;
      }

      expect(pages).toEqual([[3, 2], [1]]);
      expect(requests.map((params) => params.toString())).toEqual([
        'start_timestamp=0&end_timestamp=3000',
        'start_timestamp=0&end_timestamp=3000&cursor=2',
      ]);
    });

    it('forwards a sort direction and a caller-provided fills cursor as-is', async () => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get(`${production.perps.rest}/v1/account/fills`, ({ request }) => {
          requests.push(new URL(request.url).searchParams);

          return HttpResponse.json({
            data: [accountFill(43, 4300), accountFill(44, 4400)],
            more: false,
          });
        }),
      );
      const session = createSession();

      const first = await session
        .listFills({
          cursor: toPaginationCursor('42'),
          sort: PerpsSortDirection.Ascending,
        })
        .firstPage();

      expect(first.items.map((fill) => fill.tradeId)).toEqual([43, 44]);
      expect(first.hasMore).toBe(false);
      expect(first.nextCursor).toBeUndefined();
      expect(requests.map((params) => params.toString())).toEqual([
        'sort=asc&cursor=42',
      ]);
    });

    it('yields an overlapping window boundary item only once', async () => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get(
          `${production.perps.rest}/v1/account/funding`,
          ({ request }) => {
            const params = new URL(request.url).searchParams;
            requests.push(params);

            if (params.get('end_timestamp') === '3000') {
              return HttpResponse.json({
                data: [fundingPayment('1', 3000), fundingPayment('2', 2000)],
                more: true,
              });
            }

            return HttpResponse.json({
              data: [fundingPayment('2', 2000), fundingPayment('3', 1000)],
              more: false,
            });
          },
        ),
      );
      const session = createSession();

      const pages: string[][] = [];
      const ids: number[] = [];
      for await (const page of session.listFundingPayments({
        end: 3000,
        start: 0,
      })) {
        pages.push(page.items.map((payment) => payment.funding));
        ids.push(...page.items.map((payment) => payment.id));
        if (pages.length > MAX_EXPECTED_PAGES) break;
      }

      expect(pages.flat()).toEqual(['1', '2', '3']);
      expect(ids).toEqual([1, 2, 3]);
      expect(requests.map((params) => params.get('end_timestamp'))).toEqual([
        '3000',
        '2000',
      ]);
    });

    it('keeps deduping while the window boundary timestamp holds', async () => {
      const requests: URLSearchParams[] = [];
      const boundary = [
        fundingPayment('1', 2000),
        fundingPayment('2', 2000),
        fundingPayment('3', 2000),
      ];
      let call = 0;
      server.use(
        http.get(
          `${production.perps.rest}/v1/account/funding`,
          ({ request }) => {
            requests.push(new URL(request.url).searchParams);
            call += 1;

            if (call === 1) {
              return HttpResponse.json({
                data: boundary.slice(0, 2),
                more: true,
              });
            }

            return HttpResponse.json({ data: boundary, more: call === 2 });
          },
        ),
      );
      const session = createSession();

      const pages: string[][] = [];
      for await (const page of session.listFundingPayments({
        end: 3000,
        start: 0,
      })) {
        pages.push(page.items.map((payment) => payment.funding));
        if (pages.length > MAX_EXPECTED_PAGES) break;
      }

      expect(pages).toEqual([['1', '2'], ['3'], []]);
      expect(requests.map((params) => params.get('end_timestamp'))).toEqual([
        '3000',
        '2000',
        '2000',
      ]);
    });

    it('steps the window back past a fully deduped page', async () => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get(
          `${production.perps.rest}/v1/account/funding`,
          ({ request }) => {
            const params = new URL(request.url).searchParams;
            requests.push(params);

            if (params.get('end_timestamp') === '3000') {
              return HttpResponse.json({
                data: [fundingPayment('1', 3000), fundingPayment('2', 2000)],
                more: true,
              });
            }

            if (params.get('end_timestamp') === '2000') {
              return HttpResponse.json({
                data: [fundingPayment('2', 2000)],
                more: true,
              });
            }

            return HttpResponse.json({
              data: [fundingPayment('3', 1000)],
              more: false,
            });
          },
        ),
      );
      const session = createSession();

      const pages: string[][] = [];
      for await (const page of session.listFundingPayments({
        end: 3000,
        start: 0,
      })) {
        pages.push(page.items.map((payment) => payment.funding));
        if (pages.length > MAX_EXPECTED_PAGES) break;
      }

      expect(pages).toEqual([['1', '2'], [], ['3']]);
      expect(requests.map((params) => params.get('end_timestamp'))).toEqual([
        '3000',
        '2000',
        '1999',
      ]);
    });

    it('stops paging at the requested start timestamp', async () => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get(
          `${production.perps.rest}/v1/account/funding`,
          ({ request }) => {
            requests.push(new URL(request.url).searchParams);

            return HttpResponse.json({
              data: [fundingPayment('1', 2000), fundingPayment('2', 1000)],
              more: true,
            });
          },
        ),
      );
      const session = createSession();

      const pages: string[][] = [];
      for await (const page of session.listFundingPayments({
        end: 3000,
        start: 1000,
      })) {
        pages.push(page.items.map((payment) => payment.funding));
        if (pages.length > MAX_EXPECTED_PAGES) break;
      }

      expect(pages).toEqual([['1', '2']]);
      expect(requests).toHaveLength(1);
    });

    it('continues ascending interval account history pages', async () => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get(
          `${production.perps.rest}/v1/account/equity`,
          ({ request }) => {
            const params = new URL(request.url).searchParams;
            requests.push(params);

            if (params.get('start_timestamp') === '0') {
              return HttpResponse.json({
                data: [
                  [0, '10'],
                  [3_600_000, '11'],
                ],
                more: true,
              });
            }

            return HttpResponse.json({
              data: [[7_200_000, '12']],
              more: false,
            });
          },
        ),
      );
      const session = createSession();
      const pages = session.listEquityHistory({
        end: 10_800_000,
        interval: PerpsPnlInterval.OneHour,
        start: 0,
      });

      const first = await pages.firstPage();
      const second = await pages.from(first.nextCursor).firstPage();

      expect(first.items.map((point) => point.timestamp)).toEqual([
        0, 3_600_000,
      ]);
      expect(second.items.map((point) => point.timestamp)).toEqual([7_200_000]);
      expect(requests.map((params) => params.get('start_timestamp'))).toEqual([
        '0',
        '7200000',
      ]);
    });
  });
});

function createSession(): PerpsSession {
  return new PerpsSession({
    chainId: production.chainId,
    credentials,
    onClose: () => undefined,
    restUrl: production.perps.rest,
    wsUrl: production.perps.ws,
  });
}

const NO_RESPONSE = Symbol('NO_RESPONSE');

function mockCommandSession(
  responder: (frame: {
    op?: { args?: unknown; type?: string };
    req?: string;
  }) => unknown = responseForFrame,
): unknown[] {
  const frames: unknown[] = [];

  server.use(
    perps.addEventListener('connection', ({ client }) => {
      client.addEventListener('message', (event) => {
        const frame = JSON.parse(String(event.data));
        frames.push(frame);
        const response = responder(frame);
        if (response === NO_RESPONSE) return;
        client.send(
          JSON.stringify({
            id: frame.id,
            data: response,
          }),
        );
      });
    }),
  );

  return frames;
}

function mockOrderPlacementSession(request: {
  status: string;
  updateBeforeAck?: boolean;
}): unknown[] {
  const frames: unknown[] = [];

  server.use(
    perps.addEventListener('connection', ({ client }) => {
      client.addEventListener('message', (event) => {
        const frame = JSON.parse(String(event.data));
        frames.push(frame);

        if (frame.op?.type === 'createOrders') {
          const update = orderUpdate(
            request.status,
            clientOrderIdFromFrame(frame),
          );
          if (request.updateBeforeAck) {
            client.send(JSON.stringify(update));
          }
          client.send(
            JSON.stringify({
              id: frame.id,
              data: responseForFrame(frame),
            }),
          );
          if (!request.updateBeforeAck) {
            setTimeout(() => client.send(JSON.stringify(update)), 0);
          }
          return;
        }

        client.send(
          JSON.stringify({
            id: frame.id,
            data: responseForFrame(frame),
          }),
        );
      });
    }),
  );

  return frames;
}

function clientOrderIdFromFrame(frame: {
  op?: { args?: unknown; type?: string };
}): string {
  const [order] = Array.isArray(frame.op?.args) ? frame.op.args : [];
  if (
    typeof order !== 'object' ||
    order === null ||
    !('c' in order) ||
    typeof order.c !== 'string'
  ) {
    throw new Error('Expected Perps command client order ID.');
  }

  return order.c;
}

function responseForFrame(frame: {
  op?: { args?: unknown; type?: string };
  req?: string;
}) {
  if (frame.req === 'sub') return [{ status: 'ok' }];
  switch (frame.op?.type) {
    case 'auth':
      return { status: 'ok' };
    case 'createOrders': {
      const orders = Array.isArray(frame.op.args) ? frame.op.args : [undefined];
      return orders.map((order, index) => ({
        coid:
          typeof order === 'object' &&
          order !== null &&
          'c' in order &&
          typeof order.c === 'string'
            ? order.c
            : undefined,
        oid: 123 + index,
        status: 'ok',
      }));
    }
    case 'updateLeverage':
      return { status: 'ok', instrument_id: 1, leverage: 5, cross: false };
    case 'updateMargin':
      return { status: 'ok' };
    case 'cancelOrdersCOID':
      return [
        {
          coid: '0123456789abcdef0123456789abcdef',
          oid: 123,
          status: 'ok',
        },
      ];
    default:
      return [{ status: 'ok' }];
  }
}

function mockSuccessfulSession(): unknown[] {
  const frames: unknown[] = [];

  server.use(
    perps.addEventListener('connection', ({ client }) => {
      client.addEventListener('message', (event) => {
        const frame = JSON.parse(String(event.data));
        frames.push(frame);
        const data =
          frame.req === 'sub' ? [{ status: 'ok' }] : { status: 'ok' };
        client.send(
          JSON.stringify({
            id: frame.id,
            data,
          }),
        );
      });
    }),
  );

  return frames;
}

function mockSuccessfulSessions(): Array<{
  client: { close: () => void };
  frames: unknown[];
}> {
  const connections: Array<{
    client: { close: () => void };
    frames: unknown[];
  }> = [];

  server.use(
    perps.addEventListener('connection', ({ client }) => {
      const frames: unknown[] = [];
      connections.push({ client, frames });
      client.addEventListener('message', (event) => {
        const frame = JSON.parse(String(event.data));
        frames.push(frame);
        const data =
          frame.req === 'sub' ? [{ status: 'ok' }] : { status: 'ok' };
        client.send(
          JSON.stringify({
            id: frame.id,
            data,
          }),
        );
      });
    }),
  );

  return connections;
}

function balanceUpdate(request: { balance: string; sequence: number }) {
  return {
    ch: 'balances',
    data: {
      asset: 'USDC',
      balance: request.balance,
      value: request.balance,
    },
    sq: request.sequence,
    ts: 1_700_000_000_000,
  };
}

function fillsUpdate(request: { sequence: number; tradeIds: number[] }) {
  return {
    ch: 'fills',
    data: request.tradeIds.map((tid) => ({
      coid: '550e8400e29b41d4a716446655440000',
      fea: 'USDC',
      fee: '1.25',
      iid: 1,
      liq: false,
      oid: 123,
      p: '100.00',
      pep: '100.00',
      pnl: '100.00',
      psz: '26.86',
      qty: '10.00',
      side: 'long',
      taker: true,
      tid,
      ts: 1_700_000_000_000,
    })),
    sq: request.sequence,
    ts: 1_700_000_000_000,
  };
}

function fundingUpdate(request: { id: number }) {
  return {
    ch: 'funding',
    data: {
      fr: '0.0001',
      fua: 'USDC',
      fund: '0.5',
      id: request.id,
      iid: 1,
      sz: '10.00',
      ts: 1_700_000_000_000,
    },
    sq: 1,
    ts: 1_700_000_000_000,
  };
}

function orderUpdate(status: string, clientOrderId: string) {
  return {
    ch: 'orders',
    data: {
      buy: true,
      coid: clientOrderId,
      cts: 1_700_000_000_000,
      fill: status === 'filled' ? '1.5' : '0',
      iid: 1,
      oid: 123,
      p: '100.00',
      po: false,
      qty: '1.5',
      rest: status === 'filled' ? '0' : '1.5',
      ro: false,
      status,
      tif: 'gtc',
      uts: 1_700_000_000_000,
    },
    sq: 1,
    ts: 1_700_000_000_000,
  };
}

const NOTIFICATION_ID = '0a5d8f1e-3b2c-5e4a-9f8b-1c2d3e4f5a6b';

function notificationUpdate(request: { sequence: number; type: string }) {
  return {
    ch: 'notifications',
    data: {
      avg_price: '64210',
      id: NOTIFICATION_ID,
      instrument_id: 1,
      leverage: 10,
      order_type: 'take_profit',
      side: 'long',
      size: '10.00',
      type: request.type,
    },
    sq: request.sequence,
    ts: 1_700_000_000_000,
  };
}

function notificationEntry(request: { ts: number }) {
  return {
    notification: {
      avg_price: '64210',
      id: NOTIFICATION_ID,
      instrument_id: 1,
      leverage: 10,
      side: 'long',
      size: '10.00',
      type: 'position_opened',
    },
    read_at: null,
    ts: request.ts,
  };
}

function accountFill(tradeId: number, timestamp: number) {
  return {
    fee: '0.01',
    fee_asset: 'USDC',
    hash: `0x${'1'.repeat(64)}`,
    instrument_id: 1,
    liquidation: false,
    order_id: 100 + tradeId,
    pnl: '0',
    previous_entry_price: '0',
    previous_size: '0',
    price: '100',
    quantity: '1',
    side: 'long',
    taker: true,
    timestamp,
    trade_id: tradeId,
  };
}

function fundingPayment(funding: string, timestamp: number) {
  return {
    funding,
    funding_asset: 'USDC',
    funding_rate: '0.0001',
    id: Number(funding),
    instrument_id: 1,
    size: '1',
    timestamp,
  };
}

function mockPortfolioPosition(request: { size: string }) {
  return http.get(`${production.perps.rest}/v1/account/portfolio`, () =>
    HttpResponse.json({
      positions: [
        {
          cross: false,
          cumulative_funding: '0',
          entry_price: '100',
          initial_margin: '30',
          instrument_id: 1,
          leverage: 5,
          liquidation_price: '50',
          maintenance_margin: '10',
          position_value: '150',
          return_on_equity: '0',
          size: request.size,
          symbol: 'BTC-PERP',
          unrealized_pnl: '0',
        },
      ],
      margin: {
        total_account_value: '1000',
        total_initial_margin: '30',
        total_maintenance_margin: '10',
        total_position_value: '150',
      },
      withdrawable: '970',
      in_liquidation: false,
      timestamp: 1_700_000_000_000,
    }),
  );
}

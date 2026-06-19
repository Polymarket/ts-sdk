import { OrderSide } from '@polymarket/bindings';
import {
  type PerpsCredentials,
  PerpsPnlInterval,
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
import { RequestRejectedError } from '../../errors';
import { captureConnection, waitForNextEvent } from '../testing';
import { PerpsSession } from './session';

const perps = ws.link(production.perps.ws);
const server = setupServer();

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
          ],
        },
      ]);

      await session.close();
    });

    it('deduplicates balance ticks and emits resync on sequence gaps', async () => {
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
      await connection.send(balanceUpdate({ balance: '1', sequence: 2 }));
      await connection.send(balanceUpdate({ balance: '2', sequence: 4 }));

      await expect(nextEvent).resolves.toMatchObject({
        done: false,
        value: {
          channel: 'balances',
          previousSequence: 2,
          reason: 'sequence_gap',
          sequence: 4,
          type: 'resync',
        },
      });
      await expect(waitForNextEvent(session)).resolves.toMatchObject({
        done: false,
        value: {
          channel: 'balances',
          payload: { asset: 'USDC', balance: '2', value: '2' },
          sequence: 4,
          type: 'balance',
        },
      });

      await session.close();
    });

    it('advances sequence tracking when skipping deduped balance ticks', async () => {
      const connection = captureConnection(server, perps);
      const session = createSession();

      await session.connect();

      const firstEvent = waitForNextEvent(session);
      await connection.send(balanceUpdate({ balance: '1', sequence: 1 }));
      await expect(firstEvent).resolves.toMatchObject({
        done: false,
        value: {
          channel: 'balances',
          sequence: 1,
          type: 'balance',
        },
      });

      const nextEvent = waitForNextEvent(session);
      await connection.send(balanceUpdate({ balance: '1', sequence: 2 }));
      await connection.send(balanceUpdate({ balance: '2', sequence: 3 }));

      await expect(nextEvent).resolves.toMatchObject({
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

      const [ack] = await session.placeOrders({
        orders: [
          {
            clientOrderId: '0123456789abcdef0123456789abcdef',
            instrumentId: 1,
            postOnly: false,
            price: '100.00',
            quantity: '1.5',
            side: OrderSide.BUY,
            timeInForce: PerpsTimeInForce.Gtc,
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

    it('returns rejected order acknowledgements', async () => {
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
          session.placeOrder({
            clientOrderId: '0123456789abcdef0123456789abcdef',
            instrumentId: 1,
            price: '100',
            quantity: '1',
            side: OrderSide.BUY,
            timeInForce: PerpsTimeInForce.Ioc,
          }),
        ).resolves.toEqual({
          clientOrderId: '0123456789abcdef0123456789abcdef',
          status: 'err',
          error: 'order would cross post-only book',
        });
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
          session.placeOrders({
            orders: [
              {
                instrumentId: 1,
                price: '100',
                quantity: '1',
                side: OrderSide.BUY,
                timeInForce: PerpsTimeInForce.Ioc,
              },
              {
                instrumentId: 1,
                price: '101',
                quantity: '2',
                side: OrderSide.SELL,
                timeInForce: PerpsTimeInForce.Ioc,
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

    it('updates leverage over the session socket', async () => {
      const session = createSession();
      await session.connect();

      await expect(
        session.updateLeverage({
          crossMargin: false,
          instrumentId: 1,
          leverage: 5,
        }),
      ).resolves.toBeUndefined();
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

    it('throws when margin update is rejected', async () => {
      server.use(
        http.patch(`${production.perps.rest}/v1/trade/margin`, () => {
          return HttpResponse.json({
            status: 'err',
            error: 'invalid margin',
          });
        }),
      );
      const session = createSession();

      await expect(
        session.updateMargin({ amount: '1', instrumentId: 1 }),
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

    it('overlaps and dedupes descending account history pages', async () => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get(`${production.perps.rest}/v1/account/fills`, ({ request }) => {
          const params = new URL(request.url).searchParams;
          requests.push(params);

          if (params.get('end_timestamp') === '3000') {
            return HttpResponse.json({
              data: [accountFill(1, 3000), accountFill(2, 2000)],
              more: true,
            });
          }

          return HttpResponse.json({
            data: [accountFill(2, 2000), accountFill(3, 1000)],
            more: false,
          });
        }),
      );
      const session = createSession();
      const pages = session.listFills({ end: 3000, start: 0 });

      const first = await pages.firstPage();
      const second = await pages.from(first.nextCursor).firstPage();

      expect(first.items.map((fill) => fill.tradeId)).toEqual([1, 2]);
      expect(second.items.map((fill) => fill.tradeId)).toEqual([3]);
      expect(requests.map((params) => params.get('end_timestamp'))).toEqual([
        '3000',
        '2000',
      ]);
    });

    it('continues descending account history after a fully deduped boundary page', async () => {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get(`${production.perps.rest}/v1/account/fills`, ({ request }) => {
          const params = new URL(request.url).searchParams;
          requests.push(params);

          if (params.get('end_timestamp') === '3000') {
            return HttpResponse.json({
              data: [accountFill(1, 3000), accountFill(2, 2000)],
              more: true,
            });
          }

          if (params.get('end_timestamp') === '2000') {
            return HttpResponse.json({
              data: [accountFill(2, 2000)],
              more: true,
            });
          }

          return HttpResponse.json({
            data: [accountFill(3, 1000)],
            more: false,
          });
        }),
      );
      const session = createSession();
      const pages = session.listFills({ end: 3000, start: 0 });

      const first = await pages.firstPage();
      const second = await pages.from(first.nextCursor).firstPage();
      const third = await pages.from(second.nextCursor).firstPage();

      expect(first.items.map((fill) => fill.tradeId)).toEqual([1, 2]);
      expect(second.items).toEqual([]);
      expect(second.hasMore).toBe(true);
      expect(third.items.map((fill) => fill.tradeId)).toEqual([3]);
      expect(requests.map((params) => params.get('end_timestamp'))).toEqual([
        '3000',
        '2000',
        '1999',
      ]);
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

function mockCommandSession(
  responder: (frame: {
    op?: { type?: string };
    req?: string;
  }) => unknown = responseForFrame,
): unknown[] {
  const frames: unknown[] = [];

  server.use(
    perps.addEventListener('connection', ({ client }) => {
      client.addEventListener('message', (event) => {
        const frame = JSON.parse(String(event.data));
        frames.push(frame);
        client.send(
          JSON.stringify({
            id: frame.id,
            data: responder(frame),
          }),
        );
      });
    }),
  );

  return frames;
}

function responseForFrame(frame: { op?: { type?: string }; req?: string }) {
  if (frame.req === 'sub') return [{ status: 'ok' }];
  switch (frame.op?.type) {
    case 'auth':
      return { status: 'ok' };
    case 'createOrders':
      return [
        {
          coid: '0123456789abcdef0123456789abcdef',
          oid: 123,
          status: 'ok',
        },
      ];
    case 'updateLeverage':
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

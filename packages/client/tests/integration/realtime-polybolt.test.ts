import { afterEach, describe, expect, vi } from 'vitest';
import type { SubscriptionHandle } from '../../src/actions/subscriptions';
import { ConnectionLostError, UserInputError } from '../../src/errors';
import { environment, it } from './fixtures';

type SentOperation = {
  op?: string;
  subscriptions?: { channel: string; filter: object }[];
};
const NativeWebSocket = globalThis.WebSocket;
class ObservedWebSocket extends NativeWebSocket {
  static connections: ObservedWebSocket[] = [];
  readonly operations: SentOperation[] = [];
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    ObservedWebSocket.connections.push(this);
  }
  override send(data: string | Blob | BufferSource): void {
    if (typeof data === 'string') {
      const { op, subscriptions } = JSON.parse(data) as SentOperation;
      // Never retain authentication payloads in diagnostics.
      this.operations.push({ op, subscriptions });
    }
    super.send(data);
  }
}

async function first<T>(
  handle: SubscriptionHandle<T>,
  predicate: (event: T) => boolean,
): Promise<T> {
  const timeout = setTimeout(() => {
    void handle.close();
  }, 15_000);
  try {
    for await (const event of handle) if (predicate(event)) return event;
    throw new Error('No matching realtime event within 15 seconds.');
  } finally {
    clearTimeout(timeout);
    await handle.close();
  }
}

describe.skipIf(environment.rtds.protocol !== 'polybolt')(
  'realtime staging transport',
  () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      ObservedWebSocket.connections = [];
    });

    it('delivers each update once for duplicate canonical symbols', async ({
      secureClientWithDepositWallet: client,
    }) => {
      const handle = await client.subscribe([
        { topic: 'prices.crypto', symbols: ['btcusd', 'BTCUSD'] },
      ]);
      const sequences: (number | undefined)[] = [];
      const timer = setTimeout(() => {
        void handle.close();
      }, 15_000);
      try {
        for await (const event of handle) {
          if (event.type !== 'update') continue;
          sequences.push(event.seq);
          if (sequences.length === 2) break;
        }
        expect(sequences).toHaveLength(2);
        expect(sequences[0]).not.toBe(sequences[1]);
      } finally {
        clearTimeout(timer);
        await client.closeSubscriptions();
      }
    });

    it('authenticates, shares keys, batches filters and grows beyond 64 keys', async ({
      secureClientWithDepositWallet: client,
    }) => {
      vi.stubGlobal('WebSocket', ObservedWebSocket);
      try {
        const handles = await Promise.all(
          Array.from({ length: 70 }, (_, index) =>
            client.subscribe([
              { topic: 'prices.polymarket', assetIds: [String(index + 1)] },
            ]),
          ),
        );
        expect(ObservedWebSocket.connections).toHaveLength(2);
        for (const socket of ObservedWebSocket.connections)
          expect(socket.operations[0]?.op).toBe('auth');
        expect(
          ObservedWebSocket.connections
            .flatMap((socket) => socket.operations)
            .filter((op) => op.op === 'subscribe')
            .map((op) => op.subscriptions?.length)
            .sort(),
        ).toEqual([6, 64]);
        const duplicate = await client.subscribe([
          { topic: 'prices.polymarket', assetIds: ['0001'] },
        ]);
        expect(ObservedWebSocket.connections).toHaveLength(2);
        await duplicate.close();
        expect(
          ObservedWebSocket.connections[0]?.operations.filter(
            (op) => op.op === 'unsubscribe',
          ),
        ).toHaveLength(0);
        await Promise.all(handles.slice(1).map((handle) => handle.close()));
        await expect
          .poll(
            () =>
              ObservedWebSocket.connections.filter(
                (socket) => socket.readyState === NativeWebSocket.OPEN,
              ).length,
          )
          .toBe(1);
        await handles[0]?.close();
      } finally {
        await client.closeSubscriptions();
      }
    });

    it('delivers source-neutral and alias live events with producer precision', async ({
      secureClientWithDepositWallet: client,
    }) => {
      try {
        const specs = [
          { topic: 'prices.crypto', symbols: ['btcusd', 'BTCUSD', 'ethusd'] },
          { topic: 'prices.crypto.binance', symbols: ['btcusd'] },
          {
            topic: 'prices.crypto.twap',
            symbols: ['btc/usd'],
            windowSeconds: 60,
          },
          {
            topic: 'prices.crypto.chainlink.twap',
            symbols: ['BTC/USD'],
            windowSeconds: 60,
          },
          { topic: 'prices.equity', symbol: 'aapl' },
          { topic: 'prices.equity.pyth', symbol: 'aapl' },
        ] as const;
        await Promise.all(
          specs.map(async (spec) => {
            const event = await first(
              await client.subscribe([spec]),
              (event) => event.type === 'update',
            );
            expect(event.topic).toBe(spec.topic);
            expect(event.seq).toBeGreaterThan(0);
            if (event.type === 'update')
              expect(typeof event.payload.value).toBe('string');
            if ('windowSeconds' in event.payload) {
              expect(event.payload.windowSeconds).toBe(60);
              expect(event.payload.symbol).toBe('btc/usd');
            }
          }),
        );
      } finally {
        await client.closeSubscriptions();
      }
    });

    it('delivers snapshot barriers, isolates windows and opts aliases into history', async ({
      secureClientWithDepositWallet: client,
    }) => {
      try {
        for (const windowSeconds of [30, 60] as const) {
          const event = await first(
            await client.subscribe([
              {
                topic: 'prices.crypto.chainlink.twap',
                symbols: ['btc/usd'],
                windowSeconds,
                includeSnapshot: true,
              },
            ]),
            (event) => event.type === 'subscribe',
          );
          expect(event.type).toBe('subscribe');
          expect(event.payload.windowSeconds).toBe(windowSeconds);
        }
        const equity = await first(
          await client.subscribe([{ topic: 'prices.equity', symbol: 'aapl' }]),
          (event) => event.type === 'subscribe',
        );
        expect(equity.type).toBe('subscribe');
      } finally {
        await client.closeSubscriptions();
      }
    });

    it('rejects missing filters and public access before opening a socket', async ({
      publicClient,
      secureClientWithDepositWallet: client,
    }) => {
      vi.stubGlobal('WebSocket', ObservedWebSocket);
      await expect(
        client.subscribe([{ topic: 'prices.crypto', symbols: [] }]),
      ).rejects.toBeInstanceOf(UserInputError);
      await expect(
        client.subscribe([{ topic: 'prices.crypto.binance' }]),
      ).rejects.toBeInstanceOf(UserInputError);
      await expect(
        publicClient.subscribe([
          { topic: 'prices.crypto.binance', symbols: ['btcusd'] },
        ]),
      ).rejects.toBeInstanceOf(UserInputError);
      expect(ObservedWebSocket.connections).toHaveLength(0);
    });

    it('refreshes a dropped channel and ends policy/auth closures without reconnecting', async ({
      secureClientWithDepositWallet: client,
    }) => {
      vi.stubGlobal('WebSocket', ObservedWebSocket);
      try {
        const handle = await client.subscribe([
          { topic: 'prices.crypto', symbols: ['btcusd', 'ethusd'] },
        ]);
        const socket = ObservedWebSocket.connections[0];
        expect(socket).toBeDefined();
        // Staging cannot be induced to drop on demand: inject only the loss signal.
        socket?.dispatchEvent(
          new MessageEvent('message', {
            data: JSON.stringify({
              v: 1,
              channel: 'price.crypto',
              seq: 1,
              ts: Date.now(),
              dropped: 1,
              payload: {},
            }),
          }),
        );
        await expect
          .poll(
            () =>
              socket?.operations.filter((op) => op.op === 'subscribe').length,
          )
          .toBe(2);
        expect(socket?.operations.slice(-2).map((op) => op.op)).toEqual([
          'unsubscribe',
          'subscribe',
        ]);
        await handle.close();
        await client.closeSubscriptions();
        for (const code of [4001, 4008]) {
          const active = await client.subscribe([
            { topic: 'prices.polymarket', assetIds: ['1'] },
          ]);
          const current = ObservedWebSocket.connections.at(-1);
          const consuming = (async () => {
            for await (const _event of active) {
              /* Wait for terminal error. */
            }
          })();
          const assertion =
            expect(consuming).rejects.toBeInstanceOf(ConnectionLostError);
          // The edge does not echo client close codes. Inject the terminal code
          // at the transport boundary, then close the actual staging connection.
          current?.dispatchEvent(
            new CloseEvent('close', {
              code,
              reason: 'integration policy boundary',
            }),
          );
          current?.close();
          await assertion;
        }
      } finally {
        await client.closeSubscriptions();
      }
    });
  },
);

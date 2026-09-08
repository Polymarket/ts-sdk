import { describe, expect, vi } from 'vitest';
import { environment, it } from './fixtures';

describe.skipIf(
  environment.rtds.protocol !== 'polybolt' ||
    process.env.POLYMARKET_REALTIME_SOAK !== '1',
)('realtime staging soak', () => {
  it('streams 100 filters for 30 minutes', async ({
    secureClientWithDepositWallet: client,
  }) => {
    const NativeWebSocket = globalThis.WebSocket;
    const closes: number[] = [];
    const errors: string[] = [];
    let connections = 0;
    let drops = 0;
    let updates = 0;
    class ObservedSocket extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        connections++;
        console.info(
          JSON.stringify({
            event: 'connect',
            connection: connections,
            at: Date.now(),
          }),
        );
        this.addEventListener('close', (event) => {
          closes.push(event.code);
          console.info(
            JSON.stringify({
              event: 'close',
              code: event.code,
              at: Date.now(),
            }),
          );
        });
        this.addEventListener('message', ({ data }) => {
          const frame = JSON.parse(String(data)) as {
            op?: string;
            code?: string;
            dropped?: number;
          };
          if (frame.op === 'error' && frame.code) errors.push(frame.code);
          drops += frame.dropped ?? 0;
        });
      }
    }
    vi.stubGlobal('WebSocket', ObservedSocket);
    // Representative filters; feed coverage is verified separately from connection load.
    const equities =
      'aapl msft nvda amzn googl meta tsla amd spy qqq avgo brkb jpm lly xom unh v ma cost hd pg jnj abbv bac nflx crm ko cvx orcl mrk csco acn tmo wmt mcd abt lin adbe dis wfc ibm ge cat intc qcom txs amgn pfe nke pm int ubs gs ms c axp now isrg uber panw shop arm coin pltr snow ddog crwd nke1 roku sq pypl abnb dash zs net twlo spot rblx hood sofi dkng mu amat lrcx klac asml smh iwm dia gl d oil uso tlt'
        .split(' ')
        .slice(0, 94);
    const symbols = [...new Set(equities)];
    while (symbols.length < 94) symbols.push(`coverage${symbols.length}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const handle = await client.subscribe([
        ...symbols.map((symbol) => ({
          topic: 'prices.equity' as const,
          symbol,
        })),
        {
          topic: 'prices.crypto',
          symbols: ['btcusd', 'ethusd', 'solusd', 'xrpusd'],
        },
        { topic: 'prices.crypto.twap', symbols: ['btcusd'], windowSeconds: 30 },
        { topic: 'prices.crypto.twap', symbols: ['btcusd'], windowSeconds: 60 },
      ]);
      expect(connections).toBe(2);
      timer = setTimeout(() => {
        void handle.close();
      }, 30 * 60_000);
      for await (const event of handle) if (event.type === 'update') updates++;
      expect(closes).not.toContain(4001);
      expect(closes).not.toContain(4008);
      expect(errors).toEqual([]);
      expect(updates).toBeGreaterThan(0);
    } finally {
      clearTimeout(timer);
      await client.closeSubscriptions();
      vi.unstubAllGlobals();
      console.info(
        JSON.stringify({ connections, closes, errors, drops, updates }),
      );
    }
  }, 1_850_000);
});

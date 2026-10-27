import { TradeStatus, TxHashSchema } from '@polymarket/bindings';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError, TransactionFailedError } from '../../errors';
import {
  type OrderFillSnapshot,
  pollOrderFillSettlement,
  type SettlementTrade,
} from './settlement-polling';

const readTrades = vi.fn<(id: string) => Promise<readonly SettlementTrade[]>>();

function makeOrderFillSnapshot(
  overrides: Partial<OrderFillSnapshot> = {},
): OrderFillSnapshot {
  return {
    orderId: '0xorder',
    tradeIds: [],
    transactionsHashes: [],
    ...overrides,
  };
}

function makeTrade(overrides: Partial<SettlementTrade> = {}): SettlementTrade {
  return {
    id: 'trade-1',
    status: TradeStatus.Matched,
    transactionHash: '',
    ...overrides,
  };
}

function mockTradesPages(...pages: SettlementTrade[][]) {
  for (const items of pages) readTrades.mockResolvedValueOnce(items);
}

const TX_HASH =
  '0x1111111111111111111111111111111111111111111111111111111111111111';
const OTHER_TX_HASH =
  '0x2222222222222222222222222222222222222222222222222222222222222222';

afterEach(() => {
  readTrades.mockReset();
  vi.useRealTimers();
});

describe('order fill settlement polling', () => {
  it('resolves immediately to an empty array when the order had no fills', async () => {
    const hashes = await pollOrderFillSettlement(
      makeOrderFillSnapshot(),
      30_000,
      readTrades,
    );

    expect(hashes).toEqual([]);
    expect(readTrades).not.toHaveBeenCalled();
  });

  it('returns hashes delivered with the order response when there are no trade ids to poll', async () => {
    const hashes = await pollOrderFillSettlement(
      makeOrderFillSnapshot({
        transactionsHashes: [TxHashSchema.parse(TX_HASH)],
      }),
      30_000,
      readTrades,
    );

    expect(hashes).toEqual([TX_HASH]);
    expect(readTrades).not.toHaveBeenCalled();
  });

  it('polls trade ids even when the order response includes hashes', async () => {
    mockTradesPages([
      makeTrade({ status: TradeStatus.Confirmed, transactionHash: TX_HASH }),
    ]);

    const hashes = await pollOrderFillSettlement(
      makeOrderFillSnapshot({
        tradeIds: ['trade-1'],
        transactionsHashes: [TxHashSchema.parse(OTHER_TX_HASH)],
      }),
      30_000,
      readTrades,
    );

    expect(hashes).toEqual([TX_HASH]);
    expect(readTrades).toHaveBeenCalledWith('trade-1');
  });

  it('polls until every fill confirms and returns the hashes', async () => {
    mockTradesPages(
      // A hash before confirmation is not terminal: it can still be
      // replaced if the transaction is retried.
      [
        makeTrade({
          status: TradeStatus.Mined,
          transactionHash: OTHER_TX_HASH,
        }),
      ],
      [makeTrade({ status: TradeStatus.Confirmed, transactionHash: TX_HASH })],
    );

    const hashes = await pollOrderFillSettlement(
      makeOrderFillSnapshot({ tradeIds: ['trade-1'] }),
      30_000,
      readTrades,
    );

    expect(hashes).toEqual([TX_HASH]);
    expect(readTrades).toHaveBeenCalledTimes(2);
    expect(readTrades).toHaveBeenCalledWith('trade-1');
  });

  it('returns settled hashes when only some fills fail execution', async () => {
    mockTradesPages(
      [makeTrade({ id: 'trade-1', status: TradeStatus.Failed })],
      [
        makeTrade({
          id: 'trade-2',
          status: TradeStatus.Confirmed,
          transactionHash: OTHER_TX_HASH,
        }),
      ],
    );

    const hashes = await pollOrderFillSettlement(
      makeOrderFillSnapshot({ tradeIds: ['trade-1', 'trade-2'] }),
      30_000,
      readTrades,
    );

    expect(hashes).toEqual([OTHER_TX_HASH]);
  });

  it('throws TransactionFailedError when every fill fails execution', async () => {
    mockTradesPages([makeTrade({ status: TradeStatus.Failed })]);

    await expect(
      pollOrderFillSettlement(
        makeOrderFillSnapshot({ tradeIds: ['trade-1'] }),
        30_000,
        readTrades,
      ),
    ).rejects.toThrow(TransactionFailedError);
  });

  it('throws TimeoutError when fills are still settling at the deadline', async () => {
    vi.useFakeTimers();
    readTrades.mockResolvedValue([makeTrade()]);

    const result = expect(
      pollOrderFillSettlement(
        makeOrderFillSnapshot({ tradeIds: ['trade-1'] }),
        1,
        readTrades,
      ),
    ).rejects.toThrow(TimeoutError);
    await vi.advanceTimersByTimeAsync(250);
    await result;
  });
});

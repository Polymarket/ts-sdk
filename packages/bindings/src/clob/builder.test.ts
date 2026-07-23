import { describe, expect, it } from 'vitest';
import { BuilderTradeSchema } from './builder';

const baseBuilderTrade = {
  id: 'trade-1',
  tradeType: 'TAKER',
  takerOrderHash: `0x${'aa'.repeat(32)}`,
  builder: 'builder-code',
  market: `0x${'bb'.repeat(32)}`,
  assetId: '1',
  side: 'BUY',
  size: '1.5',
  sizeUsdc: '0.75',
  price: '0.5',
  status: 'TRADE_STATUS_CONFIRMED',
  outcome: 'Yes',
  outcomeIndex: 0,
  owner: 'owner-1',
  maker: `0x${'cc'.repeat(20)}`,
  transactionHash: `0x${'dd'.repeat(32)}`,
  bucketIndex: 7,
  fee: '0',
  feeUsdc: '0.01',
};

describe('BuilderTradeSchema', () => {
  it('normalizes legacy matchTime epoch seconds strings', () => {
    const trade = BuilderTradeSchema.parse({
      ...baseBuilderTrade,
      matchTime: '1777996829',
      createdAt: '2026-05-05T16:00:30.00756Z',
      updatedAt: '2026-05-05T16:00:40.877478Z',
    });

    expect(trade.conditionId).toBe(baseBuilderTrade.market);
    expect(trade).not.toHaveProperty('market');
    expect(trade.matchedAt).toBe('2026-05-05T16:00:29.000Z');
    expect(trade.createdAt).toBe('2026-05-05T16:00:30.00756Z');
    expect(trade.updatedAt).toBe('2026-05-05T16:00:40.877478Z');
  });

  it('still accepts matchTime epoch milliseconds', () => {
    const trade = BuilderTradeSchema.parse({
      ...baseBuilderTrade,
      matchTime: '1777996829000',
    });

    expect(trade.matchedAt).toBe('2026-05-05T16:00:29.000Z');
  });

  it('still accepts ISO matchTime strings', () => {
    const trade = BuilderTradeSchema.parse({
      ...baseBuilderTrade,
      matchTime: '2026-05-05T16:00:29Z',
    });

    expect(trade.matchedAt).toBe('2026-05-05T16:00:29Z');
  });
});

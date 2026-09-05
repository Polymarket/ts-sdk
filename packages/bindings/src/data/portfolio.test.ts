import { describe, expect, it } from 'vitest';
import {
  FetchPortfolioValueResponseSchema,
  FetchUserPnlResponseSchema,
  FetchUserStatsResponseSchema,
  FetchUserVolumeResponseSchema,
} from './portfolio';

const WALLET = `0x${'1'.repeat(40)}`;

describe('FetchPortfolioValueResponseSchema', () => {
  it('normalizes a numeric portfolio value to a decimal string', () => {
    const value = FetchPortfolioValueResponseSchema.parse({
      data: {
        proxy_wallet: WALLET,
        value: 12.3456,
      },
    });

    expect(value).toEqual({ wallet: WALLET, value: '12.3456' });
  });

  it('accepts an already-string decimal value', () => {
    expect(
      FetchPortfolioValueResponseSchema.parse({
        data: {
          proxy_wallet: WALLET,
          value: '12.3456',
        },
      }),
    ).toEqual({ wallet: WALLET, value: '12.3456' });
  });
});

describe('FetchUserStatsResponseSchema', () => {
  it('normalizes profile stats and the latest PnL point', () => {
    const stats = FetchUserStatsResponseSchema.parse({
      data: {
        proxy_wallet: WALLET,
        trades: 42,
        biggest_win: 123.456789,
        views: 7,
        join_date: 1_700_000_000,
        all_time_pnl: userPnlPoint(),
      },
    });

    expect(stats).toMatchObject({
      wallet: WALLET,
      tradedMarketCount: 42,
      biggestWin: '123.456789',
      views: 7,
      joinDate: 1_700_000_000_000,
      allTimePnl: {
        timestamp: 1_700_000_100_000,
        sourceBlock: 12_345,
        realizedMarketPnl: '10.123456',
        realizedLpPnl: '2.5',
        realizedComboPnl: '-1.25',
        realizedPnl: '11.373456',
        unrealizedPnl: null,
        fees: '-0.5',
        feesPaid: '-0.25',
        volume: '1000.123456',
        volumeUsdc: '750.654321',
        tradeCount: 99,
      },
    });
  });

  it('preserves an unknown wallet as null', () => {
    expect(FetchUserStatsResponseSchema.parse({ data: null })).toBeNull();
  });

  it('normalizes omitted optional profile fields to null', () => {
    expect(
      FetchUserStatsResponseSchema.parse({
        data: {
          proxy_wallet: WALLET,
          trades: 0,
          biggest_win: 0,
          views: 0,
        },
      }),
    ).toEqual({
      wallet: WALLET,
      tradedMarketCount: 0,
      biggestWin: '0',
      views: 0,
      joinDate: null,
      allTimePnl: null,
    });
  });
});

describe('FetchUserPnlResponseSchema', () => {
  it('normalizes the series metadata and points', () => {
    expect(
      FetchUserPnlResponseSchema.parse({
        data: {
          proxy_wallet: WALLET,
          interval: '1w',
          fidelity: '3h',
          source_fidelity: '1d',
          points: [userPnlPoint()],
        },
      }),
    ).toMatchObject({
      wallet: WALLET,
      interval: '1w',
      fidelity: '3h',
      sourceFidelity: '1d',
      points: [
        {
          timestamp: 1_700_000_100_000,
          realizedPnl: '11.373456',
          unrealizedPnl: null,
        },
      ],
    });
  });
});

describe('FetchUserVolumeResponseSchema', () => {
  it('normalizes volume amounts to decimal strings', () => {
    expect(
      FetchUserVolumeResponseSchema.parse({
        data: {
          volume: 1000.123456,
          volume_usdc: '750.654321',
          trade_count: 99,
        },
      }),
    ).toEqual({
      volume: '1000.123456',
      volumeUsdc: '750.654321',
      tradeCount: 99,
    });
  });
});

function userPnlPoint() {
  return {
    timestamp: 1_700_000_100,
    source_block: 12_345,
    realized_market_pnl: 10.123456,
    realized_lp_pnl: 2.5,
    realized_combo_pnl: -1.25,
    unrealized_pnl: null,
    fees_refunded: 0.25,
    maker_rebate: 0.1,
    taker_rebate: 0.2,
    reward_income: 1,
    yield_income: 0.5,
    referral_income: 0.25,
    deposits: null,
    withdrawals: null,
    realized_pnl: 11.373456,
    wallet_income: 2.05,
    position_pnl: null,
    settled_pnl: 13.423456,
    economic_pnl: null,
    trade_pnl: 10.873456,
    sponsored_income: 1.75,
    fees: -0.5,
    fees_paid: '-0.25',
    cashflow_net: null,
    volume: 1_000.123456,
    volume_usdc: 750.654321,
    trade_count: 99,
  };
}

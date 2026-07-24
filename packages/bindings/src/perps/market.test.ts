import { describe, expect, it } from 'vitest';
import {
  PerpsFundingIntervalSchema,
  PerpsInstrumentSchema,
  PerpsPublicTradeSchema,
  PerpsPublicTradeUpdateSchema,
} from './market';

const txHash = `0x${'1'.repeat(64)}`;

describe('PerpsFundingIntervalSchema', () => {
  it('accepts positive whole-hour funding intervals', () => {
    expect(PerpsFundingIntervalSchema.parse('1h')).toBe('1h');
    expect(PerpsFundingIntervalSchema.parse('8h')).toBe('8h');
  });

  it('rejects unsupported funding interval formats', () => {
    expect(() => PerpsFundingIntervalSchema.parse('0h')).toThrow();
    expect(() => PerpsFundingIntervalSchema.parse('30m')).toThrow();
    expect(() => PerpsFundingIntervalSchema.parse('1.5h')).toThrow();
  });
});

describe('PerpsInstrumentSchema', () => {
  it('normalizes instrument identifiers without exposing instrument type', () => {
    const instrument = PerpsInstrumentSchema.parse({
      base_asset: 'BTC',
      category: 'crypto',
      funding_interval: '1h',
      instrument_id: 1,
      instrument_type: 'perpetual',
      isolated_only: true,
      liquidation_fee: '0.01',
      max_leverage: 10,
      max_limit_notional: '1000000',
      max_market_notional: '100000',
      max_order_count: 200,
      min_notional: '1',
      price_bounds: '0.1',
      price_decimals: 2,
      quantity_decimals: 4,
      quote_asset: 'USD',
      risk_tiers: [{ lower_bound: '0', max_leverage: 10 }],
      symbol: 'BTC-PERP',
    });

    expect(instrument).toMatchObject({
      id: 1,
      category: 'crypto',
      symbol: 'BTC-PERP',
      isolatedOnly: true,
    });
    expect(instrument).not.toHaveProperty('instrumentId');
    expect(instrument).not.toHaveProperty('instrumentType');
  });
});

describe('PerpsPublicTradeSchema', () => {
  it('normalizes placeholder hashes to undefined', () => {
    const trade = PerpsPublicTradeSchema.parse({
      trade_id: 1,
      instrument_id: 6,
      side: 'long',
      price: '1',
      quantity: '2',
      timestamp: 1_700_000_000_000,
      hash: '0x',
    });

    expect(trade.hash).toBeUndefined();
  });

  it('preserves valid transaction hashes', () => {
    const trade = PerpsPublicTradeSchema.parse({
      trade_id: 1,
      instrument_id: 6,
      side: 'long',
      price: '1',
      quantity: '2',
      timestamp: 1_700_000_000_000,
      hash: txHash,
    });

    expect(trade.hash).toBe(txHash);
  });
});

describe('PerpsPublicTradeUpdateSchema', () => {
  it('normalizes compact placeholder hashes to undefined', () => {
    const trade = PerpsPublicTradeUpdateSchema.parse({
      tid: 1,
      iid: 6,
      side: 'long',
      p: '1',
      qty: '2',
      ts: 1_700_000_000_000,
      hash: '0x',
    });

    expect(trade.hash).toBeUndefined();
  });
});

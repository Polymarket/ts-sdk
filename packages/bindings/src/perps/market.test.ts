import { describe, expect, it } from 'vitest';
import { PerpsMarketDataEventSchema } from '../subscriptions/perps';
import {
  PerpsFeeScheduleEntrySchema,
  PerpsFundingIntervalSchema,
  PerpsInstrumentSchema,
  PerpsInstrumentSettlementSchema,
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

const baseInstrument = {
  base_asset: 'BTC',
  category: 'crypto',
  funding_interval: '1h',
  instrument_id: 1,
  instrument_type: 'perpetual',
  isolated_only: true,
  close_only: true,
  display_symbol: 'BTC-USD',
  settlement: {
    sequence: Number.MAX_SAFE_INTEGER,
    timestamp: 1751500000001,
    price: '9007199254740993.00000001',
    insurance_debit: '0.000000000000000001',
  },
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
};

describe('PerpsInstrumentSchema', () => {
  it('normalizes instrument identifiers without exposing instrument type', () => {
    const instrument = PerpsInstrumentSchema.parse(baseInstrument);

    expect(instrument).toMatchObject({
      id: 1,
      category: 'crypto',
      symbol: 'BTC-PERP',
      isolatedOnly: true,
      closeOnly: true,
      displaySymbol: 'BTC-USD',
      settlement: {
        sequence: Number.MAX_SAFE_INTEGER,
        timestamp: 1751500000001,
        price: '9007199254740993.00000001',
        insuranceDebit: '0.000000000000000001',
      },
    });
    expect(instrument).not.toHaveProperty('instrumentId');
    expect(instrument).not.toHaveProperty('instrumentType');
  });
});

describe('PerpsFeeScheduleEntrySchema', () => {
  it('normalizes volume tiers including negative maker rates', () => {
    const entry = PerpsFeeScheduleEntrySchema.parse({
      instrument_type: 'perpetual',
      category: 'crypto',
      taker_fee_rate: '0.00045',
      maker_fee_rate: '0.00015',
      tiers: [
        {
          min_volume_30d: '0',
          taker_fee_rate: '0.00045',
          maker_fee_rate: '0.00015',
        },
        {
          min_volume_30d: '5000000',
          taker_fee_rate: '0.0002',
          maker_fee_rate: '-0.00005',
        },
      ],
    });

    expect(entry).toEqual({
      category: 'crypto',
      takerFeeRate: '0.00045',
      makerFeeRate: '0.00015',
      tiers: [
        {
          minVolume30d: '0',
          takerFeeRate: '0.00045',
          makerFeeRate: '0.00015',
        },
        {
          minVolume30d: '5000000',
          takerFeeRate: '0.0002',
          makerFeeRate: '-0.00005',
        },
      ],
    });
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

describe('public settlement trades', () => {
  it.each([
    {},
    { settlement: false },
    { settlement: true },
  ])('preserves REST and WS flags: %j', (metadata) => {
    const expanded = PerpsPublicTradeSchema.parse({
      trade_id: 3,
      instrument_id: 1,
      side: 'long',
      price: '123.000000000000000001',
      quantity: '2',
      timestamp: 1751500000001,
      hash: '0x',
      ...metadata,
    });
    const compact = PerpsPublicTradeUpdateSchema.parse({
      tid: 3,
      iid: 1,
      side: 'long',
      p: '123.000000000000000001',
      qty: '2',
      ts: 1751500000001,
      hash: '0x',
      ...metadata,
    });
    expect(expanded).toEqual(compact);
    expect(expanded.settlement).toBe(metadata.settlement ?? false);
    expect(expanded.price).toBe('123.000000000000000001');
  });
});

describe('legacy instrument metadata and sequence precision', () => {
  it.each([
    undefined,
    false,
  ])('accepts omitted metadata and close_only=%j', (closeOnly) => {
    const instrument = PerpsInstrumentSchema.parse({
      ...baseInstrument,
      close_only: closeOnly,
      display_symbol: undefined,
      settlement: undefined,
    });
    expect(instrument.closeOnly).toBe(false);
    expect(instrument.displaySymbol).toBeUndefined();
    expect(instrument.settlement).toBeUndefined();
  });
  it('rejects unsafe settlement sequences instead of silently rounding them', () => {
    expect(() =>
      PerpsInstrumentSettlementSchema.parse({
        ...baseInstrument.settlement,
        sequence: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow();
  });
});

describe('Perps market event horizons', () => {
  it.each([
    { ch: 'trades::1', data: [] },
    { ch: 'book::1', data: { b: [], a: [] } },
    { ch: 'bbo::1', data: { iid: 1, bp: '1', bq: '2', ap: '3', aq: '4' } },
    {
      ch: 'tickers::all',
      data: {
        iid: 1,
        idx: '1',
        mark: '1',
        last: '1',
        mid: '1',
        oi: '0',
        fr: '0',
        nxf: 1_767_225_600_000,
      },
    },
    {
      ch: 'statistics::all',
      data: { iid: 1, vol: '0', open: '1', klines: [] },
    },
    { ch: 'klines::1::1m', data: [] },
  ])('preserves the event horizon independently of send time on $ch', (frame) => {
    const wire = {
      ...frame,
      ts: 1_767_225_600_100,
      sq: 42,
      ets: 1_767_225_600_000,
    };
    expect(PerpsMarketDataEventSchema.parse(wire)).toMatchObject({
      timestamp: wire.ts,
      eventTimestamp: wire.ets,
      sequence: wire.sq,
    });
    expect(
      PerpsMarketDataEventSchema.parse({ ...wire, ets: 0 }).eventTimestamp,
    ).toBe(0);
    const { ets: _horizon, ...missing } = wire;
    expect(PerpsMarketDataEventSchema.safeParse(missing).success).toBe(false);
    expect(
      PerpsMarketDataEventSchema.safeParse({ ...wire, ets: null }).success,
    ).toBe(false);
  });
});

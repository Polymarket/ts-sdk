import { describe, expect, it } from 'vitest';
import { PerpsPortfolioUpdateEventSchema } from '../subscriptions/perps';
import { PerpsPortfolioSchema } from './account';

const portfolio = {
  positions: [
    {
      instrument_id: 1,
      symbol: 'BTC-PERP',
      size: '1',
      entry_price: '100',
      leverage: 5,
      cross: false,
      initial_margin: '20',
      maintenance_margin: '10',
      position_value: '100',
      liquidation_price: '80',
      unrealized_pnl: '0',
      return_on_equity: '0',
      cumulative_funding: '0',
      adl_index: 3,
    },
  ],
  margin: {
    total_account_value: '9007199254740993.00000001',
    available_order_margin: '9007199254740992.00000001',
    total_initial_margin: '20',
    total_maintenance_margin: '10',
    total_position_value: '100',
  },
  withdrawable: '9007199254740992',
  in_liquidation: false,
  fee_tier: 2,
  timestamp: 1_700_000_000_000,
};

describe('Perps portfolio risk data', () => {
  it('retains exact available collateral and risk tiers in reads and updates', () => {
    const snapshot = PerpsPortfolioSchema.parse(portfolio);
    const update = PerpsPortfolioUpdateEventSchema.parse({
      ch: 'portfolio',
      ts: 1_700_000_000_001,
      ets: 1_700_000_000_000,
      sq: 1,
      data: portfolio,
    });

    expect(snapshot.margin.availableOrderMargin).toBe(
      '9007199254740992.00000001',
    );
    expect(snapshot.feeTier).toBe(2);
    expect(snapshot.positions[0]?.adlIndex).toBe(3);
    expect(update.payload).toEqual(snapshot);
  });

  it('rejects absent risk data instead of inventing account values', () => {
    const { fee_tier: _feeTier, ...missingTier } = portfolio;
    const { available_order_margin: _available, ...missingAvailable } =
      portfolio.margin;
    const { adl_index: _adlIndex, ...missingAdlIndex } = portfolio.positions[0];

    expect(PerpsPortfolioSchema.safeParse(missingTier).success).toBe(false);
    expect(
      PerpsPortfolioSchema.safeParse({ ...portfolio, margin: missingAvailable })
        .success,
    ).toBe(false);
    expect(
      PerpsPortfolioSchema.safeParse({
        ...portfolio,
        positions: [missingAdlIndex],
      }).success,
    ).toBe(false);
  });

  it.each([
    -1,
    4,
    1.5,
    true,
  ])('rejects unsupported ADL tier %s', (adl_index) => {
    expect(
      PerpsPortfolioSchema.safeParse({
        ...portfolio,
        positions: [{ ...portfolio.positions[0], adl_index }],
      }).success,
    ).toBe(false);
  });
});

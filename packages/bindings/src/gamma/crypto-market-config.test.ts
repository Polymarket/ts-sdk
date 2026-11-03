import { describe, expect, it } from 'vitest';
import { FetchCryptoMarketConfigsResponseSchema } from './crypto-market-config';

describe('crypto market configuration catalog', () => {
  it('preserves plain and TWAP variants without inventing a lookback', () => {
    const plain = {
      id: 'btc-5m',
      asset: 'btc',
      duration: '5m',
      twapEnabled: false,
    };
    const twap = {
      ...plain,
      id: 'btc-5m-twap-60',
      twapEnabled: true,
      twapLookbackSeconds: 60,
    };
    expect(FetchCryptoMarketConfigsResponseSchema.parse([plain, twap])).toEqual(
      [plain, twap],
    );
  });
  it.each([[], null])('normalizes an empty catalog %j', (raw) => {
    expect(FetchCryptoMarketConfigsResponseSchema.parse(raw)).toEqual([]);
  });
  it('rejects malformed variants and non-array envelopes', () => {
    expect(
      FetchCryptoMarketConfigsResponseSchema.safeParse([{ id: 'btc-5m' }])
        .success,
    ).toBe(false);
    expect(
      FetchCryptoMarketConfigsResponseSchema.safeParse({ data: [] }).success,
    ).toBe(false);
    expect(
      FetchCryptoMarketConfigsResponseSchema.safeParse([
        {
          id: 'x',
          asset: 'btc',
          duration: '5m',
          twapEnabled: true,
          twapLookbackSeconds: null,
        },
      ]).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from './fixtures';

describe('crypto market configuration catalog', () => {
  it('fetches the public catalog with optional lookback values', async ({
    publicClient,
  }) => {
    const configs = await publicClient.fetchCryptoMarketConfigs();
    expect(configs.length).toBeGreaterThan(0);
    for (const config of configs) {
      expect(config).toMatchObject({
        id: expect.any(String),
        asset: expect.any(String),
        duration: expect.any(String),
        twapEnabled: expect.any(Boolean),
      });
      if (config.twapLookbackSeconds !== undefined)
        expect(Number.isInteger(config.twapLookbackSeconds)).toBe(true);
    }
  });
});

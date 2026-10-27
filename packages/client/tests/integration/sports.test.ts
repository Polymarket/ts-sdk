import { describe, expect, it } from './fixtures';

describe('Sports', () => {
  describe('listSports', () => {
    it('fetches sports metadata', async ({ publicClient }) => {
      const result = await publicClient.listSports();

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          sport: expect.any(String),
        }),
      );
    });
  });

  describe('fetchSportsMarketTypes', () => {
    it('fetches sports market types', async ({ publicClient }) => {
      const result = await publicClient.fetchSportsMarketTypes();

      expect(result.marketTypes).toEqual(expect.any(Array));
      expect(result.marketTypes?.length).toBeGreaterThan(0);
    });
  });
});

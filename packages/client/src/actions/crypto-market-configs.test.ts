import { describe, expect, it } from 'vitest';
import { createPublicClient } from '../clients';
import { FetchCryptoMarketConfigsError, UserInputError } from '../index';

describe('crypto configuration catalog action', () => {
  it('reads the direct catalog through the public method and preserves variants', async () => {
    const variants = [
      { id: 'btc-5m', asset: 'btc', duration: '5m', twapEnabled: false },
      {
        id: 'btc-5m-twap-60',
        asset: 'btc',
        duration: '5m',
        twapEnabled: true,
        twapLookbackSeconds: 60,
      },
    ];
    const urls: URL[] = [];
    const client = createPublicClient({
      fetch: async (input) => {
        urls.push(
          new URL(input instanceof Request ? input.url : String(input)),
        );
        return Response.json(variants);
      },
    });
    expect(await client.fetchCryptoMarketConfigs({ timeout: false })).toEqual(
      variants,
    );
    expect(urls.map((url) => url.pathname)).toEqual(['/crypto-market-configs']);
    expect(urls[0]?.search).toBe('');
  });
  it('reports invalid read options through its public error surface', async () => {
    const client = createPublicClient();
    const error = await client
      .fetchCryptoMarketConfigs({ retries: -1 })
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(UserInputError);
    expect(FetchCryptoMarketConfigsError.isError(error)).toBe(true);
  });
});

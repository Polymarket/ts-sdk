// biome-ignore-all lint/style/noRestrictedImports: msw's Node test server lives at this entrypoint.
import { WalletType } from '@polymarket/bindings/gamma';
import { expectEvmAddress } from '@polymarket/types';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { BaseSecureClient } from '../clients';
import { forkEnvironmentConfig } from '../environments';
import { ServiceClient } from '../ServiceClient';
import {
  prepareRedeemMarketPositions,
  prepareSplitMarketPosition,
} from './positions';

const gammaRoot = 'http://localhost:4021';
const conditionId =
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as const;
const wallet = expectEvmAddress('0x0000000000000000000000000000000000000001');
const environment = forkEnvironmentConfig({
  name: 'test',
  gamma: { rest: gammaRoot },
});
const server = setupServer();

describe('position market lookups', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('includes closed markets when redeeming by condition ID', async () => {
    const { client, requests } = createClient();
    server.use(marketsHandler(requests));

    await prepareRedeemMarketPositions(client, { conditionId });

    expect(requests).toEqual([
      expect.objectContaining({
        closed: 'true',
        condition_ids: conditionId,
        limit: '1',
      }),
    ]);
  });

  it('includes closed markets when redeeming by market ID', async () => {
    const { client, requests } = createClient();
    server.use(marketsHandler(requests));

    await prepareRedeemMarketPositions(client, { marketId: '123' });

    expect(requests).toEqual([
      expect.objectContaining({
        closed: 'true',
        id: '123',
        limit: '1',
      }),
    ]);
  });

  it('keeps split market lookup unchanged', async () => {
    const { client, requests } = createClient();
    server.use(marketsHandler(requests));

    await prepareSplitMarketPosition(client, { conditionId, amount: 1n });

    expect(requests).toEqual([
      expect.objectContaining({
        condition_ids: conditionId,
        limit: '1',
      }),
    ]);
    expect(requests[0]).not.toHaveProperty('closed');
  });
});

function createClient() {
  const requests: Record<string, string>[] = [];
  const client = {
    account: { wallet, walletType: WalletType.EOA },
    environment,
    gamma: new ServiceClient({ root: gammaRoot }),
    rpc: {
      ethCall: vi.fn(async () => `0x${'0'.repeat(63)}1`),
    },
  } as unknown as BaseSecureClient;

  return { client, requests };
}

function marketsHandler(requests: Record<string, string>[]) {
  return http.get(`${gammaRoot}/markets/keyset`, ({ request }) => {
    const url = new URL(request.url);
    requests.push(Object.fromEntries(url.searchParams));

    return HttpResponse.json({ markets: [rawMarket()] });
  });
}

function rawMarket() {
  return {
    id: '123',
    conditionId,
    marketMakerAddress: '0x0000000000000000000000000000000000000000',
    outcomes: '["Yes", "No"]',
    outcomePrices: '["1", "0"]',
    clobTokenIds: '["101", "202"]',
    negRisk: true,
  };
}

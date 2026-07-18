import { createBaseClient } from '@polymarket/client';
import { listMarkets } from '@polymarket/client/actions';
import {
  createConfig,
  PolymarketProvider,
  useMarket,
  useMarkets,
  useOrderBook,
} from '@polymarket/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

const config = createConfig();

function wrapper({ children }: { children: ReactNode }) {
  return <PolymarketProvider config={config}>{children}</PolymarketProvider>;
}

const fixtureClient = createBaseClient();

const {
  items: [fixtureMarket],
} = await listMarkets(fixtureClient, {
  closed: false,
  pageSize: 1,
}).firstPage();

if (fixtureMarket === undefined) {
  throw new Error('Expected at least one open market for fixtures');
}

const fixtureSlug = fixtureMarket.slug;

if (fixtureSlug === null || fixtureSlug === undefined) {
  throw new Error('Expected the fixture market to have a slug');
}

describe('discovery hooks', () => {
  it('useMarkets loads a live first page and continues', async () => {
    const { result } = renderHook(
      () => useMarkets({ closed: false, pageSize: 5 }),
      { wrapper },
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.data).toBeDefined(), {
      timeout: 30_000,
    });

    const firstPageCount = result.current.data?.length ?? 0;
    expect(firstPageCount).toBeGreaterThan(0);
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(result.current.data?.length ?? 0).toBeGreaterThan(firstPageCount);
    expect(result.current.error).toBeUndefined();
  });

  it('useMarket loads a live market by slug', async () => {
    const { result } = renderHook(() => useMarket({ slug: fixtureSlug }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined(), {
      timeout: 30_000,
    });

    expect(result.current.data?.slug).toBe(fixtureSlug);
    expect(result.current.error).toBeUndefined();
  });

  it('useOrderBook loads a live order book for a market token', async () => {
    const tokenId = fixtureMarket.outcomes.yes.tokenId;

    if (tokenId === null) {
      throw new Error('Expected the fixture market to have a YES token');
    }

    const { result } = renderHook(() => useOrderBook({ tokenId }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined(), {
      timeout: 30_000,
    });

    expect(result.current.data?.tokenId).toBe(tokenId);
    expect(result.current.error).toBeUndefined();
  });
});

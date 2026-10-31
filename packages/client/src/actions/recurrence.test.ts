import { describe, expect, it } from 'vitest';
import { createPublicClient } from '../clients';

describe('Recurrence filters', () => {
  it.each([
    'annual',
    'hourly',
  ] as const)('retains %s through transport and continuation for every related action', async (recurrence) => {
    const requests: URL[] = [];
    const counts = new Map<string, number>();
    const client = createPublicClient({
      fetch: async (input) => {
        const url = new URL(new Request(input).url);
        requests.push(url);
        const count = (counts.get(url.pathname) ?? 0) + 1;
        counts.set(url.pathname, count);
        switch (url.pathname) {
          case '/events/keyset':
            return Response.json({
              events: [],
              ...(count === 1 ? { next_cursor: 'next-event' } : {}),
            });
          case '/series':
            return Response.json(count === 1 ? [{ id: '1' }] : []);
          case '/public-search':
            return Response.json({ pagination: { hasMore: count === 1 } });
          default:
            throw new Error(`Unexpected request: ${url.pathname}`);
        }
      },
    });

    for (const pages of [
      client.listEvents({ recurrence, pageSize: 1 }),
      client.listSeries({ recurrence, pageSize: 1 }),
      client.search({ q: 'markets', recurrence, pageSize: 1 }),
    ]) {
      let pageCount = 0;
      for await (const _page of pages) pageCount += 1;
      expect(pageCount).toBe(2);
    }

    expect(requests.map((url) => url.pathname)).toEqual([
      '/events/keyset',
      '/events/keyset',
      '/series',
      '/series',
      '/public-search',
      '/public-search',
    ]);
    expect(requests.map((url) => url.searchParams.get('recurrence'))).toEqual(
      Array(6).fill(recurrence),
    );
    expect(requests[1]?.searchParams.get('after_cursor')).toBe('next-event');
    expect(requests[3]?.searchParams.get('offset')).toBe('1');
    expect(requests[5]?.searchParams.get('page')).toBe('2');
  });
});

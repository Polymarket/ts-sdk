import { describe, expect, it } from 'vitest';
import { createPublicClient } from '../clients';
import { PaginationLimitError } from '../errors';
import { encodeOffsetCursor } from '../pagination';

// Controlled responses isolate continuation states that public results can change between reads.
describe('optimized search continuation', () => {
  it('follows top-level hasMore with saved continuation and unchanged query', async () => {
    const requests: URL[] = [];
    const client = createPublicClient({
      fetch: async (input) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        requests.push(url);
        const page = Number(url.searchParams.get('page'));
        return Response.json({
          events: [
            {
              id: String(page),
              markets: [
                {
                  slug: `example-${page}`,
                  outcomes: ['Yes', 'No'],
                  outcomePrices: ['0.6', '0.4'],
                },
              ],
            },
          ],
          hasMore: page === 1,
        });
      },
    });
    const pages = client.search({ q: 'example', optimized: true, pageSize: 1 });
    const first = await pages.firstPage();
    expect(first.hasMore).toBe(true);
    const second = await client
      .search({
        q: 'example',
        optimized: true,
        pageSize: 1,
        cursor: first.nextCursor,
      })
      .firstPage();
    expect(second.items.events[0]?.markets[0]?.id).toBeUndefined();
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeUndefined();
    expect(requests.map((url) => url.searchParams.get('page'))).toEqual([
      '1',
      '2',
    ]);
    for (const url of requests) {
      expect(url.searchParams.get('q')).toBe('example');
      expect(url.searchParams.get('optimized')).toBe('true');
      expect(url.searchParams.get('limit_per_type')).toBe('1');
    }
  });

  it('retains the page cap for top-level continuation', async () => {
    let requests = 0;
    const client = createPublicClient({
      fetch: async () => {
        requests++;
        return Response.json({ hasMore: true });
      },
    });
    const pages = client.search({
      q: 'example',
      cursor: encodeOffsetCursor({ offset: 100, pageSize: 1 }),
    });
    const page = await pages.firstPage();
    expect(page.hasMore).toBe(true);
    expect(page.limitReached).toBe(true);
    await expect(
      pages.from(page.nextCursor).firstPage(),
    ).rejects.toBeInstanceOf(PaginationLimitError);
    expect(requests).toBe(1);
  });
});

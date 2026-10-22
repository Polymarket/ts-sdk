import { afterEach, vi } from 'vitest';
import { describe, expect, it } from './fixtures';

describe('Recurrence filters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const recurrence of ['annual', 'hourly'] as const) {
    it(`sends ${recurrence} through event, series and search reads`, async ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const events = await publicClient
        .listEvents({ recurrence, pageSize: 1 })
        .firstPage();
      const series = await publicClient
        .listSeries({ recurrence, pageSize: 1 })
        .firstPage();
      const search = await publicClient
        .search({ q: 'markets', recurrence, pageSize: 1 })
        .firstPage();

      expect(events.items).toEqual(expect.any(Array));
      expect(series.items).toEqual(expect.any(Array));
      expect(search.items).toEqual(expect.any(Object));
      const urls = fetchSpy.mock.calls.map(
        ([input]) =>
          new URL(input instanceof Request ? input.url : String(input)),
      );
      expect(urls.map((url) => url.pathname)).toEqual([
        '/events/keyset',
        '/series',
        '/public-search',
      ]);
      expect(urls.map((url) => url.searchParams.get('recurrence'))).toEqual([
        recurrence,
        recurrence,
        recurrence,
      ]);
    });
  }
});

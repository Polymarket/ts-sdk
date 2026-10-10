import { toPaginationCursor } from '@polymarket/bindings';
import {
  createPublicClient,
  ProtocolVersion,
  UserInputError,
} from '@polymarket/client';
import { expectPresent } from '@polymarket/types';
import { afterEach, vi } from 'vitest';
import { describe, environment, expect, it } from './fixtures';
import { expectNonEmptyPage, expectPageWindow } from './helpers';

const STRUCTURAL_MARKET_CONDITION_ID =
  '0x0115903402acad794c9e221e72a37c4cd00000000000000000000000000000';
const COMBO_CONDITION_ID =
  '0x0315903402acad794c9e221e72a37c4cd00000000000000000000000000000';

const {
  items: [event],
} = await createPublicClient({ environment })
  .listEvents({
    closed: false,
    pageSize: 1,
  })
  .firstPage()
  .then(expectNonEmptyPage);

describe('Events', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listEvents', () => {
    it('fetches events', async ({ publicClient }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const paginator = publicClient.listEvents({
        closed: false,
        pageSize: 100,
      });
      const firstPage = await paginator.firstPage().then(expectNonEmptyPage);

      expect(firstPage.items.length).toBeGreaterThan(0);
      await expectPageWindow(paginator, firstPage, 99);

      for (const [input] of fetchSpy.mock.calls) {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        if (url.pathname === '/events/keyset') {
          expect(url.searchParams.has('version')).toBe(false);
        }
      }
    });

    for (const version of [ProtocolVersion.V1, ProtocolVersion.V2]) {
      it(`retains protocol ${version} on first and continuation pages`, async ({
        publicClient,
      }) => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const paginator = publicClient.listEvents({ version, pageSize: 2 });
        const firstPage = await paginator.firstPage().then(expectNonEmptyPage);
        const nextCursor = expectPresent(firstPage.nextCursor);

        for await (const page of paginator.from(nextCursor)) {
          expect(page.items.length).toBeLessThanOrEqual(2);
          break;
        }

        const urls = fetchSpy.mock.calls
          .map(
            ([input]) =>
              new URL(input instanceof Request ? input.url : String(input)),
          )
          .filter((url) => url.pathname === '/events/keyset');
        expect(urls).toHaveLength(2);
        for (const url of urls) {
          expect(url.searchParams.getAll('version')).toEqual([version]);
        }
        expect(urls[0]?.searchParams.has('after_cursor')).toBe(false);
        expect(urls[1]?.searchParams.has('after_cursor')).toBe(true);

        fetchSpy.mockClear();
        for (const request of [
          {
            version:
              version === ProtocolVersion.V1
                ? ProtocolVersion.V2
                : ProtocolVersion.V1,
          },
          {},
        ]) {
          await expect(
            publicClient.listEvents(request).from(nextCursor).firstPage(),
          ).rejects.toThrow(UserInputError);
        }
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    }

    it('rejects non-scalar and unsupported protocol filters before transport', ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      for (const version of [1, ['v1'], 'v3', null]) {
        expect(() =>
          publicClient.listEvents({ version: version as never }),
        ).toThrow(UserInputError);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('refuses a cursor reused for a different query before any request', async ({
      publicClient,
    }) => {
      const { nextCursor } = await publicClient
        .listEvents({ closed: false, pageSize: 2 })
        .firstPage()
        .then(expectNonEmptyPage);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await expect(
        publicClient
          .listEvents({
            closed: false,
            pageSize: 2,
            version: ProtocolVersion.V1,
          })
          .from(nextCursor)
          .firstPage(),
      ).rejects.toThrow(UserInputError);
      expect(fetchSpy).not.toHaveBeenCalled();

      await expect(
        publicClient
          .listEvents({ closed: true, pageSize: 2 })
          .from(nextCursor)
          .firstPage(),
      ).rejects.toThrow(UserInputError);
      expect(fetchSpy).not.toHaveBeenCalled();

      // A damaged envelope is rejected locally rather than sent as a token.
      const damagedCursor = toPaginationCursor(
        btoa(JSON.stringify({ kind: 'keyset', fingerprint: 42, cursor: 't' })),
      );
      await expect(
        publicClient
          .listEvents({ closed: false, pageSize: 2 })
          .from(damagedCursor)
          .firstPage(),
      ).rejects.toThrow(UserInputError);
      expect(fetchSpy).not.toHaveBeenCalled();

      // The same query with another page size continues the walk.
      const secondPage = await publicClient
        .listEvents({ closed: false, pageSize: 3 })
        .from(nextCursor)
        .firstPage()
        .then(expectNonEmptyPage);
      expect(secondPage.items.length).toBeLessThanOrEqual(3);
    });

    it('continues a raw cursor minted before query binding', async ({
      publicClient,
    }) => {
      // Cursors saved by earlier versions are the service's own tokens.
      const raw = (await fetch(
        `${environment.gamma.rest}/events/keyset?closed=false&limit=2`,
      ).then((response) => response.json())) as { next_cursor?: string };
      const legacyCursor = toPaginationCursor(expectPresent(raw.next_cursor));
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const page = await publicClient
        .listEvents({ closed: false, pageSize: 2 })
        .from(legacyCursor)
        .firstPage()
        .then(expectNonEmptyPage);

      expect(page.items.length).toBeLessThanOrEqual(2);
      const url = new URL(
        fetchSpy.mock.calls
          .map(([input]) =>
            input instanceof Request ? input.url : String(input),
          )
          .find((url) => url.includes('/events/keyset')) ?? '',
      );
      expect(url.searchParams.get('after_cursor')).toBe(raw.next_cursor);
    });
  });

  describe('fetchEvent', () => {
    it('fetches an event by id and slug', async ({ publicClient }) => {
      const eventById = await publicClient.fetchEvent({
        id: event.id,
      });

      const eventBySlug = await publicClient.fetchEvent({
        slug: expectPresent(event.slug),
      });

      expect(eventById.id).toBe(event.id);
      expect(eventBySlug.id).toBe(event.id);
    });

    it('fetches an event by URL', async ({ publicClient }) => {
      const eventByUrl = await publicClient.fetchEvent({
        url: `https://polymarket.com/event/${expectPresent(event.slug)}`,
      });

      expect(eventByUrl.id).toBe(event.id);
    });

    it('rejects invalid and non-event URLs', async ({ publicClient }) => {
      await expect(
        publicClient.fetchEvent({
          url: 'not-a-url',
        }),
      ).rejects.toThrow(UserInputError);

      await expect(
        publicClient.fetchEvent({
          url: 'https://example.com/event/presidential-election-2028',
        }),
      ).rejects.toThrow(UserInputError);

      await expect(
        publicClient.fetchEvent({
          url: 'https://polymarket.com/market/some-market-slug',
        }),
      ).rejects.toThrow(UserInputError);
    });
  });

  describe('fetchEventTags', () => {
    it("fetches an event's tags by id", async ({ publicClient }) => {
      const result = await publicClient.fetchEventTags({
        id: event.id,
      });

      expect(result).toEqual(expect.any(Array));

      for (const tag of result) {
        expect(tag).toEqual(
          expect.objectContaining({
            id: expect.any(String),
          }),
        );
      }
    });
  });

  describe('fetchEventLiveVolume', () => {
    it('fetches taker volume from the v2 route', async ({ publicClient }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await publicClient.fetchEventLiveVolume({
        eventIds: [event.id],
      });

      expect(result).toEqual(
        expect.objectContaining({
          markets: expect.any(Array),
          takerVolumeTotal: expect.any(String),
        }),
      );

      for (const market of result.markets) {
        expect(market).toEqual(
          expect.objectContaining({
            takerVolume: expect.any(String),
          }),
        );
        expect(
          market.conditionId === null || typeof market.conditionId === 'string',
        ).toBe(true);
      }

      const requestUrl = fetchSpy.mock.calls
        .map(([input]) =>
          input instanceof Request ? input.url : String(input),
        )
        .find((url) => new URL(url).pathname === '/v2/live-volume');

      expect(
        new URL(expectPresent(requestUrl)).searchParams.get('event_id'),
      ).toBe(event.id);
    });

    it('rejects a partially invalid event selection', async ({
      publicClient,
    }) => {
      await expect(
        publicClient.fetchEventLiveVolume({
          eventIds: [event.id, 'not-an-event'],
        }),
      ).rejects.toThrow(UserInputError);
    });
  });

  describe('fetchResolutions', () => {
    it('fetches matching lifecycle rows by event and condition', async ({
      publicClient,
    }) => {
      const byEvent = await publicClient.fetchResolutions({
        eventIds: ['106884'],
      });
      const eventResolution = expectPresent(byEvent[0]);
      const conditionId = expectPresent(eventResolution.conditionId);

      const byCondition = await publicClient.fetchResolutions({
        conditionIds: [conditionId],
      });

      expect(byCondition).toContainEqual(eventResolution);
    });

    it('pads a 31-byte protocol v2 market condition ID', async ({
      publicClient,
    }) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await publicClient.fetchResolutions({
        conditionIds: [STRUCTURAL_MARKET_CONDITION_ID],
      });

      const requestUrl = fetchSpy.mock.calls
        .map(([input]) =>
          input instanceof Request ? input.url : String(input),
        )
        .find((url) => new URL(url).pathname === '/v2/resolutions');

      expect(
        new URL(expectPresent(requestUrl)).searchParams.get('condition'),
      ).toBe(`${STRUCTURAL_MARKET_CONDITION_ID}00`);
    });

    it('rejects a 31-byte combo condition ID', async ({ publicClient }) => {
      await expect(
        publicClient.fetchResolutions({
          conditionIds: [COMBO_CONDITION_ID],
        }),
      ).rejects.toThrow(UserInputError);
    });

    it('rejects an empty selector', async ({ publicClient }) => {
      await expect(
        publicClient.fetchResolutions({ eventIds: [] }),
      ).rejects.toThrow(UserInputError);
    });
  });
});

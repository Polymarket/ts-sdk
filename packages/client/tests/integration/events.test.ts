import { createPublicClient, UserInputError } from '@polymarket/client';
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
      const paginator = publicClient.listEvents({
        closed: false,
        pageSize: 100,
      });
      const firstPage = await paginator.firstPage().then(expectNonEmptyPage);

      expect(firstPage.items.length).toBeGreaterThan(0);
      await expectPageWindow(paginator, firstPage, 99);
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
    it('fetches live volume for an event', async ({ publicClient }) => {
      const result = await publicClient.fetchEventLiveVolume({
        id: event.id,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toEqual(
        expect.objectContaining({
          markets: expect.any(Array),
          total: expect.any(String),
        }),
      );
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

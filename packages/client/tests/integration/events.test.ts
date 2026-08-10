import { createPublicClient, UserInputError } from '@polymarket/client';
import { expectPresent } from '@polymarket/types';
import { describe, environment, expect, it } from './fixtures';
import { expectNonEmptyPage, expectPageWindow } from './helpers';

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
});

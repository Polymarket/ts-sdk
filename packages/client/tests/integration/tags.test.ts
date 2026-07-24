import { describe, expect, it } from './fixtures';
import { expectNonEmptyPage, expectPageWindow } from './helpers';

const TEST_TAG = {
  id: '144',
  slug: 'elections',
} as const;

describe('Tags', () => {
  describe('listTags', () => {
    it('fetches tags', async ({ publicClient }) => {
      const result = await publicClient
        .listTags({
          pageSize: 100,
        })
        .firstPage()
        .then(expectNonEmptyPage);

      expect(result.items.length).toBeGreaterThan(0);
      await expectPageWindow(
        publicClient.listTags({ pageSize: 100 }),
        result,
        99,
      );
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
        }),
      );
    });
  });

  describe('fetchTag', () => {
    it('fetches a tag by id and slug', async ({ publicClient }) => {
      const tagById = await publicClient.fetchTag({ id: TEST_TAG.id });
      const tagBySlug = await publicClient.fetchTag({
        slug: TEST_TAG.slug,
      });

      expect(tagById.id).toBe(TEST_TAG.id);
      expect(tagBySlug.id).toBe(TEST_TAG.id);
    });
  });

  describe('fetchRelatedTags', () => {
    it('fetches related tag relationships by id and slug', async ({
      publicClient,
    }) => {
      const relatedById = await publicClient.fetchRelatedTags({
        id: TEST_TAG.id,
      });
      const relatedBySlug = await publicClient.fetchRelatedTags({
        slug: TEST_TAG.slug,
      });

      expect(relatedById).toEqual(expect.any(Array));
      expect(relatedBySlug).toEqual(expect.any(Array));
    });
  });

  describe('fetchRelatedTagResources', () => {
    it('fetches related tags by id and slug', async ({ publicClient }) => {
      const relatedTagsById = await publicClient.fetchRelatedTagResources({
        id: TEST_TAG.id,
      });
      const relatedTagsBySlug = await publicClient.fetchRelatedTagResources({
        slug: TEST_TAG.slug,
      });

      expect(relatedTagsById).toEqual(expect.any(Array));
      expect(relatedTagsBySlug).toEqual(expect.any(Array));
    });
  });
});

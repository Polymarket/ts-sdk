import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { UnexpectedResponseError, UserInputError } from './errors';
import { formatInputZodError, formatResponseZodError } from './validation';

describe('validation', () => {
  describe('formatInputZodError', () => {
    it('formats object and array issues into a readable message', () => {
      const schema = z.strictObject({
        active: z.boolean(),
        limit: z.number().int().positive(),
        slug: z.array(z.string()),
      });

      const result = schema.safeParse({
        active: 'yes',
        extra: true,
        limit: -1,
        slug: ['winner', 42],
      });

      expect(result.success).toBe(false);

      if (result.success) {
        return;
      }

      expect(formatInputZodError(result.error)).toMatchInlineSnapshot(`
        "Fix the following issues:
        - Unrecognized key: "extra"
        - active: Invalid input: expected boolean, received string
        - limit: Too small: expected number to be >0
        - slug[1]: Invalid input: expected string, received number"
      `);
    });

    it('makes union issues easier to scan', () => {
      const schema = z.union([
        z.strictObject({ id: z.string().uuid() }),
        z.strictObject({ slug: z.string().min(1) }),
      ]);

      const result = schema.safeParse({
        id: 42,
        slug: '',
      });

      expect(result.success).toBe(false);

      if (result.success) {
        return;
      }

      expect(formatInputZodError(result.error)).toMatchInlineSnapshot(`
        "Fix the following issues:
        - Unrecognized key: "slug"
        - Unrecognized key: "id"
        - id: Invalid input: expected string, received number
        - slug: Too small: expected string to have >=1 characters"
      `);
    });
  });

  describe('formatResponseZodError', () => {
    it('includes the endpoint context', () => {
      const schema = z.object({
        conditionId: z.string(),
      });

      const result = schema.safeParse({});

      expect(result.success).toBe(false);

      if (result.success) {
        return;
      }

      expect(
        formatResponseZodError(result.error, {
          endpoint: 'https://gamma.polymarket.com/markets/123',
        }),
      ).toMatchInlineSnapshot(`
        "Received an incompatible API response.
        Endpoint: https://gamma.polymarket.com/markets/123
        This usually means the API response shape changed in a breaking way or the SDK is outdated.
        Fix the following issues:
        - conditionId: Invalid input: expected string, received undefined"
      `);
    });
  });

  describe('UserInputError', () => {
    it('formats Zod failures through the factory', () => {
      const schema = z.object({
        limit: z.number().int().positive(),
      });

      const result = schema.safeParse({ limit: 'ten' });

      expect(result.success).toBe(false);

      if (result.success) {
        return;
      }

      const error = UserInputError.fromZodError(result.error);

      expect(error).toBeInstanceOf(UserInputError);
      expect(error.cause).toBe(result.error);
      expect(error.message).toMatchInlineSnapshot(`
        "Fix the following issues:
        - limit: Invalid input: expected number, received string"
      `);
    });
  });

  describe('UnexpectedResponseError', () => {
    it('formats Zod failures through the factory', () => {
      const schema = z.object({
        conditionId: z.string(),
      });

      const result = schema.safeParse({});

      expect(result.success).toBe(false);

      if (result.success) {
        return;
      }

      const error = UnexpectedResponseError.fromZodError(result.error, {
        endpoint: 'https://gamma.polymarket.com/markets',
      });

      expect(error.cause).toBe(result.error);
      expect(error.message).toMatchInlineSnapshot(`
        "Received an incompatible API response.
        Endpoint: https://gamma.polymarket.com/markets
        This usually means the API response shape changed in a breaking way or the SDK is outdated.
        Fix the following issues:
        - conditionId: Invalid input: expected string, received undefined"
      `);
    });
  });
});

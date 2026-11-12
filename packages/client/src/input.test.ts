import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { UserInputError } from './errors';
import { parseUserInput } from './input';

describe('input', () => {
  describe('parseUserInput', () => {
    it('returns parsed input on success', () => {
      const schema = z.object({
        limit: z.number().int().positive(),
      });

      const result = parseUserInput({ limit: 10 }, schema);

      expect(result).toEqual({ limit: 10 });
    });

    it('throws UserInputError on invalid input', () => {
      const schema = z.object({
        limit: z.number().int().positive(),
      });

      expect(() => parseUserInput({ limit: 'ten' }, schema)).toThrowError(
        UserInputError,
      );

      expect(() =>
        parseUserInput({ limit: 'ten' }, schema),
      ).toThrowErrorMatchingInlineSnapshot(`
          [UserInputError: Fix the following issues:
          - limit: Invalid input: expected number, received string]
        `);
    });

    it('rejects oversized arrays before inspecting their elements', () => {
      const schema = z.array(z.number()).max(1);
      const input = [1, 2];
      let elementReads = 0;
      Object.defineProperty(input, 0, {
        get() {
          elementReads += 1;
          throw new Error('Oversized array elements must not be inspected');
        },
      });

      expect(() => parseUserInput(input, schema)).toThrowError(UserInputError);
      expect(elementReads).toBe(0);
      expect(parseUserInput([1], schema)).toEqual([1]);
      expect(() => parseUserInput(['invalid'], schema)).toThrowError(
        UserInputError,
      );
    });
  });
});

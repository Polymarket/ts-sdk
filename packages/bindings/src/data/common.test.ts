import { describe, expect, it } from 'vitest';
import { CanonicalMarketConditionIdSchema } from './common';

const DIRECTIONAL =
  '0x0400112233445566778899aabbccddeeff0004000000000000000000008002';
const BINARY =
  '0x0100112233445566778899aabbccddeeff0000000000000000000000000000';
const NEGRISK =
  '0x0200112233445566778899aabbccddeeff0004000000000000000000000004';
const COMBO =
  '0x0300112233445566778899aabbccddeeff0000000000000000000000000000';

describe('canonical market condition IDs', () => {
  it('normalizes directional thresholds, Void and existing market IDs to padded lowercase', () => {
    for (const condition of [
      DIRECTIONAL,
      `${DIRECTIONAL.slice(0, -4)}0004`,
      BINARY,
      NEGRISK,
    ]) {
      expect(
        CanonicalMarketConditionIdSchema.parse(
          condition.toUpperCase().replace('0X', '0x'),
        ),
      ).toBe(`${condition}00`);
      expect(CanonicalMarketConditionIdSchema.parse(`${condition}00`)).toBe(
        `${condition}00`,
      );
    }
  });

  it('keeps the legacy bytes32 path and 31-byte combo restriction', () => {
    const legacy = `0x${'ab'.repeat(32)}`;
    expect(CanonicalMarketConditionIdSchema.parse(legacy)).toBe(legacy);
    expect(CanonicalMarketConditionIdSchema.safeParse(COMBO).success).toBe(
      false,
    );
    expect(CanonicalMarketConditionIdSchema.parse(`${COMBO}00`)).toBe(
      `${COMBO}00`,
    );
  });

  it('rejects invalid native directional descriptors', () => {
    for (const descriptor of ['8000', '8004', '0005']) {
      expect(
        CanonicalMarketConditionIdSchema.safeParse(
          `${DIRECTIONAL.slice(0, -4)}${descriptor}`,
        ).success,
      ).toBe(false);
    }
  });
});

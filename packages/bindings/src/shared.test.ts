import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ComboConditionIdSchema,
  type ConditionId,
  ConditionIdSchema,
  type CtfConditionId,
  toComboConditionId,
} from './shared';

const CANONICAL_COMBO_CONDITION_ID =
  '0x032def24bfb0c5c57fb236fac08b94236a0000000000000000000000000000';
const COMBO_CONDITION_ID_PATTERN = /^0x03[0-9a-f]{60}$/;

describe('shared ID parsers', () => {
  describe('condition IDs', () => {
    const binaryConditionId =
      '0x012def24bfb0c5c57fb236fac08b94236a0000000000000000000000000000';
    const paddedBinaryConditionId = `${binaryConditionId}00`;
    const negativeRiskConditionId =
      '0x022def24bfb0c5c57fb236fac08b94236a0004000000000000000000000003';
    const ctfConditionId = `0x${'ab'.repeat(32)}`;

    it('parses ordinary condition IDs without inferring their protocol', () => {
      expect(ConditionIdSchema.parse(binaryConditionId)).toBe(
        binaryConditionId,
      );
      expect(ConditionIdSchema.parse(paddedBinaryConditionId)).toBe(
        paddedBinaryConditionId,
      );
      expect(ConditionIdSchema.parse(negativeRiskConditionId)).toBe(
        negativeRiskConditionId,
      );
      expect(ConditionIdSchema.parse(ctfConditionId)).toBe(ctfConditionId);
    });

    it('keeps CtfConditionId as an exact compatibility alias', () => {
      expectTypeOf<ConditionId>().toEqualTypeOf<CtfConditionId>();
    });
  });

  describe('toComboConditionId', () => {
    it('returns canonical bytes31 combo condition IDs', () => {
      for (const value of [
        CANONICAL_COMBO_CONDITION_ID,
        `${CANONICAL_COMBO_CONDITION_ID}00`,
        `${CANONICAL_COMBO_CONDITION_ID}01`,
      ]) {
        const conditionId = toComboConditionId(value);

        expect(conditionId).toBe(CANONICAL_COMBO_CONDITION_ID);
        expect(conditionId).toHaveLength(64);
        expect(conditionId).toMatch(COMBO_CONDITION_ID_PATTERN);
      }
    });

    it('rejects non-combo and non-binary outcome wire forms', () => {
      expect(() =>
        toComboConditionId(
          '0x022def24bfb0c5c57fb236fac08b94236a0000000000000000000000000000',
        ),
      ).toThrow(/combo condition ID/);
      expect(() =>
        toComboConditionId(`${CANONICAL_COMBO_CONDITION_ID}02`),
      ).toThrow(/combo condition ID/);
    });
  });

  describe('ComboConditionIdSchema', () => {
    it('outputs canonical bytes31 combo condition IDs', () => {
      const conditionId = ComboConditionIdSchema.parse(
        `${CANONICAL_COMBO_CONDITION_ID}01`,
      );

      expect(conditionId).toBe(CANONICAL_COMBO_CONDITION_ID);
      expect(conditionId).toHaveLength(64);
      expect(conditionId).toMatch(COMBO_CONDITION_ID_PATTERN);
    });
  });
});

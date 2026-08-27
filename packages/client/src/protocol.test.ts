import {
  type ComboConditionId,
  type PositionId,
  toComboConditionId,
  toConditionId,
  toPositionId,
} from '@polymarket/bindings';
import { describe, expect, it } from 'vitest';
import {
  type CanonicalComboLegs,
  canonicalizeComboLegs,
  decodeV2OutcomePositionId,
  deriveComboPositionContext,
} from './protocol';

const CONDITION_ID = toComboConditionId(
  '0x032def24bfb0c5c57fb236fac08b94236a0000000000000000000000000000',
);

describe('Protocol helpers', () => {
  describe('canonicalizeComboLegs', () => {
    it('sorts unordered legs', () => {
      const legs = canonicalizeComboLegs([
        legPosition(2, 1),
        legPosition(1, 0),
      ]);

      expect(legs.map((leg) => leg.toString())).toEqual([
        legPosition(1, 0),
        legPosition(2, 1),
      ]);
    });

    it('rejects combo legs with both outcomes from one condition', () => {
      expect(() =>
        canonicalizeComboLegs([legPosition(1, 0), legPosition(1, 1)]),
      ).toThrow(/both outcomes/);
    });
  });

  describe('deriveComboPositionContext', () => {
    it('derives a combo condition ID and position IDs from canonical legs', () => {
      const legs = [
        BigInt(legPosition(1, 0)),
        BigInt(legPosition(2, 1)),
      ] as unknown as CanonicalComboLegs;

      expect(deriveComboPositionContext(legs)).toEqual({
        conditionId: CONDITION_ID,
        positionIds: [
          comboPosition(CONDITION_ID, 0),
          comboPosition(CONDITION_ID, 1),
        ],
      });
    });

    it('normalizes combo condition ID wire forms', () => {
      expect(toComboConditionId(CONDITION_ID)).toBe(CONDITION_ID);
      expect(toComboConditionId(`${CONDITION_ID}00`)).toBe(CONDITION_ID);
      expect(toComboConditionId(`${CONDITION_ID}01`)).toBe(CONDITION_ID);
    });
  });

  describe('decodeV2OutcomePositionId', () => {
    it.each([
      1, 2, 3,
    ])('decodes a module %s position ID into a condition ID and outcome index', (moduleId) => {
      const positionId = v2Position(moduleId, 7, 1);

      expect(decodeV2OutcomePositionId(positionId)).toEqual({
        conditionId: toConditionId(positionConditionId(positionId)),
        outcomeIndex: 1,
      });
    });

    it('decodes a combo position ID without narrowing the condition type', () => {
      const positionId = comboPosition(CONDITION_ID, 1);

      expect(decodeV2OutcomePositionId(positionId)).toEqual({
        conditionId: toConditionId(CONDITION_ID),
        outcomeIndex: 1,
      });
    });

    it('rejects unsupported protocol modules', () => {
      expect(() => decodeV2OutcomePositionId(v2Position(4, 1, 0))).toThrow(
        /supported protocol v2 module/,
      );
    });

    it('rejects position IDs with non-binary outcomes', () => {
      expect(() =>
        decodeV2OutcomePositionId(comboPosition(CONDITION_ID, 2)),
      ).toThrow(/YES\/NO/);
    });
  });
});

function legPosition(marker: number, outcome: number): PositionId {
  return v2Position(1, marker, outcome);
}

function v2Position(
  moduleId: number,
  marker: number,
  outcome: number,
): PositionId {
  const bytes = new Uint8Array(32);
  bytes[0] = moduleId;
  bytes[30] = marker;
  bytes[31] = outcome;

  return toPositionId(
    BigInt(
      `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
    ).toString(),
  );
}

function positionConditionId(positionId: PositionId): string {
  return `0x${BigInt(positionId).toString(16).padStart(64, '0').slice(0, -2)}`;
}

function comboPosition(
  conditionId: ComboConditionId,
  outcome: number,
): PositionId {
  return toPositionId(BigInt(`${conditionId}${byteHex(outcome)}`).toString());
}

function byteHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

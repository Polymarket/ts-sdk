import {
  type ComboConditionId,
  type PositionId,
  toComboConditionId,
  toConditionId,
  toPositionId,
  toTokenId,
} from '@polymarket/bindings';
import { describe, expect, it } from 'vitest';
import {
  type CanonicalComboLegs,
  canonicalizeComboLegs,
  decodeV2OutcomePositionId,
  deriveComboPositionContext,
  isV2PositionId,
} from './protocol';

const CONDITION_ID = toComboConditionId(
  '0x032def24bfb0c5c57fb236fac08b94236a0000000000000000000000000000',
);

describe('Protocol helpers', () => {
  describe('isV2PositionId', () => {
    it('recognizes the reserved protocol v2 position-ID namespace', () => {
      const positionId = v2Position(1, 7, 1);

      expect(isV2PositionId(positionId)).toBe(true);
      expect(
        isV2PositionId(
          toTokenId((BigInt(positionId) | (1n << 40n)).toString()),
        ),
      ).toBe(false);
    });

    it.each([
      0, 4, 0x8001, 0x8003,
    ])('routes directional descriptor %s through the native namespace', (descriptor) => {
      expect(isV2PositionId(directionalPosition(descriptor, 0))).toBe(true);
      expect(isV2PositionId(directionalPosition(descriptor, 1))).toBe(true);
    });

    it.each([
      '',
      '  ',
      '-1',
      'invalid',
    ])('rejects an invalid uint256 value: %j', (value) => {
      expect(isV2PositionId(toTokenId(value))).toBe(false);
    });
  });

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

    it('preserves existing binary redemption input aliases', () => {
      const canonical = v2Position(1, 7, 1);
      const expected = decodeV2OutcomePositionId(canonical);
      for (const alias of [
        `0${canonical}`,
        ` ${canonical} `,
        `0x${BigInt(canonical).toString(16)}`,
      ]) {
        expect(decodeV2OutcomePositionId(toPositionId(alias))).toEqual(
          expected,
        );
      }
    });

    it('rejects unsupported protocol modules', () => {
      expect(() => decodeV2OutcomePositionId(v2Position(5, 1, 0))).toThrow(
        /supported protocol v2 module/,
      );
    });

    it.each([
      0, 4, 0x8001, 0x8003,
    ])('decodes directional bucket, Void, and threshold descriptor %s', (descriptor) => {
      const positionId = directionalPosition(descriptor, 1);
      expect(decodeV2OutcomePositionId(positionId)).toEqual({
        conditionId: toConditionId(positionConditionId(positionId)),
        outcomeIndex: 1,
      });
    });

    it.each([
      5, 0x8000, 0x8004,
    ])('rejects an invalid directional descriptor %s', (descriptor) => {
      expect(() =>
        decodeV2OutcomePositionId(directionalPosition(descriptor, 0)),
      ).toThrow(/directional condition descriptor/);
    });

    it('rejects position IDs with non-binary outcomes', () => {
      expect(() =>
        decodeV2OutcomePositionId(comboPosition(CONDITION_ID, 2)),
      ).toThrow(/YES\/NO/);
    });
  });
});

function directionalPosition(descriptor: number, outcome: number): PositionId {
  const id =
    (4n << 248n) |
    (123n << 120n) |
    (4n << 104n) |
    (BigInt(descriptor) << 8n) |
    BigInt(outcome);
  return toPositionId(id.toString());
}

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

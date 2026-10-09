import { describe, expect, it } from 'vitest';
import {
  decodeProtocolConditionId,
  decodeProtocolEventId,
  decodeProtocolPositionId,
  deriveProtocolConditionId,
  deriveProtocolPositionId,
  ProtocolConditionIdSchema,
  ProtocolEventIdSchema,
  ProtocolModule,
  ProtocolPositionIdSchema,
} from './ids';

// Ids.sol layout: module | base hash | arity | reserved | resolution chain.
const EVENT = '0x0400112233445566778899aabbccddeeff00040123456789abcdef0102';
const BUCKET = `${EVENT}0003`;
const VOID = `${EVENT}0004`;
const THRESHOLD = `${EVENT}8002`;
const BINARY =
  '0x0100112233445566778899aabbccddeeff0000000000000000000000000000';
const COMBO =
  '0x0300112233445566778899aabbccddeeff0000000000000000000000000000';

function decimalPosition(conditionId: string, outcome: number): string {
  return BigInt(
    `${conditionId}${outcome.toString(16).padStart(2, '0')}`,
  ).toString();
}

describe('structured protocol IDs', () => {
  it('normalizes canonical widths while rejecting dirty suffix bytes', () => {
    expect(
      ProtocolEventIdSchema.parse(
        `${EVENT.toUpperCase().replace('0X', '0x')}000000`,
      ),
    ).toBe(EVENT);
    expect(ProtocolConditionIdSchema.parse(`${THRESHOLD}00`)).toBe(THRESHOLD);
    expect(ProtocolEventIdSchema.safeParse(`${EVENT}800200`).success).toBe(
      false,
    );
    expect(ProtocolEventIdSchema.safeParse(`${EVENT}000001`).success).toBe(
      false,
    );
    expect(ProtocolConditionIdSchema.safeParse(`${THRESHOLD}01`).success).toBe(
      false,
    );
  });

  it('preserves event identity through bucket, Void and threshold derivation', () => {
    const eventId = ProtocolEventIdSchema.parse(EVENT);
    expect(decodeProtocolEventId(eventId)).toEqual({
      eventId: EVENT,
      moduleId: ProtocolModule.Directional,
      arity: 4,
      reserved: 0x0123456789abcdefn,
      resolutionChain: 0x0102,
    });
    for (const [index, condition] of [
      [3, BUCKET],
      [4, VOID],
      [0x8002, THRESHOLD],
    ] as const) {
      const conditionId = deriveProtocolConditionId(eventId, index);
      expect(conditionId).toBe(condition);
      expect(ProtocolConditionIdSchema.parse(conditionId)).toBe(condition);
      expect(decodeProtocolConditionId(conditionId)).toMatchObject({
        eventId: EVENT,
        conditionIndex: index,
        reserved: 0x0123456789abcdefn,
        resolutionChain: 0x0102,
      });
      for (const outcome of [0, 1] as const) {
        const positionId = deriveProtocolPositionId(conditionId, outcome);
        expect(positionId).toBe(decimalPosition(condition, outcome));
        expect(ProtocolPositionIdSchema.parse(positionId)).toBe(positionId);
        expect(decodeProtocolPositionId(positionId)).toMatchObject({
          conditionId: condition,
          eventId: EVENT,
          moduleId: ProtocolModule.Directional,
          arity: 4,
          conditionIndex: index,
          outcomeIndex: outcome,
          reserved: 0x0123456789abcdefn,
          resolutionChain: 0x0102,
        });
      }
    }
  });

  it('enforces module-specific arity and descriptor bounds', () => {
    const directional = `${EVENT.slice(0, 36)}0002${EVENT.slice(40)}`;
    const maximumDirectional = `${EVENT.slice(0, 36)}7fff${EVENT.slice(40)}`;
    const maximumNegRisk = `0x02${EVENT.slice(4, 36)}ffff${EVENT.slice(40)}`;
    for (const condition of [
      BINARY,
      COMBO,
      `${directional}0002`,
      `${directional}8001`,
      `${maximumDirectional}7fff`,
      `${maximumDirectional}fffe`,
      `${maximumNegRisk}ffff`,
    ]) {
      expect(ProtocolConditionIdSchema.safeParse(condition).success).toBe(true);
    }
    for (const condition of [
      `${BINARY.slice(0, -4)}0001`,
      `${COMBO.slice(0, -4)}0001`,
      `${EVENT.slice(0, 36)}0000${EVENT.slice(40)}0000`,
      `${EVENT.slice(0, 36)}0001${EVENT.slice(40)}0000`,
      `${EVENT.slice(0, 36)}8000${EVENT.slice(40)}0000`,
      `${directional}0003`,
      `${directional}8000`,
      `${directional}8002`,
      `${maximumDirectional}ffff`,
      `0x05${BUCKET.slice(4)}`,
    ]) {
      expect(
        ProtocolConditionIdSchema.safeParse(condition).success,
        condition,
      ).toBe(false);
    }
    expect(ProtocolEventIdSchema.safeParse(BINARY.slice(0, 60)).success).toBe(
      false,
    );
    expect(ProtocolEventIdSchema.safeParse(COMBO.slice(0, 60)).success).toBe(
      false,
    );
  });

  it('strictly rejects malformed uint256 and unsupported position descriptors', () => {
    for (const value of [
      '',
      '-1',
      '+1',
      '01',
      ' 1 ',
      '1.0',
      '1e3',
      '0xff',
      (1n << 256n).toString(),
      decimalPosition(THRESHOLD, 2),
      decimalPosition(`${EVENT}8000`, 0),
      decimalPosition(`0x05${BUCKET.slice(4)}`, 0),
    ]) {
      expect(ProtocolPositionIdSchema.safeParse(value).success, value).toBe(
        false,
      );
    }
    expect(
      ProtocolPositionIdSchema.safeParse(decimalPosition(BINARY, 0)).success,
    ).toBe(true);
    expect(
      ProtocolPositionIdSchema.safeParse(decimalPosition(COMBO, 1)).success,
    ).toBe(true);
  });
});

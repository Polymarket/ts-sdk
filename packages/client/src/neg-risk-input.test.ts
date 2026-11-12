import { describe, expect, it } from 'vitest';
import { NegRiskOperationInputSchema } from './neg-risk-input';

// Ids.sol at 5f3bb73: module2, baseHash, arity3, reserved0,
// resolutionChain255 and a uint16 condition index; bytes32 adds a zero byte.
const protocolEventId =
  '0x02111111111111111111111111111111110003000000000000000000ff';
const conditionId = `${protocolEventId}0002`;

describe('neg-risk market condition input', () => {
  it.each([
    { name: 'native condition', input: conditionId },
    { name: 'canonical padded condition', input: `${conditionId}00` },
    { name: 'uppercase hex', input: `0x${conditionId.slice(2).toUpperCase()}` },
  ])('canonicalizes $name without losing identity fields', ({ input }) => {
    expect(
      NegRiskOperationInputSchema.parse({ conditionId: input, amount: 1n }),
    ).toEqual({ conditionId, amount: 1n });
  });

  it('accepts condition zero, synthetic Other and full uint16/uint256 limits', () => {
    const largestEventId = protocolEventId.replace('0003', 'ffff');
    for (const input of [
      `${protocolEventId}0000`,
      `${protocolEventId}0003`,
      `${largestEventId}ffff00`,
    ]) {
      expect(
        NegRiskOperationInputSchema.safeParse({
          conditionId: input,
          amount: (1n << 256n) - 1n,
        }).success,
      ).toBe(true);
    }
  });

  it.each([
    { name: 'protocol event instead of condition', input: protocolEventId },
    { name: 'SDK event ID', input: '123' },
    { name: 'binary condition', input: conditionId.replace('0x02', '0x01') },
    { name: 'combo condition', input: conditionId.replace('0x02', '0x03') },
    { name: 'legacy condition', input: `0x${'11'.repeat(32)}` },
    { name: 'position with NO outcome', input: `${conditionId}01` },
    {
      name: 'nonzero reserved bits',
      input: `${protocolEventId.slice(0, 40)}0000000000000001${protocolEventId.slice(56)}0002`,
    },
    { name: 'one-condition arity', input: conditionId.replace('0003', '0001') },
    { name: 'condition outside arity', input: `${protocolEventId}0004` },
    { name: 'malformed hex', input: `${conditionId.slice(0, -1)}g` },
    { name: 'whitespace', input: ` ${conditionId}` },
  ])('rejects $name before preparing a transaction', ({ input }) => {
    expect(
      NegRiskOperationInputSchema.safeParse({ conditionId: input, amount: 1n })
        .success,
    ).toBe(false);
  });

  it.each([
    0n,
    -1n,
    1n << 256n,
    'max',
  ])('rejects invalid amount %s', (amount) => {
    expect(
      NegRiskOperationInputSchema.safeParse({ conditionId, amount }).success,
    ).toBe(false);
  });

  it('rejects separate protocol inputs that could contradict the market condition', () => {
    for (const extra of [
      { eventId: protocolEventId },
      { conditionIndex: 0 },
      { protocolEventId },
    ]) {
      expect(
        NegRiskOperationInputSchema.safeParse({
          conditionId,
          amount: 1n,
          ...extra,
        }).success,
      ).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { UserInputError } from '../../../errors';
import { parseUserInput } from '../../../input';
import { PerpsBuilderTermsInputSchema } from './builder-terms';

describe('Perps builder terms input', () => {
  const address = '0x1111111111111111111111111111111111111111';

  it.each([
    '0',
    '0.0005',
    '0.001',
    '0.0010000000000000000000000000',
    '0.0000000000000000000000000001',
  ])('preserves exact supported rate %s', (feeRate) => {
    expect(
      parseUserInput({ address, feeRate }, PerpsBuilderTermsInputSchema),
    ).toEqual({ address, feeRate });
  });

  it('validates the builder address at the input boundary', () => {
    expect(() =>
      parseUserInput(
        { address: 'invalid', feeRate: '0.0005' },
        PerpsBuilderTermsInputSchema,
      ),
    ).toThrow(UserInputError);
  });

  it('copies terms so later caller mutation does not change parsed settings', () => {
    const input = { address, feeRate: '0.0005' };
    const parsed = parseUserInput(input, PerpsBuilderTermsInputSchema);
    input.feeRate = '0.001';
    expect(parsed.feeRate).toBe('0.0005');
  });
});

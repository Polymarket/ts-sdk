import { describe, expect, it } from 'vitest';
import { PerpsRegistrationResponseSchema } from './registration';

describe('Perps registration response', () => {
  it.each([
    true,
    false,
  ])('returns the boolean %s without an envelope', (registered) => {
    expect(PerpsRegistrationResponseSchema.parse({ registered })).toBe(
      registered,
    );
  });

  it.each([
    {},
    null,
    true,
    { registered: null },
    { registered: 0 },
    { registered: 'false' },
  ])('rejects malformed responses: %j', (response) => {
    expect(PerpsRegistrationResponseSchema.safeParse(response).success).toBe(
      false,
    );
  });
});

import { describe, expect, it } from 'vitest';
import { createPublicClient } from '../clients';
import { UserInputError } from '../errors';

describe('account-funding input validation', () => {
  const client = createPublicClient();

  it('reports malformed wallet addresses as user input errors', async () => {
    await expect(
      client.createDepositAddresses({ wallet: 'not-an-address' }),
    ).rejects.toBeInstanceOf(UserInputError);
  });

  it('reports malformed builder codes as user input errors', async () => {
    await expect(
      client.createDepositAddresses({
        builderCode: 'not-a-builder-code',
        wallet: '0x0000000000000000000000000000000000000001',
      }),
    ).rejects.toBeInstanceOf(UserInputError);
  });
});

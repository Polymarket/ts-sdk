import { Wallet } from 'ethers-v5';
import { describe, expect, it } from 'vitest';
import { createApiKeyAuthTypedDataPayload } from './authentication';
import { UserInputError } from './errors';
import { signerFrom } from './ethers-v5';
import { privateKey } from './viem';

const TEST_PRIVATE_KEY =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

describe('viem', () => {
  describe('privateKey', () => {
    it('creates a signer from a private key', async () => {
      const signer = privateKey(TEST_PRIVATE_KEY);

      await expect(signer.getAddress()).resolves.toBe(
        '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
      );
      await expect(signer.signMessage('0x1234')).resolves.toMatch(
        /^0x[0-9a-f]+$/i,
      );
      await expect(
        signer.signTypedData({
          domain: {
            chainId: 137,
            name: 'Polymarket SDK Test',
            version: '1',
          },
          message: {
            value: 'hello',
          },
          primaryType: 'TestMessage',
          types: {
            TestMessage: [{ name: 'value', type: 'string' }],
          },
        }),
      ).resolves.toMatch(/^0x[0-9a-f]+$/i);
    });

    it('signs explicit authentication domains consistently across wallet adapters', async () => {
      const signer = privateKey(TEST_PRIVATE_KEY);
      const payload = createApiKeyAuthTypedDataPayload({
        address: await signer.getAddress(),
        chainId: 137,
        timestamp: 1_739_491_200,
      });

      const { EIP712Domain, ...types } = payload.types;
      expect(EIP712Domain).toEqual([
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
      ]);
      const signature = await signer.signTypedData(payload);
      await expect(
        signer.signTypedData({
          ...payload,
          types,
        }),
      ).resolves.toBe(signature);
      await expect(
        signerFrom(new Wallet(TEST_PRIVATE_KEY)).signTypedData(payload),
      ).resolves.toBe(signature);
    });

    it('rejects invalid private keys', () => {
      expect(() => privateKey(undefined)).toThrow(UserInputError);
      expect(() => privateKey('0x1234')).toThrow(UserInputError);
    });
  });
});

import { expectEvmAddress } from '@polymarket/types';
import { Wallet } from 'ethers-v5';
import { createWalletClient, http } from 'viem';
import * as viemActions from 'viem/actions';
import { polygon } from 'viem/chains';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiKeyAuthTypedDataPayload } from './authentication';
import {
  TransactionFailedError,
  TransportError,
  UserInputError,
} from './errors';
import { signerFrom } from './ethers-v5';
import { privateKey, signerFrom as viemSignerFrom } from './viem';

// Isolate receipt delivery at the wallet-adapter boundary to reproduce reverts
// and RPC failures deterministically without a fabricated SDK client.
vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  waitForTransactionReceipt: vi.fn(),
}));

const TEST_PRIVATE_KEY =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

describe('viem', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('direct transaction settlement', () => {
    const address = expectEvmAddress(
      '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
    );
    const transactionHash = `0x${'ab'.repeat(32)}` as const;

    it('preserves a confirmed revert as TransactionFailedError', async () => {
      const wallet = createWalletClient({
        account: address,
        chain: polygon,
        transport: http(),
      });
      vi.spyOn(wallet, 'sendTransaction').mockResolvedValueOnce(
        transactionHash,
      );
      vi.mocked(viemActions.waitForTransactionReceipt).mockResolvedValueOnce({
        blockHash: transactionHash,
        blockNumber: 1n,
        contractAddress: null,
        cumulativeGasUsed: 21_000n,
        effectiveGasPrice: 1n,
        from: address,
        gasUsed: 21_000n,
        logs: [],
        logsBloom: `0x${'00'.repeat(256)}`,
        status: 'reverted',
        to: address,
        transactionHash,
        transactionIndex: 0,
        type: 'eip1559',
      });

      const handle = await viemSignerFrom(wallet).sendTransaction({
        chainId: polygon.id,
        to: address,
      });
      const failure = await handle.wait().catch((error) => error);

      expect(failure).toBeInstanceOf(TransactionFailedError);
      expect(failure).not.toBeInstanceOf(TransportError);
      expect(failure.message).toContain(transactionHash);
    });

    it('keeps a receipt RPC failure as TransportError', async () => {
      const wallet = createWalletClient({
        account: address,
        chain: polygon,
        transport: http(),
      });
      vi.spyOn(wallet, 'sendTransaction').mockResolvedValueOnce(
        transactionHash,
      );
      vi.mocked(viemActions.waitForTransactionReceipt).mockRejectedValueOnce(
        new Error('RPC connection lost'),
      );

      const handle = await viemSignerFrom(wallet).sendTransaction({
        chainId: polygon.id,
        to: address,
      });
      const failure = await handle.wait().catch((error) => error);

      expect(failure).toBeInstanceOf(TransportError);
      expect(failure).not.toBeInstanceOf(TransactionFailedError);
      expect(failure.message).toContain('RPC connection lost');
    });
  });

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

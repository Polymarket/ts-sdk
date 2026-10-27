import { expectEvmAddress } from '@polymarket/types';
import { describe, expect, it, vi } from 'vitest';
import type { NegRiskWorkflow } from './actions/neg-risk';
import { SigningError } from './errors';
import {
  expectTransactionHandle,
  type Signer,
  type TransactionHandle,
} from './types';
import { completeWith } from './workflow';

describe('neg-risk transaction workflow completion', () => {
  it.each([
    'sendConvertTransaction',
    'sendHorizontalSplitTransaction',
    'sendHorizontalMergeTransaction',
  ] as const)('dispatches %s once and leaves confirmation explicit', async (kind) => {
    const request = {
      chainId: 137,
      to: expectEvmAddress('0x12121212006e4CD160D18e3f00711DA5c3372600'),
      data: '0x1234' as const,
    };
    const handle: TransactionHandle = {
      transactionHash: null,
      transactionId: null,
      wait: vi.fn(),
    };
    const signer: Signer = {
      getAddress: vi.fn(),
      signTypedData: vi.fn(),
      signMessage: vi.fn(),
      sendTransaction: vi.fn().mockResolvedValue(handle),
    };
    async function* workflow(): NegRiskWorkflow {
      return expectTransactionHandle(yield { kind, request });
    }
    expect(await completeWith(signer)(workflow())).toBe(handle);
    expect(signer.sendTransaction).toHaveBeenCalledExactlyOnceWith(request);
    expect(handle.wait).not.toHaveBeenCalled();
    expect(signer.signTypedData).not.toHaveBeenCalled();
    expect(signer.signMessage).not.toHaveBeenCalled();
    signer.sendTransaction = vi
      .fn()
      .mockRejectedValue(new SigningError('Wallet rejected transaction'));
    await expect(completeWith(signer)(workflow())).rejects.toBeInstanceOf(
      SigningError,
    );
  });
});

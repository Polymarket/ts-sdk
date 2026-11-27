import { expectEvmAddress } from '@polymarket/types';
import { PrivyClient } from '@privy-io/node';
import { WaitForTransactionReceiptTimeoutError } from 'viem';
import * as viemActions from 'viem/actions';
import { polygon } from 'viem/chains';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError, TransactionFailedError, TransportError } from './errors';
import { signerFrom } from './privy';

// Control receipt delivery at the wallet adapter boundary so mined reverts and
// unavailable RPCs can be distinguished without submitting live transactions.
vi.mock('viem/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/actions')>()),
  waitForTransactionReceipt: vi.fn(),
}));

const address = expectEvmAddress(`0x${'12'.repeat(20)}`);
const transactionHash = `0x${'ab'.repeat(32)}` as const;
const replacementHash = `0x${'cd'.repeat(32)}` as const;

async function sendTransaction() {
  const privy = new PrivyClient({
    appId: 'test-app-id',
    appSecret: 'test-app-secret',
  });
  vi.spyOn(privy.wallets().ethereum(), 'sendTransaction').mockResolvedValueOnce(
    {
      hash: transactionHash,
      caip2: `eip155:${polygon.id}`,
      transaction_id: 'test-transaction-id',
    },
  );
  return signerFrom({ privy, walletId: 'test-wallet-id' }).sendTransaction({
    chainId: polygon.id,
    to: address,
  });
}

function receipt(status: 'success' | 'reverted') {
  return {
    blockHash: replacementHash,
    blockNumber: 1n,
    contractAddress: null,
    cumulativeGasUsed: 21_000n,
    effectiveGasPrice: 1n,
    from: address,
    gasUsed: 21_000n,
    logs: [],
    logsBloom: `0x${'00'.repeat(256)}` as const,
    status,
    to: address,
    transactionHash: replacementHash,
    transactionIndex: 0,
    type: 'eip1559' as const,
  };
}

describe('Privy direct transaction settlement', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves a mined revert and its replacement hash as a definite failure', async () => {
    vi.mocked(viemActions.waitForTransactionReceipt).mockResolvedValueOnce(
      receipt('reverted'),
    );
    const handle = await sendTransaction();
    const failure = await handle.wait().catch((error) => error);

    expect(failure).toBeInstanceOf(TransactionFailedError);
    expect(failure).not.toBeInstanceOf(TransportError);
    expect(failure.message).toContain(replacementHash);
    expect(handle.transactionHash).toBe(replacementHash);
  });

  it('keeps RPC failures uncertain and allows waiting again on the same transaction', async () => {
    vi.mocked(viemActions.waitForTransactionReceipt)
      .mockRejectedValueOnce(new Error('RPC connection lost'))
      .mockResolvedValueOnce(receipt('success'));
    const handle = await sendTransaction();
    const failure = await handle.wait().catch((error) => error);

    expect(failure).toBeInstanceOf(TransportError);
    expect(failure).not.toBeInstanceOf(TransactionFailedError);
    expect(handle.transactionHash).toBe(transactionHash);
    await expect(handle.wait()).resolves.toEqual({
      transactionHash: replacementHash,
      transactionId: null,
    });
    expect(viemActions.waitForTransactionReceipt).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { hash: transactionHash },
    );
  });

  it('keeps receipt timeouts distinct from mined failures', async () => {
    vi.mocked(viemActions.waitForTransactionReceipt).mockRejectedValueOnce(
      new WaitForTransactionReceiptTimeoutError({ hash: transactionHash }),
    );
    const handle = await sendTransaction();

    await expect(handle.wait()).rejects.toBeInstanceOf(TimeoutError);
    expect(handle.transactionHash).toBe(transactionHash);
  });
});

import { WalletType } from '@polymarket/bindings/gamma';
import {
  type RelayerDepositWalletExecuteRequest,
  type RelayerLegacyExecuteRequest,
  RelayerTransactionType,
} from '@polymarket/bindings/relayer';
import {
  type EvmAddress,
  type EvmSignature,
  expectEvmAddress,
  expectEvmSignature,
  expectHexString,
  type NonEmptyArray,
} from '@polymarket/types';
import { describe, expect, it, vi } from 'vitest';
import { encodeProxyCall, encodeSafeMultisendCall } from '../abis';
import { production } from '../environments';
import { RequestRejectedError } from '../errors';
import type { TransactionCall, TransactionHandle } from '../types';
import { type AccountIdentity, SignerType } from '../wallet';
import type { GaslessWorkflowRequest } from './gasless';
import {
  resignDepositWalletEnvelope,
  signDepositWalletEnvelope,
  signProxyWalletEnvelope,
  signSafeWalletEnvelope,
} from './gasless/envelopes';
import { submitGaslessWorkflow } from './gasless/submission';

const signer = expectEvmAddress('0x1111111111111111111111111111111111111111');
const wallet = expectEvmAddress('0x2222222222222222222222222222222222222222');
const relay = expectEvmAddress('0x3333333333333333333333333333333333333333');
const target = production.contracts.protocolV2Router;
const signature = expectEvmSignature(`0x${'11'.repeat(64)}1b`);
const account: AccountIdentity = {
  signer,
  wallet,
  signerType: SignerType.OWNER,
  walletType: WalletType.DEPOSIT_WALLET,
};
const calls: NonEmptyArray<TransactionCall> = [
  { to: target, data: expectHexString('0xdeadbeef'), value: 0n },
];
const handle: TransactionHandle = {
  transactionId: null,
  transactionHash: null,
  wait: vi.fn(),
};
type Envelope =
  | RelayerDepositWalletExecuteRequest
  | RelayerLegacyExecuteRequest;
type SigningWorkflow<T> = AsyncGenerator<
  GaslessWorkflowRequest,
  T,
  EvmAddress | EvmSignature | TransactionHandle
>;

async function sign<T>(
  workflow: SigningWorkflow<T>,
  requests: GaslessWorkflowRequest[] = [],
): Promise<T> {
  let step = await workflow.next();
  while (!step.done) {
    requests.push(step.value);
    expect(['signGaslessMessage', 'signGaslessTypedData']).toContain(
      step.value.kind,
    );
    step = await workflow.next(signature);
  }
  return step.value;
}

function buildDeposit(nonce = '7') {
  return signDepositWalletEnvelope({
    account,
    calls,
    chainId: production.chainId,
    factory: production.walletDerivation.depositWalletFactory,
    nonce,
    deadline: '1800000000',
    metadata: 'Collateral return',
  });
}
function resign(envelope: Envelope, nonce: string) {
  if (envelope.type !== RelayerTransactionType.WALLET)
    throw new Error('Expected Deposit Wallet envelope');
  return resignDepositWalletEnvelope(
    account,
    production.chainId,
    envelope,
    calls,
    nonce,
  );
}

describe('gasless signing envelopes', () => {
  it('signs the exact Deposit Wallet batch including its chain, nonce and deadline', async () => {
    const requests: GaslessWorkflowRequest[] = [];
    const envelope = await sign(buildDeposit(), requests);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      kind: 'signGaslessTypedData',
      payload: {
        domain: {
          chainId: production.chainId,
          verifyingContract: wallet,
          name: 'DepositWallet',
          version: '1',
        },
        message: {
          wallet,
          nonce: 7n,
          deadline: 1800000000n,
          calls: [{ data: '0xdeadbeef', target, value: 0n }],
        },
      },
    });
    expect(envelope).toMatchObject({
      type: 'WALLET',
      from: signer,
      signature,
      nonce: '7',
      metadata: 'Collateral return',
      depositWalletParams: {
        depositWallet: wallet,
        deadline: '1800000000',
        calls: [{ target, value: '0', data: '0xdeadbeef' }],
      },
    });
  });

  it('carries the router call in a single-call Safe envelope', async () => {
    const requests: GaslessWorkflowRequest[] = [];
    const envelope = await sign(
      signSafeWalletEnvelope({
        account: { ...account, walletType: WalletType.GNOSIS_SAFE },
        calls,
        chainId: production.chainId,
        nonce: '7',
        safeMultisend: production.contracts.safeMultisend,
        metadata: 'Collateral return',
      }),
      requests,
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.kind).toBe('signGaslessMessage');
    expect(envelope).toMatchObject({
      type: 'SAFE',
      to: target,
      data: '0xdeadbeef',
      nonce: '7',
      signatureParams: { operation: '0' },
    });
  });

  it('uses Safe multisend for multiple calls', async () => {
    const batch: NonEmptyArray<TransactionCall> = [
      ...calls,
      { ...calls[0], value: 1n },
    ];
    const envelope = await sign(
      signSafeWalletEnvelope({
        account: { ...account, walletType: WalletType.GNOSIS_SAFE },
        calls: batch,
        chainId: production.chainId,
        nonce: '7',
        safeMultisend: production.contracts.safeMultisend,
      }),
    );
    expect(envelope).toMatchObject({
      to: production.contracts.safeMultisend,
      data: encodeSafeMultisendCall(batch),
      signatureParams: { operation: '1' },
    });
  });

  it.each([
    ['00', '1f'],
    ['01', '20'],
    ['1b', '1f'],
    ['1c', '20'],
    ['1f', '1f'],
  ])('normalizes Safe signature v=%s to %s', async (v, packed) => {
    const workflow = signSafeWalletEnvelope({
      account: { ...account, walletType: WalletType.GNOSIS_SAFE },
      calls,
      chainId: production.chainId,
      nonce: '7',
      safeMultisend: production.contracts.safeMultisend,
    });
    await workflow.next();
    const result = await workflow.next(
      expectEvmSignature(`0x${'11'.repeat(64)}${v}`),
    );
    expect(result.done).toBe(true);
    expect(result.value).toMatchObject({
      signature: `0x${'11'.repeat(64)}${packed}`,
    });
  });

  it('wraps the router call for Proxy execution and carries the resolved gas and relay', async () => {
    const requests: GaslessWorkflowRequest[] = [];
    const envelope = await sign(
      signProxyWalletEnvelope({
        account: { ...account, walletType: WalletType.POLY_PROXY },
        data: encodeProxyCall(calls),
        metadata: 'Collateral return',
        executeParams: { address: relay, nonce: '7' },
        proxyFactory: production.walletDerivation.proxyFactory,
        relayHub: production.contracts.relayHub,
        gasLimit: 500_000n,
      }),
      requests,
    );
    expect(requests[0]?.kind).toBe('signGaslessMessage');
    expect(envelope).toMatchObject({
      type: 'PROXY',
      data: encodeProxyCall(calls),
      nonce: '7',
      signature,
      proxyWallet: wallet,
      signatureParams: {
        gasLimit: '500000',
        gasPrice: '0',
        relay,
        relayHub: production.contracts.relayHub,
        relayerFee: '0',
      },
    });
  });
});

describe('gasless submission recovery', () => {
  it('re-signs the same batch with the rejected nonce and resubmits once', async () => {
    const build = vi.fn(() => buildDeposit('3'));
    const submit = vi
      .fn<(envelope: Envelope) => Promise<TransactionHandle>>()
      .mockRejectedValueOnce(
        new RequestRejectedError(
          'batch nonce 3 does not match on-chain nonce 7',
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(handle);
    const requests: GaslessWorkflowRequest[] = [];
    expect(
      await sign(
        submitGaslessWorkflow({ build, submit, resign }, 10, 0),
        requests,
      ),
    ).toBe(handle);
    expect(build).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ payload: { message: { nonce: 3n } } });
    expect(requests[1]).toMatchObject({ payload: { message: { nonce: 7n } } });
    const [first, second] = submit.mock.calls;
    expect(second?.[0]).toEqual({ ...first?.[0], nonce: '7' });
  });

  it('rebuilds and signs again after a transient wallet-busy rejection', async () => {
    let nonce = 7;
    const build = vi.fn(() => buildDeposit(`${nonce++}`));
    const submit = vi
      .fn<(envelope: Envelope) => Promise<TransactionHandle>>()
      .mockRejectedValueOnce(
        new RequestRejectedError(
          'wallet busy: another active action is in flight',
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(handle);
    const requests: GaslessWorkflowRequest[] = [];
    expect(
      await sign(
        submitGaslessWorkflow({ build, submit, resign }, 10, 0),
        requests,
      ),
    ).toBe(handle);
    expect(build).toHaveBeenCalledTimes(2);
    expect(requests).toHaveLength(2);
    expect(submit.mock.calls.map(([envelope]) => envelope.nonce)).toEqual([
      '7',
      '8',
    ]);
  });

  it('rebuilds after a corrected-nonce resubmission is rejected as wallet busy', async () => {
    let nonce = 3;
    const build = vi.fn(() => buildDeposit(`${nonce++}`));
    const submit = vi
      .fn<(envelope: Envelope) => Promise<TransactionHandle>>()
      .mockRejectedValueOnce(
        new RequestRejectedError(
          'batch nonce 3 does not match on-chain nonce 7',
          { status: 400 },
        ),
      )
      .mockRejectedValueOnce(
        new RequestRejectedError(
          'wallet busy: another active action is in flight',
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(handle);
    const requests: GaslessWorkflowRequest[] = [];
    expect(
      await sign(
        submitGaslessWorkflow({ build, submit, resign }, 10, 0),
        requests,
      ),
    ).toBe(handle);
    expect(build).toHaveBeenCalledTimes(2);
    expect(requests).toHaveLength(3);
    expect(submit.mock.calls.map(([envelope]) => envelope.nonce)).toEqual([
      '3',
      '7',
      '4',
    ]);
  });

  it('does not retry a rejected plan', async () => {
    const rejection = new RequestRejectedError('fresh plan required', {
      status: 409,
    });
    const build = vi.fn(() => buildDeposit());
    const submit = vi.fn().mockRejectedValue(rejection);
    await expect(
      sign(submitGaslessWorkflow({ build, submit, resign }, 10, 0)),
    ).rejects.toBe(rejection);
    expect(build).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('stops rebuilding after the configured retry limit', async () => {
    const rejection = new RequestRejectedError(
      'wallet busy: another active action is in flight',
      { status: 400 },
    );
    const build = vi.fn(() => buildDeposit());
    const submit = vi.fn().mockRejectedValue(rejection);
    await expect(
      sign(submitGaslessWorkflow({ build, submit }, 2, 0)),
    ).rejects.toBe(rejection);
    expect(build).toHaveBeenCalledTimes(3);
    expect(submit).toHaveBeenCalledTimes(3);
  });

  it('propagates a non-transient nonce rejection when no re-signing operation exists', async () => {
    const rejection = new RequestRejectedError(
      'batch nonce 7 does not match on-chain nonce 3',
      { status: 400 },
    );
    const submit = vi.fn().mockRejectedValue(rejection);
    await expect(
      sign(
        submitGaslessWorkflow({ build: () => buildDeposit(), submit }, 10, 0),
      ),
    ).rejects.toBe(rejection);
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

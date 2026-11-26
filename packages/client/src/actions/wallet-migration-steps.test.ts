import {
  WalletMigrationKnownState,
  WalletMigrationNextAction,
  type WalletMigrationStep,
  WalletMigrationSweepShape,
} from '@polymarket/bindings/gamma';
import {
  expectEvmAddress,
  expectEvmSignature,
  type HexString,
  ZERO_ADDRESS,
} from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import {
  RequestRejectedError,
  TimeoutError,
  TransactionFailedError,
  UnexpectedResponseError,
} from '../errors';
import {
  runWalletMigrationSteps,
  safeCreateTypedData,
  type WalletMigrationExecuteBody,
  type WalletMigrationSteps,
} from './wallet-migration-steps';

const depositWallet = expectEvmAddress(
  '0x00000000000000000000000000000000000000d1',
);
const digest = `0x${'ab'.repeat(32)}` as HexString;
const signature = expectEvmSignature(`0x${'1'.repeat(130)}`);

function step(
  state: WalletMigrationKnownState,
  nextAction: WalletMigrationNextAction,
  extra: Partial<WalletMigrationStep> = {},
): WalletMigrationStep {
  return { state, depositWallet, nextAction, ...extra };
}

function fakeSteps(
  starts: WalletMigrationStep[],
  execute: (body: WalletMigrationExecuteBody) => Promise<WalletMigrationStep>,
  maxPolls = 5,
): WalletMigrationSteps & { calls: string[] } {
  const calls: string[] = [];
  const pending = [...starts];
  return {
    calls,
    maxPolls,
    async start() {
      calls.push('start');
      const next = pending.shift();
      if (next === undefined) throw new Error('No start step left.');
      return next;
    },
    async execute(body) {
      calls.push(`execute ${JSON.stringify(body)}`);
      return execute(body);
    },
    async sign() {
      calls.push('sign');
      return signature;
    },
    async wait() {
      calls.push('wait');
    },
  };
}

describe('runWalletMigrationSteps', () => {
  it('signs a sweep once, executes it, waits, polls and returns the completed step', async () => {
    const completed = step(
      WalletMigrationKnownState.Completed,
      WalletMigrationNextAction.None,
    );
    const answers = [
      step(
        WalletMigrationKnownState.RequiresFundsTransfers,
        WalletMigrationNextAction.Execute,
        { sweepSubmitted: true },
      ),
      completed,
    ];
    const steps = fakeSteps(
      [
        step(
          WalletMigrationKnownState.RequiresFundsTransfers,
          WalletMigrationNextAction.Sign,
          { sweep: { digest, shape: WalletMigrationSweepShape.Proxy } },
        ),
      ],
      async () => answers.shift() ?? completed,
    );
    await expect(runWalletMigrationSteps(steps)).resolves.toEqual(completed);
    expect(steps.calls).toEqual([
      'start',
      'sign',
      `execute ${JSON.stringify({ signature, digest })}`,
      'wait',
      'execute {}',
    ]);
  });

  it('calls the start request again after a conflict and finishes', async () => {
    const completed = step(
      WalletMigrationKnownState.Completed,
      WalletMigrationNextAction.None,
    );
    const steps = fakeSteps(
      [
        step(
          WalletMigrationKnownState.RequiresFundsTransfers,
          WalletMigrationNextAction.Execute,
        ),
        completed,
      ],
      async () => {
        throw new RequestRejectedError('Conflict', { status: 409 });
      },
    );
    await expect(runWalletMigrationSteps(steps)).resolves.toEqual(completed);
    expect(steps.calls).toEqual(['start', 'wait', 'execute {}', 'start']);
  });

  it('stops a flow that keeps conflicting after three restarts and keeps the conflict as the cause', async () => {
    const confirming = step(
      WalletMigrationKnownState.RequiresFundsTransfers,
      WalletMigrationNextAction.Execute,
    );
    const conflict = new RequestRejectedError('Conflict', { status: 409 });
    const steps = fakeSteps(Array(4).fill(confirming), async () => {
      throw conflict;
    });
    const failure = await runWalletMigrationSteps(steps).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(UnexpectedResponseError);
    expect(failure).toMatchObject({ cause: conflict });
    expect(steps.calls.filter((call) => call === 'start')).toHaveLength(4);
  });

  it('waits before the first poll of a resumed migration and stops at the poll limit', async () => {
    const confirming = step(
      WalletMigrationKnownState.RequiresFundsTransfers,
      WalletMigrationNextAction.Execute,
      { sweepSubmitted: true },
    );
    const steps = fakeSteps([confirming], async () => confirming, 1);
    await expect(runWalletMigrationSteps(steps)).rejects.toBeInstanceOf(
      TimeoutError,
    );
    expect(steps.calls).toEqual(['start', 'wait', 'execute {}']);
  });

  it('stops a flow that keeps asking for signatures after one start request', async () => {
    const signing = step(
      WalletMigrationKnownState.RequiresFundsTransfers,
      WalletMigrationNextAction.Sign,
      { sweep: { digest, shape: WalletMigrationSweepShape.Proxy } },
    );
    const steps = fakeSteps([signing], async () => signing);
    await expect(runWalletMigrationSteps(steps)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    expect(steps.calls.filter((call) => call === 'sign')).toHaveLength(2);
  });

  it('throws for a failed step whatever its next action', async () => {
    const steps = fakeSteps(
      [
        step(WalletMigrationKnownState.Failed, WalletMigrationNextAction.None, {
          failedReason: 'sweep reverted',
        }),
      ],
      async () => {
        throw new Error('The flow must not execute.');
      },
    );
    await expect(runWalletMigrationSteps(steps)).rejects.toBeInstanceOf(
      TransactionFailedError,
    );
  });
});

describe('safeCreateTypedData', () => {
  const environment = {
    chainId: 137,
    safeFactory: expectEvmAddress('0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b'),
  };
  const createProxy = [
    { name: 'paymentToken', type: 'address' },
    { name: 'payment', type: 'uint256' },
    { name: 'paymentReceiver', type: 'address' },
  ];
  const typedData = {
    primaryType: 'CreateProxy',
    domain: {
      name: 'Polymarket Contract Proxy Factory',
      chainId: 137,
      verifyingContract: environment.safeFactory,
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      CreateProxy: createProxy,
    },
    message: {
      paymentToken: ZERO_ADDRESS,
      payment: '0',
      paymentReceiver: ZERO_ADDRESS,
    },
  };

  it('returns the fixed payload for the Polymarket Safe factory, with or without the domain type', () => {
    const expected = {
      domain: {
        name: 'Polymarket Contract Proxy Factory',
        chainId: 137,
        verifyingContract: environment.safeFactory,
      },
      primaryType: 'CreateProxy',
      types: { CreateProxy: createProxy },
      message: {
        paymentToken: ZERO_ADDRESS,
        payment: 0n,
        paymentReceiver: ZERO_ADDRESS,
      },
    };
    expect(safeCreateTypedData(environment, typedData)).toEqual(expected);
    expect(
      safeCreateTypedData(environment, {
        ...typedData,
        types: { CreateProxy: createProxy },
      }),
    ).toEqual(expected);
  });

  it('refuses a Safe deployment that asks for a payment', () => {
    expect(() =>
      safeCreateTypedData(environment, {
        ...typedData,
        message: { ...typedData.message, payment: '1' },
      }),
    ).toThrow(UnexpectedResponseError);
  });
});

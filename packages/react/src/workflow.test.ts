import type { Signer, TypedDataPayload } from '@polymarket/client';
import { CancelledSigningError } from '@polymarket/client';
import type { EvmAddress, EvmSignature } from '@polymarket/types';
import { expectEvmAddress, expectEvmSignature } from '@polymarket/types';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowRequest, WorkflowResponse } from './workflow';
import {
  driveWorkflow,
  WorkflowCancelled,
  workflowHandlerFrom,
} from './workflow';

const address = expectEvmAddress(`0x${'1'.repeat(40)}`);
const signature = expectEvmSignature(`0x${'2'.repeat(130)}`);

const payload: TypedDataPayload = {
  domain: { name: 'Test', version: '1', chainId: 137 },
  types: { Message: [{ name: 'value', type: 'string' }] },
  primaryType: 'Message',
  message: { value: 'hello' },
};

describe('driveWorkflow', () => {
  it('answers each yield through the handler and returns the result', async () => {
    const steps: string[] = [];

    async function* workflow(): AsyncGenerator<
      WorkflowRequest,
      string,
      WorkflowResponse
    > {
      const resolved = yield { kind: 'requestAddress' };
      const signed = yield { kind: 'signAuthMessage', payload };
      return `${resolved}:${signed}`;
    }

    const result = await driveWorkflow(workflow(), async (request) => {
      steps.push(request.kind);
      return request.kind === 'requestAddress' ? address : signature;
    });

    expect(result).toBe(`${address}:${signature}`);
    expect(steps).toEqual(['requestAddress', 'signAuthMessage']);
  });

  it('reports each step through onStep', async () => {
    const onStep = vi.fn();

    async function* workflow(): AsyncGenerator<
      WorkflowRequest,
      undefined,
      WorkflowResponse
    > {
      yield { kind: 'requestAddress' };
      yield { kind: 'signGaslessMessage', payload: `0x${'3'.repeat(8)}` };
      return undefined;
    }

    await driveWorkflow(
      workflow(),
      async (request) =>
        request.kind === 'requestAddress' ? address : signature,
      onStep,
    );

    expect(onStep.mock.calls).toEqual([
      ['requestAddress'],
      ['signGaslessMessage'],
    ]);
  });

  it('throws CancelledSigningError and closes the workflow on cancel', async () => {
    let finallyRan = false;

    async function* workflow(): AsyncGenerator<
      WorkflowRequest,
      string,
      WorkflowResponse
    > {
      try {
        yield { kind: 'signAuthMessage', payload };
        return 'unreachable';
      } finally {
        finallyRan = true;
      }
    }

    await expect(
      driveWorkflow(workflow(), async (_request, { cancel }) =>
        cancel('User declined'),
      ),
    ).rejects.toThrow(CancelledSigningError);

    expect(finallyRan).toBe(true);
  });

  it('closes the workflow and rethrows when the handler fails', async () => {
    const failure = new Error('wallet unavailable');
    let finallyRan = false;

    async function* workflow(): AsyncGenerator<
      WorkflowRequest,
      string,
      WorkflowResponse
    > {
      try {
        yield { kind: 'signAuthMessage', payload };
        return 'unreachable';
      } finally {
        finallyRan = true;
      }
    }

    await expect(
      driveWorkflow(workflow(), async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(finallyRan).toBe(true);
  });
});

describe('workflowHandlerFrom', () => {
  function createSigner(): Signer & { calls: string[] } {
    const calls: string[] = [];

    return {
      calls,
      getAddress(): Promise<EvmAddress> {
        calls.push('getAddress');
        return Promise.resolve(address);
      },
      signMessage(): Promise<EvmSignature> {
        calls.push('signMessage');
        return Promise.resolve(signature);
      },
      signTypedData(): Promise<EvmSignature> {
        calls.push('signTypedData');
        return Promise.resolve(signature);
      },
      sendTransaction(): never {
        throw new Error('Unexpected sendTransaction call');
      },
    };
  }

  it('maps each request kind to the matching signer capability', async () => {
    const signer = createSigner();
    const handler = workflowHandlerFrom(signer);
    const controls = {
      cancel: (reason?: string) => new WorkflowCancelled(reason),
    };

    await expect(handler({ kind: 'requestAddress' }, controls)).resolves.toBe(
      address,
    );
    await expect(
      handler({ kind: 'signAuthMessage', payload }, controls),
    ).resolves.toBe(signature);
    await expect(
      handler({ kind: 'signOrder', payload }, controls),
    ).resolves.toBe(signature);
    await expect(
      handler({ kind: 'signGaslessTypedData', payload }, controls),
    ).resolves.toBe(signature);
    await expect(
      handler(
        { kind: 'signGaslessMessage', payload: `0x${'4'.repeat(8)}` },
        controls,
      ),
    ).resolves.toBe(signature);

    expect(signer.calls).toEqual([
      'getAddress',
      'signTypedData',
      'signTypedData',
      'signTypedData',
      'signMessage',
    ]);
  });
});

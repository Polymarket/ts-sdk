import { WalletType } from '@polymarket/bindings/gamma';
import {
  errAsync,
  expectEvmAddress,
  expectHexString,
  okAsync,
  type ResultAsync,
} from '@polymarket/types';
import { describe, expect, it, vi } from 'vitest';
import type { BaseSecureClient } from '../clients';
import { forkEnvironmentConfig } from '../environments';
import { RequestRejectedError } from '../errors';
import type { Signer, TypedDataPayload } from '../types';
import { completeWith } from '../workflow';
import { prepareGaslessTransaction } from './gasless';

const SIGNER = expectEvmAddress('0x1111111111111111111111111111111111111111');
const WALLET = expectEvmAddress('0x2222222222222222222222222222222222222222');
const RELAY = expectEvmAddress('0x3333333333333333333333333333333333333333');
const TARGET = expectEvmAddress('0x4444444444444444444444444444444444444444');
const SIGNATURE = `0x${'11'.repeat(65)}`;
const SECOND_SIGNATURE = `0x${'22'.repeat(65)}`;

const environment = forkEnvironmentConfig({
  name: 'test',
  relayerPollFrequencyMs: 0,
});

const executeParamsWire = { address: RELAY, nonce: '3' };
const submitResponseWire = {
  state: 'STATE_NEW',
  transactionHash: null,
  transactionID: 'tx-1',
};

describe('prepareGaslessTransaction', () => {
  it('re-signs with the nonce from a submit nonce rejection and resubmits once', async () => {
    const { client, relayerGet, relayerPost, signTypedData } = createClient({
      submitResults: [
        errAsync(nonceMismatchRejection(3, 7)),
        okAsync(jsonResponse(submitResponseWire)),
      ],
    });

    const handle = await executeRepresentativeGaslessTransaction(client);

    expect(handle.transactionId).toBe('tx-1');
    expect(signTypedData).toHaveBeenCalledTimes(2);
    const firstSignedMessage = signTypedData.mock.calls[0]?.[0]?.message;
    expect(firstSignedMessage).toMatchObject({ nonce: 3n });
    expect(signTypedData.mock.calls[1]?.[0]?.message).toEqual({
      ...firstSignedMessage,
      nonce: 7n,
    });
    expect(relayerGet).toHaveBeenCalledTimes(1);

    const payloads = submitPayloads(relayerPost);
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toEqual({
      ...(payloads[0] as Record<string, unknown>),
      nonce: '7',
      signature: SECOND_SIGNATURE,
    });
  });

  it('propagates the error when the corrected resubmission is rejected', async () => {
    const { client, relayerPost, signTypedData } = createClient({
      submitResults: [
        errAsync(nonceMismatchRejection(3, 7)),
        errAsync(nonceMismatchRejection(7, 2)),
      ],
    });

    await expect(
      executeRepresentativeGaslessTransaction(client),
    ).rejects.toThrow(/batch nonce 7 does not match on-chain nonce 2/);
    expect(signTypedData).toHaveBeenCalledTimes(2);
    expect(submitPayloads(relayerPost)).toHaveLength(2);
  });

  it('rethrows submit rejections without a nonce mismatch unchanged', async () => {
    const rejection = new RequestRejectedError(
      `deposit wallet ${WALLET} is not deployed (https://relayer.polymarket.com/submit)`,
      { status: 400 },
    );
    const { client, relayerPost, signTypedData } = createClient({
      submitResults: [errAsync(rejection)],
    });

    await expect(executeRepresentativeGaslessTransaction(client)).rejects.toBe(
      rejection,
    );
    expect(signTypedData).toHaveBeenCalledTimes(1);
    expect(submitPayloads(relayerPost)).toHaveLength(1);
  });

  it('retries transient rejections through a fresh preparation', async () => {
    const { client, relayerGet, relayerPost, signTypedData } = createClient({
      submitResults: [
        errAsync(
          new RequestRejectedError(
            'wallet busy: active action exists (https://relayer.polymarket.com/submit)',
            { status: 400 },
          ),
        ),
        okAsync(jsonResponse(submitResponseWire)),
      ],
    });

    const handle = await executeRepresentativeGaslessTransaction(client);

    expect(handle.transactionId).toBe('tx-1');
    expect(signTypedData).toHaveBeenCalledTimes(2);
    expect(relayerGet).toHaveBeenCalledTimes(2);
    expect(submitPayloads(relayerPost)).toHaveLength(2);
  });
});

function nonceMismatchRejection(
  submitted: number,
  onChain: number,
): RequestRejectedError {
  return new RequestRejectedError(
    `batch nonce ${submitted} does not match on-chain nonce ${onChain} (https://relayer.polymarket.com/submit)`,
    { status: 400 },
  );
}

type CreateClientOptions = {
  submitResults?: Array<ResultAsync<Response, RequestRejectedError>>;
};

function createClient(options: CreateClientOptions = {}) {
  const submitQueue = [...(options.submitResults ?? [])];

  const relayerGet = vi.fn(() => okAsync(jsonResponse(executeParamsWire)));
  const relayerPost = vi.fn(
    (_path: string, _options?: { json?: unknown }) =>
      submitQueue.shift() ?? okAsync(jsonResponse(submitResponseWire)),
  );
  const signatureQueue = [SIGNATURE, SECOND_SIGNATURE];
  const signTypedData = vi.fn(
    async (_payload: TypedDataPayload) => signatureQueue.shift() ?? SIGNATURE,
  );

  const signer = {
    getAddress: async () => SIGNER,
    signMessage: vi.fn(async () => SIGNATURE),
    signTypedData,
    sendTransaction: vi.fn(),
  } as unknown as Signer;

  const client = {
    account: {
      signer: SIGNER,
      wallet: WALLET,
      walletType: WalletType.DEPOSIT_WALLET,
    },
    environment,
    relayer: { get: relayerGet, post: relayerPost },
    signer,
    supportsGasless: true,
  } as unknown as BaseSecureClient;

  return { client, relayerGet, relayerPost, signTypedData };
}

async function executeRepresentativeGaslessTransaction(
  client: BaseSecureClient,
) {
  const workflow = await prepareGaslessTransaction(client, {
    calls: [{ data: expectHexString('0xdeadbeef'), to: TARGET }],
    metadata: 'Test deposit wallet gasless execution',
  });

  return completeWith(client.signer)(workflow);
}

function submitPayloads(relayerPost: ReturnType<typeof vi.fn>): unknown[] {
  return relayerPost.mock.calls
    .filter(([path]) => path === '/submit')
    .map(([, options]) => (options as { json?: unknown } | undefined)?.json);
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}

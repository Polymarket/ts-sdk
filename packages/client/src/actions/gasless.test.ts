import { WalletType } from '@polymarket/bindings/gamma';
import { expectEvmAddress, expectHexString } from '@polymarket/types';
import { describe, expect, it, type MockInstance, vi } from 'vitest';
import type { BaseSecureClient } from '../clients';
import { forkEnvironmentConfig } from '../environments';
import { RequestRejectedError } from '../errors';
import { ServiceClient } from '../ServiceClient';
import type { Signer } from '../types';
import { SignerType } from '../wallet';
import { completeWith } from '../workflow';
import { prepareGaslessTransaction } from './gasless';

const SIGNER = expectEvmAddress('0x1111111111111111111111111111111111111111');
const WALLET = expectEvmAddress('0x2222222222222222222222222222222222222222');
const RELAY = expectEvmAddress('0x3333333333333333333333333333333333333333');
const TARGET = expectEvmAddress('0x4444444444444444444444444444444444444444');
const SIGNATURE = `0x${'11'.repeat(65)}`;

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
    const { client, relayerPost } = createClient({
      submitResults: [
        new RequestRejectedError(
          'batch nonce 3 does not match on-chain nonce 7 (https://relayer.polymarket.com/submit)',
          { status: 400 },
        ),
        jsonResponse(submitResponseWire),
      ],
    });

    const handle = await executeRepresentativeGaslessTransaction(client);

    expect(handle.transactionId).toBe('tx-1');
    const payloads = submitPayloads(relayerPost);
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toMatchObject({ nonce: '7' });
  });
});

type CreateClientOptions = {
  submitResults?: Array<Response | RequestRejectedError>;
};

function createClient(options: CreateClientOptions = {}) {
  const submitQueue = [...(options.submitResults ?? [])];

  const relayerService = new ServiceClient({
    root: 'https://relayer.test',
    retry: false,
    fetch: async (input) => {
      if (new Request(input).method === 'GET')
        return jsonResponse(executeParamsWire);
      const result = submitQueue.shift() ?? jsonResponse(submitResponseWire);
      if (result instanceof Error) throw result;
      return result;
    },
  });
  const relayerPost = vi.spyOn(relayerService, 'post');

  const signer = {
    getAddress: async () => SIGNER,
    signMessage: vi.fn(async () => SIGNATURE),
    signTypedData: vi.fn(async () => SIGNATURE),
    sendTransaction: vi.fn(),
  } as unknown as Signer;

  const client = {
    account: {
      signer: SIGNER,
      signerType: SignerType.OWNER,
      wallet: WALLET,
      walletType: WalletType.DEPOSIT_WALLET,
    },
    environment,
    relayer: relayerService,
    signer,
    supportsGasless: true,
  } as unknown as BaseSecureClient;

  return { client, relayerPost };
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

function submitPayloads(relayerPost: MockInstance): unknown[] {
  return relayerPost.mock.calls
    .filter(([path]) => path === '/submit')
    .map(([, options]) => (options as { json?: unknown } | undefined)?.json);
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}

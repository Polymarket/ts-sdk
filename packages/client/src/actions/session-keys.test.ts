import { WalletType } from '@polymarket/bindings/gamma';
import {
  errAsync,
  expectEvmAddress,
  okAsync,
  type ResultAsync,
} from '@polymarket/types';
import { describe, expect, it, vi } from 'vitest';
import type { BaseSecureClient } from '../clients';
import { forkEnvironmentConfig } from '../environments';
import { RequestRejectedError } from '../errors';
import type { Signer } from '../types';
import { SignerType } from '../wallet';
import { authorizeSessionKey, revokeSessionKey } from './session-keys';

const SIGNER = expectEvmAddress('0x1111111111111111111111111111111111111111');
const WALLET = expectEvmAddress('0x2222222222222222222222222222222222222222');
const RELAY = expectEvmAddress('0x3333333333333333333333333333333333333333');
const SESSION_KEY = expectEvmAddress(
  '0x4444444444444444444444444444444444444444',
);
const SIGNATURE = `0x${'11'.repeat(65)}`;
const SUBMISSION_TIMEOUT_MS = 5 * 60 * 1_000;

const environment = forkEnvironmentConfig({
  name: 'test',
  relayerPollFrequencyMs: 0,
});

const executeParamsWire = { address: RELAY, nonce: '3' };

describe('session-key relayer submissions', () => {
  it.each([
    ['authorization', '/v1/session-signers/authorizations'],
    ['revocation', '/v1/session-signers/revocations'],
  ] as const)('allows the %s response up to five minutes', async (kind, path) => {
    const { client, relayerPost, rejection } = createClient();

    const operation =
      kind === 'authorization'
        ? authorizeSessionKey(client, {
            address: SESSION_KEY,
            idempotencyKey: 'stable-idempotency-key',
            scopes: ['BLOCKTRADE'],
            validUntil:
              Math.floor(Date.now() / 1_000) + 180 * 24 * 60 * 60 - 60,
          })
        : revokeSessionKey(client, {
            address: SESSION_KEY,
            idempotencyKey: 'stable-idempotency-key',
          });
    await expect(operation).rejects.toBe(rejection);

    const call = relayerPost.mock.calls.find(
      ([requestedPath]) => requestedPath === path,
    );
    expect(call?.[1]).toMatchObject({
      headers: { 'Idempotency-Key': 'stable-idempotency-key' },
      timeout: SUBMISSION_TIMEOUT_MS,
    });
  });
});

function createClient() {
  const rejection = new RequestRejectedError('stop after capturing options', {
    status: 400,
  });
  const relayerGet = vi.fn(() => okAsync(jsonResponse(executeParamsWire)));
  const relayerPost = vi.fn(
    (_path: string, _options?: { json?: unknown; timeout?: number }) =>
      errAsync(rejection) as ResultAsync<Response, RequestRejectedError>,
  );
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
    hasBuilderApiKey: true,
    relayer: { get: relayerGet, post: relayerPost },
    signer,
    supportsGasless: true,
  } as unknown as BaseSecureClient;
  return { client, rejection, relayerPost };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}

import { WalletType } from '@polymarket/bindings/gamma';
import { expectEvmAddress, expectEvmSignature } from '@polymarket/types';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { UnexpectedResponseError } from './errors';
import { createPredictionsSessionManager } from './predictions-session';
import { ServiceClient } from './ServiceClient';
import type { Signer, TypedDataPayload } from './types';
import { SignerType } from './wallet';

const root = 'http://localhost:4199';
const server = setupServer();
const signerAddress = expectEvmAddress(
  '0x1111111111111111111111111111111111111111',
);
const signature = expectEvmSignature(`0x${'11'.repeat(65)}`);
const issuedAt = 1788206400;

// The valid payload matches the committed Identity Provider signing fixture.
function challenge() {
  return {
    challengeId: '019904e4-5600-7000-8000-000000000001',
    expiresAt: new Date((issuedAt + 300) * 1000).toISOString(),
    typedData: {
      primaryType: 'SignerOwnership',
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'salt', type: 'bytes32' },
        ],
        SignerOwnership: [
          { name: 'signer', type: 'address' },
          { name: 'nonce', type: 'bytes32' },
          { name: 'issuedAt', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
        ],
      },
      domain: {
        name: 'Polymarket',
        version: '1',
        chainId: 137,
        salt: '0xb1ef0dadff0674ef9060b4fb8eb44a810a3a4dffa14c8ef29d892ed5d797ae1e',
      },
      message: {
        signer: signerAddress,
        nonce:
          '0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
        issuedAt: `${issuedAt}`,
        expiresAt: `${issuedAt + 300}`,
      },
    },
  };
}

function authenticationBoundary() {
  const signTypedData = vi.fn(async (_payload: TypedDataPayload) => signature);
  const signer: Signer = {
    async getAddress() {
      return signerAddress;
    },
    signTypedData,
    async signMessage() {
      throw new Error('Unexpected message signing');
    },
    async sendTransaction() {
      throw new Error('Unexpected transaction');
    },
  };
  const manager = createPredictionsSessionManager({
    gateway: new ServiceClient({ root, singleAttempt: true }),
    signer,
    account: {
      signer: signerAddress,
      wallet: signerAddress,
      signerType: SignerType.OWNER,
      walletType: WalletType.EOA,
    },
    chainId: 137,
    identityIssuer: 'https://api-defi-staging.polymarket.dev',
  });
  return { manager, signTypedData };
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => {
  server.close();
});

describe('signer ownership response boundary', () => {
  it.each([
    'signer',
    'chain',
    'issuer',
    'foreign type',
    'expired',
  ] as const)('rejects a mismatched %s before requesting a signature', async (mismatch) => {
    vi.spyOn(Date, 'now').mockReturnValue(issuedAt * 1000);
    const answer = challenge();
    if (mismatch === 'signer')
      answer.typedData.message.signer = expectEvmAddress(
        '0x2222222222222222222222222222222222222222',
      );
    if (mismatch === 'chain') answer.typedData.domain.chainId = 80002;
    if (mismatch === 'issuer')
      answer.typedData.domain.salt = `0x${'00'.repeat(32)}`;
    if (mismatch === 'foreign type') answer.typedData.primaryType = 'Order';
    if (mismatch === 'expired')
      vi.spyOn(Date, 'now').mockReturnValue((issuedAt + 300) * 1000);
    server.use(
      http.post(`${root}/v1/auth/challenge`, () =>
        HttpResponse.json(answer, { status: 201 }),
      ),
    );
    const { manager, signTypedData } = authenticationBoundary();
    await expect(manager.open()).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    expect(signTypedData).not.toHaveBeenCalled();
  });

  it('passes the validated payload unchanged and refuses login after a slow prompt', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(issuedAt * 1000);
    const answer = challenge();
    const login = vi.fn(() => new HttpResponse(null, { status: 500 }));
    server.use(
      http.post(`${root}/v1/auth/challenge`, () =>
        HttpResponse.json(answer, { status: 201 }),
      ),
      http.post(`${root}/v1/auth/login`, login),
    );
    const { manager, signTypedData } = authenticationBoundary();
    signTypedData.mockImplementationOnce(async () => {
      clock.mockReturnValue((issuedAt + 300) * 1000);
      return signature;
    });
    await expect(manager.open()).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    expect(signTypedData).toHaveBeenCalledExactlyOnceWith(answer.typedData);
    expect(login).not.toHaveBeenCalled();
  });

  it('keeps rejected authentication payloads out of error diagnostics', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(issuedAt * 1000);
    const answer = challenge();
    const sentinel = 'private-payload-sentinel';
    server.use(
      http.post(`${root}/v1/auth/challenge`, () =>
        HttpResponse.json(
          {
            ...answer,
            typedData: { ...answer.typedData, [sentinel]: sentinel },
          },
          { status: 201 },
        ),
      ),
    );
    const { manager, signTypedData } = authenticationBoundary();
    const error = await manager.open().catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(UnexpectedResponseError);
    expect(String(error)).not.toContain(sentinel);
    expect(JSON.stringify(error)).not.toContain(sentinel);
    expect(signTypedData).not.toHaveBeenCalled();
  });
});

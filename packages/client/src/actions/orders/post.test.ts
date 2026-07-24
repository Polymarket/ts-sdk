import type { TokenId } from '@polymarket/bindings';
import { OrderSide, OrderType } from '@polymarket/bindings';
import type { ApiKeyCreds } from '@polymarket/bindings/clob';
import { SignatureType } from '@polymarket/bindings/clob';
import type { HexString } from '@polymarket/types';
import { expectEvmAddress, expectEvmSignature } from '@polymarket/types';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createBaseSecureClient } from '../../clients';
import { forkEnvironmentConfig } from '../../environments';
import { InsufficientAllowanceError, RequestRejectedError } from '../../errors';
import type { Signer } from '../../types';
import { PostOrderError, postOrder } from './post';
import type { SignedOrder } from './types';

const clobRoot = 'http://localhost:4216';
const server = setupServer();

const signerAddress = expectEvmAddress(
  '0x0000000000000000000000000000000000000001',
);

const environment = forkEnvironmentConfig({
  name: 'test',
  clob: { rest: clobRoot },
});

const credentials: ApiKeyCreds = {
  key: 'key' as ApiKeyCreds['key'],
  passphrase: 'passphrase',
  secret: 'secret',
};

const signer: Signer = {
  getAddress() {
    return Promise.resolve(signerAddress);
  },
  signMessage() {
    throw new Error('Unexpected signMessage call');
  },
  signTypedData() {
    throw new Error('Unexpected signTypedData call');
  },
  sendTransaction() {
    throw new Error('Unexpected sendTransaction call');
  },
};

const client = createBaseSecureClient({
  address: signerAddress,
  wallet: signerAddress,
  credentials,
  environment,
  signer,
});

const order: SignedOrder = {
  builder: '0x' as HexString,
  expiration: 0,
  maker: signerAddress,
  makerAmount: '1000000',
  metadata: '0x' as HexString,
  orderType: OrderType.GTC,
  salt: '1234',
  side: OrderSide.BUY,
  signatureType: SignatureType.EOA,
  signer: signerAddress,
  takerAmount: '2000000',
  timestamp: '0',
  tokenId: '123' as TokenId,
  signature: expectEvmSignature(`0x${'1'.repeat(130)}`),
};

describe('postOrder', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('maps allowance rejections to InsufficientAllowanceError', async () => {
    server.use(
      http.post(`${clobRoot}/order`, () =>
        HttpResponse.json(
          { error: 'not enough balance / allowance is not enough' },
          { status: 400 },
        ),
      ),
    );

    const failure = await postOrder(client)(order).then(
      () => {
        throw new Error('Expected the post to reject');
      },
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(InsufficientAllowanceError);
    expect(PostOrderError.isError(failure)).toBe(true);
    expect((failure as InsufficientAllowanceError).status).toBe(400);
    expect((failure as InsufficientAllowanceError).cause).toBeInstanceOf(
      RequestRejectedError,
    );
  });

  it('keeps other rejections as RequestRejectedError', async () => {
    server.use(
      http.post(`${clobRoot}/order`, () =>
        HttpResponse.json(
          { error: 'invalid order signature' },
          { status: 400 },
        ),
      ),
    );

    const failure = await postOrder(client)(order).then(
      () => {
        throw new Error('Expected the post to reject');
      },
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(RequestRejectedError);
    expect(failure).not.toBeInstanceOf(InsufficientAllowanceError);
  });
});

import {
  ApiKeySchema,
  OrderSide,
  OrderType,
  toTokenId,
} from '@polymarket/bindings';
import { SignatureType } from '@polymarket/bindings/clob';
import { WalletType } from '@polymarket/bindings/gamma';
import {
  expectEvmAddress,
  expectEvmSignature,
  expectHexString,
} from '@polymarket/types';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BaseSecureClient } from '../../clients';
import { forkEnvironmentConfig } from '../../environments';
import { TradingRestriction } from '../../errors';
import { OrderResponseErrorCode } from '../../index';
import type { Signer } from '../../types';
import { postOrder, postOrders } from './post';
import type { SignedOrder } from './types';

const clobRoot = 'http://localhost:4020';
const server = setupServer();
const signerAddress = expectEvmAddress(
  '0x0000000000000000000000000000000000000001',
);
const order: SignedOrder = {
  builder: expectHexString('0x00'),
  expiration: 0,
  maker: signerAddress,
  makerAmount: '1000000',
  metadata: expectHexString('0x00'),
  orderType: OrderType.GTC,
  salt: '1',
  side: OrderSide.BUY,
  signature: expectEvmSignature(`0x${'1'.repeat(130)}`),
  signatureType: SignatureType.EOA,
  signer: signerAddress,
  takerAmount: '500000',
  timestamp: '0',
  tokenId: toTokenId('1'),
};

const signer: Signer = {
  getAddress: () => Promise.resolve(signerAddress),
  sendTransaction: () => Promise.reject(new Error('Unexpected transaction')),
  signMessage: () => Promise.reject(new Error('Unexpected signature')),
  signTypedData: () => Promise.reject(new Error('Unexpected signature')),
};

const requests = [
  {
    name: 'single-order requests',
    path: '/order',
    submit: (client: BaseSecureClient) => postOrder(client)(order),
  },
  {
    name: 'batch-order requests',
    path: '/orders',
    submit: (client: BaseSecureClient) => postOrders(client)([order]),
  },
] as const;

const restrictions = [
  {
    body: null,
    expected: TradingRestriction.RESTARTING,
    headers: { 'retry-after': '1' },
    name: 'matching-engine restarts',
    retryAfter: 1,
    status: 425,
  },
  {
    body: {
      error:
        'Trading is currently cancel-only. New orders are not accepted, but cancels are allowed.',
    },
    expected: TradingRestriction.CANCEL_ONLY,
    headers: undefined,
    name: 'cancel-only mode',
    retryAfter: undefined,
    status: 503,
  },
  {
    body: {
      code: OrderResponseErrorCode.POST_ONLY_MODE,
      error: 'post-only mode: only post-only orders and cancels are allowed',
      retry_after_seconds: 79,
    },
    expected: TradingRestriction.POST_ONLY,
    headers: undefined,
    name: 'post-only mode',
    retryAfter: 79,
    status: 503,
  },
] as const;

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe.each(requests)('$name', ({ path, submit }) => {
  it.each(restrictions)('exposes $name', async (restriction) => {
    server.use(
      http.post(`${clobRoot}${path}`, () =>
        restriction.body === null
          ? new HttpResponse(null, {
              headers: restriction.headers,
              status: restriction.status,
            })
          : HttpResponse.json(restriction.body, {
              headers: restriction.headers,
              status: restriction.status,
            }),
      ),
    );

    await expect(submit(createClient())).rejects.toMatchObject({
      name: 'RequestRejectedError',
      restriction: restriction.expected,
      retryAfter: restriction.retryAfter,
      status: restriction.status,
    });
  });
});

function createClient(): BaseSecureClient {
  return new BaseSecureClient({
    account: {
      signer: signerAddress,
      wallet: signerAddress,
      walletType: WalletType.EOA,
    },
    credentials: {
      key: ApiKeySchema.parse('key'),
      passphrase: 'passphrase',
      secret: 'c2VjcmV0',
    },
    environment: forkEnvironmentConfig({
      clob: { rest: clobRoot },
      name: 'test',
    }),
    signer,
  });
}

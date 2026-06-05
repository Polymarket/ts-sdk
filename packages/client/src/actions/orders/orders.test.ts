import {
  BuilderCodeSchema,
  OrderSide,
  OrderType,
  toTokenId,
} from '@polymarket/bindings';
import { SignatureType } from '@polymarket/bindings/clob';
import { WalletType } from '@polymarket/bindings/gamma';
import type { EvmAddress } from '@polymarket/types';
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
import type { BaseSecureClient } from '../../clients';
import { production } from '../../environments';
import { RequestRejectedError, UserInputError } from '../../errors';
import { ServiceClient } from '../../ServiceClient';
import { createUnsignedOrder } from './orders';
import { prepareMarketOrder } from './prepare';
import type { OrderDraft } from './types';

const SIGNER = '0x0000000000000000000000000000000000000001' as EvmAddress;
const DEPOSIT_WALLET =
  '0x57ffbc34de23124faeb8387fcd689d314e57accd' as EvmAddress;
const PROXY_WALLET = '0x7754536ecd85c00b2e0cf9c1aa679340d8550756' as EvmAddress;
const SAFE_WALLET = '0x766b6851a199bf91ae3fa13b1cfac5187355118f' as EvmAddress;
const CLOB_ROOT = 'http://localhost:4020';
const CONDITION_ID =
  '0x1111111111111111111111111111111111111111111111111111111111111111';
const TOKEN_ID = toTokenId('1');
const BUILDER_CODE = BuilderCodeSchema.parse(
  '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
);
const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

describe('createUnsignedOrder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    {
      expectedSignatureType: SignatureType.EOA,
      expectedSigner: SIGNER,
      wallet: SIGNER,
      walletType: WalletType.EOA,
    },
    {
      expectedSignatureType: SignatureType.POLY_1271,
      expectedSigner: DEPOSIT_WALLET,
      wallet: DEPOSIT_WALLET,
      walletType: WalletType.DEPOSIT_WALLET,
    },
    {
      expectedSignatureType: SignatureType.POLY_PROXY,
      expectedSigner: SIGNER,
      wallet: PROXY_WALLET,
      walletType: WalletType.POLY_PROXY,
    },
    {
      expectedSignatureType: SignatureType.POLY_GNOSIS_SAFE,
      expectedSigner: SIGNER,
      wallet: SAFE_WALLET,
      walletType: WalletType.GNOSIS_SAFE,
    },
  ] as const)('uses the expected signer for wallet type $walletType', ({
    expectedSignatureType,
    expectedSigner,
    wallet,
    walletType,
  }) => {
    const order = createUnsignedOrder(createOrderDraft(wallet), {
      signer: SIGNER,
      wallet,
      walletType,
    });

    expect(order).toEqual(
      expect.objectContaining({
        maker: wallet,
        signatureType: expectedSignatureType,
        signer: expectedSigner,
      }),
    );
  });

  it('generates a cryptographically random salt that fits in a safe integer', () => {
    vi.stubGlobal('crypto', {
      getRandomValues<T extends ArrayBufferView | null>(values: T): T {
        if (!(values instanceof Uint8Array)) {
          throw new TypeError('Expected Uint8Array');
        }

        values.fill(0xff);

        return values;
      },
    });

    const order = createUnsignedOrder(createOrderDraft(DEPOSIT_WALLET), {
      signer: SIGNER,
      wallet: DEPOSIT_WALLET,
      walletType: WalletType.DEPOSIT_WALLET,
    });

    expect(order.salt).toBe((2n ** 53n - 1n).toString());
    expect(Number(order.salt)).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect(Number.parseInt(order.salt, 10).toString()).toBe(order.salt);
  });
});

describe('prepareMarketOrder', () => {
  it('reports unknown builder codes as user input errors when resolving buy amounts against max spend', async () => {
    mockMarketOrderContext();
    server.use(
      http.get(`${CLOB_ROOT}/fees/builder-fees/${BUILDER_CODE}`, () =>
        HttpResponse.json({ error: 'builder code not found' }, { status: 404 }),
      ),
    );
    const workflow = await prepareMarketOrder(createClient(), {
      amount: 10,
      builderCode: BUILDER_CODE,
      maxSpend: 10,
      side: OrderSide.BUY,
      tokenId: TOKEN_ID,
    });
    const result = workflow.next();

    await expect(result).rejects.toMatchObject({
      cause: expect.any(RequestRejectedError),
      message: `Unknown builder code: ${BUILDER_CODE}`,
      name: 'UserInputError',
    });
    await expect(result).rejects.toBeInstanceOf(UserInputError);
  });
});

function createOrderDraft(funderAddress: EvmAddress): OrderDraft {
  return {
    chainId: 137,
    exchangeAddress: '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e' as EvmAddress,
    expiration: 0,
    funderAddress,
    offeredAmount: 1000000n,
    orderType: OrderType.GTC,
    requestedAmount: 500000n,
    side: OrderSide.BUY,
    signer: SIGNER,
    tokenId: toTokenId('1'),
  };
}

function createClient(): BaseSecureClient {
  return {
    account: {
      signer: SIGNER,
      wallet: SIGNER,
      walletType: WalletType.EOA,
    },
    clob: new ServiceClient({ root: CLOB_ROOT }),
    environment: {
      ...production,
      clob: CLOB_ROOT,
    },
  } as BaseSecureClient;
}

function mockMarketOrderContext() {
  server.use(
    http.get(`${CLOB_ROOT}/tick-size`, () =>
      HttpResponse.json({ minimum_tick_size: 0.01 }),
    ),
    http.get(`${CLOB_ROOT}/book`, () =>
      HttpResponse.json({
        market: CONDITION_ID,
        asset_id: TOKEN_ID,
        timestamp: null,
        bids: [],
        asks: [{ price: '0.5', size: '100' }],
        min_order_size: '1',
        tick_size: '0.01',
        neg_risk: false,
        last_trade_price: null,
        hash: 'a'.repeat(40),
      }),
    ),
    http.get(`${CLOB_ROOT}/neg-risk`, () =>
      HttpResponse.json({ neg_risk: false }),
    ),
    http.get(`${CLOB_ROOT}/markets-by-token/${TOKEN_ID}`, () =>
      HttpResponse.json({ condition_id: CONDITION_ID }),
    ),
    http.get(`${CLOB_ROOT}/clob-markets/${CONDITION_ID}`, () =>
      HttpResponse.json({
        fd: { r: 0, e: 0 },
        t: [{ t: TOKEN_ID, o: 'Yes' }],
      }),
    ),
  );
}

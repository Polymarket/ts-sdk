import { OrderSide, OrderType, toTokenId } from '@polymarket/bindings';
import { SignatureType } from '@polymarket/bindings/clob';
import { WalletType } from '@polymarket/bindings/gamma';
import type { EvmAddress } from '@polymarket/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUnsignedOrder } from './orders';
import type { OrderDraft } from './types';

const SIGNER = '0x0000000000000000000000000000000000000001' as EvmAddress;
const DEPOSIT_WALLET =
  '0x57ffbc34de23124faeb8387fcd689d314e57accd' as EvmAddress;
const PROXY_WALLET = '0x7754536ecd85c00b2e0cf9c1aa679340d8550756' as EvmAddress;
const SAFE_WALLET = '0x766b6851a199bf91ae3fa13b1cfac5187355118f' as EvmAddress;

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

import {
  type ClobAssetId,
  OrderSide,
  OrderType,
  toPositionId,
  toTokenId,
} from '@polymarket/bindings';
import { AssetTypeSchema, SignatureType } from '@polymarket/bindings/clob';
import { WalletType } from '@polymarket/bindings/gamma';
import type { EvmAddress } from '@polymarket/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deriveDirectionalBucketPositions,
  deriveDirectionalThresholdPositions,
} from '../../directional';
import { ExchangeOrderProtocolVersion } from '../../exchange';
import { AssetType } from '../../index';
import { SignerType } from '../../wallet';
import { resolveBalanceAllowanceAssetType } from './allowance';
import { createUnsignedOrder } from './orders';
import type { OrderDraft } from './types';

const SIGNER = '0x0000000000000000000000000000000000000001' as EvmAddress;
const DEPOSIT_WALLET =
  '0x57ffbc34de23124faeb8387fcd689d314e57accd' as EvmAddress;
const PROXY_WALLET = '0x7754536ecd85c00b2e0cf9c1aa679340d8550756' as EvmAddress;
const SAFE_WALLET = '0x766b6851a199bf91ae3fa13b1cfac5187355118f' as EvmAddress;

describe('order balance and allowance asset selection', () => {
  const ctfTokenId = toTokenId((1n << 40n).toString());
  const protocolV2PositionId = toPositionId((1n << 248n).toString());
  const eventId =
    '0x0400112233445566778899aabbccddeeff000400000000000000000000';
  const voidPositions = deriveDirectionalBucketPositions({
    eventId,
    bucketIndex: 4,
  });
  const thresholdPositions = deriveDirectionalThresholdPositions({
    eventId,
    line: 2,
  });

  it('exports the Protocol V2 asset type from the client entry point', () => {
    expect(AssetType.CONDITIONAL_V2).toBe('CONDITIONAL-V2');
  });

  it.each([
    [OrderSide.BUY, ctfTokenId, 'COLLATERAL'],
    [OrderSide.BUY, protocolV2PositionId, 'COLLATERAL'],
    [OrderSide.SELL, ctfTokenId, 'CONDITIONAL'],
    [OrderSide.SELL, protocolV2PositionId, 'CONDITIONAL-V2'],
    [OrderSide.SELL, voidPositions.yesPositionId, 'CONDITIONAL-V2'],
    [OrderSide.SELL, voidPositions.noPositionId, 'CONDITIONAL-V2'],
    [OrderSide.SELL, thresholdPositions.abovePositionId, 'CONDITIONAL-V2'],
    [OrderSide.SELL, thresholdPositions.belowPositionId, 'CONDITIONAL-V2'],
    [OrderSide.BUY, thresholdPositions.belowPositionId, 'COLLATERAL'],
  ] as const)('selects %s %s as %s for reads and refreshes', (side, assetId, expected) => {
    const assetType = resolveBalanceAllowanceAssetType(side, assetId);

    expect(AssetTypeSchema.parse(assetType)).toBe(expected);
  });
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
    const order = createUnsignedOrder(createOrderDraft({ wallet }), {
      signer: SIGNER,
      signerType: SignerType.OWNER,
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

    const order = createUnsignedOrder(
      createOrderDraft({ wallet: DEPOSIT_WALLET }),
      {
        signer: SIGNER,
        signerType: SignerType.OWNER,
        wallet: DEPOSIT_WALLET,
        walletType: WalletType.DEPOSIT_WALLET,
      },
    );

    expect(order.salt).toBe((2n ** 53n - 1n).toString());
    expect(Number(order.salt)).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    expect(Number.parseInt(order.salt, 10).toString()).toBe(order.salt);
  });

  it('preserves a position ID and selects the V3 signing domain', () => {
    const positionId = toPositionId('2');
    const order = createUnsignedOrder(
      createOrderDraft({
        assetId: positionId,
        wallet: DEPOSIT_WALLET,
      }),
      {
        signer: SIGNER,
        signerType: SignerType.OWNER,
        wallet: DEPOSIT_WALLET,
        walletType: WalletType.DEPOSIT_WALLET,
      },
    );

    expect(order.tokenId).toBe(positionId);
    expect(order.protocolVersion).toBe(ExchangeOrderProtocolVersion.V3);
  });

  it('preserves directional threshold assets in V3 orders', () => {
    const { belowPositionId } = deriveDirectionalThresholdPositions({
      eventId: '0x0400112233445566778899aabbccddeeff000400000000000000000000',
      line: 2,
    });
    const order = createUnsignedOrder(
      createOrderDraft({ assetId: belowPositionId, wallet: DEPOSIT_WALLET }),
      {
        signer: SIGNER,
        signerType: SignerType.OWNER,
        wallet: DEPOSIT_WALLET,
        walletType: WalletType.DEPOSIT_WALLET,
      },
    );
    expect(order.tokenId).toBe(belowPositionId);
    expect(order.protocolVersion).toBe(ExchangeOrderProtocolVersion.V3);
  });
});

type CreateOrderDraftParams = {
  assetId?: ClobAssetId;
  wallet: EvmAddress;
};

function createOrderDraft({
  assetId = toTokenId('1'),
  wallet,
}: CreateOrderDraftParams): OrderDraft {
  return {
    assetId,
    chainId: 137,
    exchangeAddress: '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e' as EvmAddress,
    expiration: 0,
    funderAddress: wallet,
    offeredAmount: 1000000n,
    orderType: OrderType.GTC,
    requestedAmount: 500000n,
    side: OrderSide.BUY,
    signer: SIGNER,
  };
}

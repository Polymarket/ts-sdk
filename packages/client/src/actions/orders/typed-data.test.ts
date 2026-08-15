import { OrderSide, OrderType, toTokenId } from '@polymarket/bindings';
import { SignatureType } from '@polymarket/bindings/clob';
import type { EvmAddress, EvmSignature, HexString } from '@polymarket/types';
import { describe, expect, it } from 'vitest';
import { ExchangeOrderProtocolVersion } from '../../exchange';
import {
  createOrderSignature,
  createOrderTypedDataPayload,
} from './typed-data';
import type { UnsignedOrder } from './types';

const EXCHANGE_ADDRESS =
  '0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e' as EvmAddress;
const DEPOSIT_WALLET_ADDRESS =
  '0x57ffbc34de23124faeb8387fcd689d314e57accd' as EvmAddress;
const EVM_SIGNATURE =
  '0x111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111b' as EvmSignature;
const ORDER_TYPE_STRING =
  'Order(uint256 salt,address maker,address signer,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint8 side,uint8 signatureType,uint256 timestamp,bytes32 metadata,bytes32 builder)';

describe('createOrderTypedDataPayload', () => {
  it('wraps POLY_1271 orders with the app domain and wallet message domain', () => {
    const payload = createOrderTypedDataPayload(
      createUnsignedOrderFixture(SignatureType.POLY_1271),
    );

    expect(payload.domain).toEqual({
      chainId: 137,
      name: 'Polymarket CTF Exchange',
      verifyingContract: EXCHANGE_ADDRESS,
      version: '2',
    });
    expect(payload.message).toMatchObject({
      chainId: 137,
      name: 'DepositWallet',
      salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
      verifyingContract: DEPOSIT_WALLET_ADDRESS,
      version: '1',
    });
    expect(payload.primaryType).toBe('TypedDataSign');
  });

  it('signs non-POLY_1271 orders directly against the app domain', () => {
    const payload = createOrderTypedDataPayload(
      createUnsignedOrderFixture(SignatureType.EOA),
    );

    expect(payload.domain).toEqual({
      chainId: 137,
      name: 'Polymarket CTF Exchange',
      verifyingContract: EXCHANGE_ADDRESS,
      version: '2',
    });
    expect(payload.primaryType).toBe('Order');
  });

  it('uses the V3 domain selected during order preparation', () => {
    const payload = createOrderTypedDataPayload({
      ...createUnsignedOrderFixture(SignatureType.EOA),
      protocolVersion: ExchangeOrderProtocolVersion.V3,
    });

    expect(payload.domain).toEqual({
      chainId: 137,
      name: 'Polymarket CTF Exchange',
      verifyingContract: EXCHANGE_ADDRESS,
      version: '3',
    });
  });
});

describe('createOrderSignature', () => {
  it('returns non-POLY_1271 signatures unchanged', () => {
    expect(
      createOrderSignature(
        createUnsignedOrderFixture(SignatureType.POLY_PROXY),
        EVM_SIGNATURE,
      ),
    ).toBe(EVM_SIGNATURE);
  });

  it('wraps POLY_1271 signatures for ERC-7739 validation', () => {
    const signature = createOrderSignature(
      createUnsignedOrderFixture(SignatureType.POLY_1271),
      EVM_SIGNATURE,
    );
    const contentsType = Buffer.from(ORDER_TYPE_STRING, 'utf8').toString('hex');
    const contentsTypeLength = ORDER_TYPE_STRING.length
      .toString(16)
      .padStart(4, '0');

    expect(signature).not.toBe(EVM_SIGNATURE);
    expect(signature.startsWith(EVM_SIGNATURE)).toBe(true);
    expect(signature.endsWith(`${contentsType}${contentsTypeLength}`)).toBe(
      true,
    );
    expect(signature.length).toBe(
      2 + 65 * 2 + 32 * 2 + 32 * 2 + ORDER_TYPE_STRING.length * 2 + 2 * 2,
    );
  });
});

function createUnsignedOrderFixture(
  signatureType: SignatureType,
): UnsignedOrder {
  return {
    builder:
      '0x0000000000000000000000000000000000000000000000000000000000000000' as HexString,
    chainId: 137,
    exchangeAddress: EXCHANGE_ADDRESS,
    expiration: 0,
    maker: DEPOSIT_WALLET_ADDRESS,
    makerAmount: '1000000',
    metadata:
      '0x0000000000000000000000000000000000000000000000000000000000000000' as HexString,
    orderType: OrderType.GTC,
    protocolVersion: ExchangeOrderProtocolVersion.V2,
    salt: '1',
    side: OrderSide.BUY,
    signatureType,
    signer: DEPOSIT_WALLET_ADDRESS,
    takerAmount: '500000',
    timestamp: '0',
    tokenId: toTokenId('1'),
  };
}

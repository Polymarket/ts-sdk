import { OrderSide, type PositionId, type TokenId } from '@polymarket/bindings';
import { SignatureType } from '@polymarket/bindings/clob';
import {
  type Erc1271Signature,
  type EvmAddress,
  type EvmSignature,
  expectErc1271Signature,
  expectHexString,
  type HexString,
} from '@polymarket/types';
import { AbiParameters, Bytes, Hash } from 'ox';
import type { TypedDataField, TypedDataPayload } from './types';

const PROTOCOL_NAME = 'Polymarket CTF Exchange';
const DEPOSIT_WALLET_DOMAIN_NAME = 'DepositWallet';
const DEPOSIT_WALLET_DOMAIN_VERSION = '1';
const BYTES32_ZERO =
  '0x0000000000000000000000000000000000000000000000000000000000000000' satisfies HexString;
const ORDER_TYPE_STRING =
  'Order(uint256 salt,address maker,address signer,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint8 side,uint8 signatureType,uint256 timestamp,bytes32 metadata,bytes32 builder)';
const ORDER_TYPE_HASH = Hash.keccak256(Bytes.fromString(ORDER_TYPE_STRING), {
  as: 'Hex',
});
const DOMAIN_TYPE_HASH = Hash.keccak256(
  Bytes.fromString(
    'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)',
  ),
  { as: 'Hex' },
);
const PROTOCOL_NAME_HASH = Hash.keccak256(Bytes.fromString(PROTOCOL_NAME), {
  as: 'Hex',
});
const EIP712_DOMAIN: readonly TypedDataField[] = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];
const ORDER_STRUCTURE: readonly TypedDataField[] = [
  { name: 'salt', type: 'uint256' },
  { name: 'maker', type: 'address' },
  { name: 'signer', type: 'address' },
  { name: 'tokenId', type: 'uint256' },
  { name: 'makerAmount', type: 'uint256' },
  { name: 'takerAmount', type: 'uint256' },
  { name: 'side', type: 'uint8' },
  { name: 'signatureType', type: 'uint8' },
  { name: 'timestamp', type: 'uint256' },
  { name: 'metadata', type: 'bytes32' },
  { name: 'builder', type: 'bytes32' },
];
const TYPED_DATA_SIGN_STRUCTURE: readonly TypedDataField[] = [
  { name: 'contents', type: 'Order' },
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
  { name: 'salt', type: 'bytes32' },
];

/** @internal */
export enum ExchangeOrderProtocolVersion {
  V2 = '2',
  V3 = '3',
}

/** @internal */
export type ExchangeOrderDomain = {
  chainId: number;
  exchange: EvmAddress;
  protocolVersion: ExchangeOrderProtocolVersion;
};

/** @internal */
export type ExchangeOrderInput = {
  builder?: HexString;
  maker: EvmAddress;
  makerAmount: string;
  metadata?: HexString;
  salt: string;
  side: OrderSide | 0 | 1;
  signatureType: SignatureType;
  signer: EvmAddress;
  takerAmount: string;
  timestamp: string;
  tokenId: PositionId | TokenId;
};

/** @internal */
export type ExchangeOrderMessage = {
  builder: HexString;
  maker: EvmAddress;
  makerAmount: bigint;
  metadata: HexString;
  salt: bigint;
  side: 0 | 1;
  signatureType: SignatureType;
  signer: EvmAddress;
  takerAmount: bigint;
  timestamp: bigint;
  tokenId: bigint;
};

/** @internal */
export type CreateExchangeOrderTypedDataPayloadParams = {
  domain: ExchangeOrderDomain;
  order: ExchangeOrderInput;
};

/** @internal */
export type CreateExchangeOrderSignatureParams = {
  domain: ExchangeOrderDomain;
  order: ExchangeOrderInput;
  signature: EvmSignature;
};

/** @internal */
export function createExchangeOrderTypedDataPayload(
  params: CreateExchangeOrderTypedDataPayloadParams,
): TypedDataPayload {
  const orderPayload = createLegacyExchangeOrderTypedDataPayload(
    params.domain,
    params.order,
  );

  if (params.order.signatureType !== SignatureType.POLY_1271) {
    return orderPayload;
  }

  return {
    domain: createExchangeOrderTypedDataDomain(params.domain),
    message: {
      chainId: params.domain.chainId,
      contents: orderPayload.message,
      name: DEPOSIT_WALLET_DOMAIN_NAME,
      salt: BYTES32_ZERO,
      verifyingContract: params.order.signer,
      version: DEPOSIT_WALLET_DOMAIN_VERSION,
    },
    primaryType: 'TypedDataSign',
    types: {
      Order: ORDER_STRUCTURE,
      TypedDataSign: TYPED_DATA_SIGN_STRUCTURE,
    },
  };
}

/** @internal */
export function createExchangeOrderSignature(
  params: CreateExchangeOrderSignatureParams,
): EvmSignature | Erc1271Signature {
  if (params.order.signatureType !== SignatureType.POLY_1271) {
    return params.signature;
  }

  const contentsType = Bytes.toHex(Bytes.fromString(ORDER_TYPE_STRING));
  const contentsTypeLength = ORDER_TYPE_STRING.length
    .toString(16)
    .padStart(4, '0');

  return expectErc1271Signature(
    `0x${params.signature.slice(2)}${createExchangeOrderDomainSeparator(params.domain).slice(2)}${createExchangeOrderContentsHash(params.order).slice(2)}${contentsType.slice(2)}${contentsTypeLength}`,
  );
}

/** @internal */
export type CreateExchangeV3OrderDomainParams = {
  chainId: number;
  exchange: EvmAddress;
};

/** @internal */
export function createExchangeV3OrderDomain(
  params: CreateExchangeV3OrderDomainParams,
): ExchangeOrderDomain {
  return {
    chainId: params.chainId,
    exchange: params.exchange,
    protocolVersion: ExchangeOrderProtocolVersion.V3,
  };
}

/**
 * Amount the order owner gives, in e6 base units: `price * size` collateral
 * rounded up for a BUY, the outcome-token `size` for a SELL. `price` and
 * `size` are both e6-scaled.
 *
 * @internal
 */
export function calculateExchangeOrderMakerAmount(
  side: OrderSide,
  price: bigint,
  size: bigint,
): string {
  if (side === OrderSide.SELL) return size.toString();

  return ((price * size + 999_999n) / 1_000_000n).toString();
}

/**
 * Amount the order owner receives, in e6 base units: the outcome-token
 * `size` for a BUY, `price * size` collateral rounded down for a SELL.
 * Rounding always favors the counterparty. `price` and `size` are both
 * e6-scaled.
 *
 * @internal
 */
export function calculateExchangeOrderTakerAmount(
  side: OrderSide,
  price: bigint,
  size: bigint,
): string {
  if (side === OrderSide.SELL) {
    return ((price * size) / 1_000_000n).toString();
  }

  return size.toString();
}

/** @internal */
export function generateExchangeOrderSalt(): bigint {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);

  return BigInt(
    `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
  );
}

/** @internal */
export function createExchangeOrderMessage(
  order: ExchangeOrderInput,
): ExchangeOrderMessage {
  return {
    builder: order.builder ?? BYTES32_ZERO,
    maker: order.maker,
    makerAmount: BigInt(order.makerAmount),
    metadata: order.metadata ?? BYTES32_ZERO,
    salt: BigInt(order.salt),
    side: encodeExchangeOrderSide(order.side),
    signatureType: order.signatureType,
    signer: order.signer,
    takerAmount: BigInt(order.takerAmount),
    timestamp: BigInt(order.timestamp),
    tokenId: BigInt(order.tokenId),
  };
}

function createLegacyExchangeOrderTypedDataPayload(
  domain: ExchangeOrderDomain,
  order: ExchangeOrderInput,
): TypedDataPayload {
  return {
    domain: createExchangeOrderTypedDataDomain(domain),
    message: createExchangeOrderMessage(order),
    primaryType: 'Order',
    types: {
      EIP712Domain: EIP712_DOMAIN,
      Order: ORDER_STRUCTURE,
    },
  };
}

function createExchangeOrderTypedDataDomain(domain: ExchangeOrderDomain) {
  return {
    chainId: domain.chainId,
    name: PROTOCOL_NAME,
    verifyingContract: domain.exchange,
    version: domain.protocolVersion,
  };
}

function createExchangeOrderDomainSeparator(
  domain: ExchangeOrderDomain,
): HexString {
  return expectHexString(
    Hash.keccak256(
      AbiParameters.encode(
        [
          { type: 'bytes32' },
          { type: 'bytes32' },
          { type: 'bytes32' },
          { type: 'uint256' },
          { type: 'address' },
        ],
        [
          DOMAIN_TYPE_HASH,
          PROTOCOL_NAME_HASH,
          protocolVersionHash(domain.protocolVersion),
          BigInt(domain.chainId),
          domain.exchange,
        ],
      ),
      { as: 'Hex' },
    ),
  );
}

function createExchangeOrderContentsHash(order: ExchangeOrderInput): HexString {
  const message = createExchangeOrderMessage(order);

  return expectHexString(
    Hash.keccak256(
      AbiParameters.encode(
        [
          { type: 'bytes32' },
          { type: 'uint256' },
          { type: 'address' },
          { type: 'address' },
          { type: 'uint256' },
          { type: 'uint256' },
          { type: 'uint256' },
          { type: 'uint8' },
          { type: 'uint8' },
          { type: 'uint256' },
          { type: 'bytes32' },
          { type: 'bytes32' },
        ],
        [
          ORDER_TYPE_HASH,
          message.salt,
          message.maker,
          message.signer,
          message.tokenId,
          message.makerAmount,
          message.takerAmount,
          message.side,
          message.signatureType,
          message.timestamp,
          message.metadata,
          message.builder,
        ],
      ),
      { as: 'Hex' },
    ),
  );
}

function protocolVersionHash(
  protocolVersion: ExchangeOrderProtocolVersion,
): HexString {
  return expectHexString(
    Hash.keccak256(Bytes.fromString(protocolVersion), { as: 'Hex' }),
  );
}

/** @internal */
export function encodeExchangeOrderSide(side: OrderSide | 0 | 1): 0 | 1 {
  if (side === 0 || side === 1) return side;

  return side === OrderSide.BUY ? 0 : 1;
}

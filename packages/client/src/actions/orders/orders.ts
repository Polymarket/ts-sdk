import type { HexString } from '@polymarket/types';
import { ExchangeOrderProtocolVersion } from '../../exchange';
import { isV2PositionId } from '../../protocol';
import type { AccountIdentity } from '../../wallet';
import { resolveOrderIdentity } from '../../wallet';
import type {
  OrderDraft,
  OrderSignature,
  SignedOrder,
  UnsignedOrder,
} from './types';

const BYTES32_ZERO =
  '0x0000000000000000000000000000000000000000000000000000000000000000' satisfies HexString;

export function createUnsignedOrder(
  order: OrderDraft,
  account: AccountIdentity,
): UnsignedOrder {
  const identity = resolveOrderIdentity(account);

  return {
    builder: order.builderCode ?? BYTES32_ZERO,
    chainId: order.chainId,
    exchangeAddress: order.exchangeAddress,
    expiration: order.expiration,
    maker: identity.maker,
    makerAmount: order.offeredAmount.toString(),
    metadata: BYTES32_ZERO,
    orderType: order.orderType,
    protocolVersion: isV2PositionId(order.assetId)
      ? ExchangeOrderProtocolVersion.V3
      : ExchangeOrderProtocolVersion.V2,
    salt: generateOrderSalt().toString(),
    side: order.side,
    signatureType: identity.signatureType,
    signer: identity.signer,
    takerAmount: order.requestedAmount.toString(),
    timestamp: Date.now().toString(),
    tokenId: order.assetId,
  };
}

export function createSignedOrder(
  order: UnsignedOrder,
  signature: OrderSignature,
): SignedOrder {
  const {
    chainId: _chainId,
    exchangeAddress: _exchangeAddress,
    protocolVersion: _protocolVersion,
    tokenId,
    ...signedFields
  } = order;

  return {
    ...signedFields,
    assetId: tokenId,
    signature,
    tokenId,
  };
}

function generateOrderSalt(): bigint {
  const bytes = new Uint8Array(8);

  globalThis.crypto.getRandomValues(bytes);

  const value = BigInt(
    `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
  );

  // Cap the salt to 53 bits (Number.MAX_SAFE_INTEGER == 2^53 - 1).
  //
  // The CLOB wire contract expects `salt` as a JSON number, so the post
  // pipeline coerces this string through `Number.parseInt` before sending.
  // JavaScript `number` is an IEEE-754 double and can only represent integers
  // exactly up to 2^53 - 1; anything larger is silently rounded. The signature,
  // however, is produced over the original (un-rounded) salt via `BigInt`, so
  // any rounding on the wire side causes the server to reconstruct a different
  // EIP-712 hash and reject the order with "invalid signature".
  //
  // 53 bits is still ~9.0e15 of collision space (vastly more than the legacy
  // `Math.random() * Date.now()` salt), and keeps the wire round-trip lossless.
  return value & ((1n << 53n) - 1n);
}

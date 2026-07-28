import { OrderSide, type PositionId, toBaseUnits } from '@polymarket/bindings';
import type { RfqSignedOrder } from '@polymarket/bindings/combos';
import type { EvmAddress, EvmSignature, HexString } from '@polymarket/types';
import { SigningError } from '../../errors';
import {
  createExchangeOrderSignature,
  createExchangeOrderTypedDataPayload,
  ExchangeOrderProtocolVersion,
} from '../../exchange';
import type { Signer } from '../../types';
import type { AccountIdentity } from '../../wallet';
import { resolveOrderIdentity } from '../../wallet';

const BYTES32_ZERO =
  '0x0000000000000000000000000000000000000000000000000000000000000000' satisfies HexString;

export type SignRfqQuoteOrderParams = {
  account: AccountIdentity;
  chainId: number;
  exchange: EvmAddress;
  orderPrice: bigint;
  orderSide: OrderSide;
  signer: Signer;
  size: bigint;
  tokenId: PositionId;
};

export async function signRfqQuoteOrder(
  params: SignRfqQuoteOrderParams,
): Promise<RfqSignedOrder> {
  const identity = resolveOrderIdentity(params.account);
  const order: Omit<RfqSignedOrder, 'signature'> = {
    builder: BYTES32_ZERO,
    maker: identity.maker,
    makerAmount: toBaseUnits(
      makerAmount(params.orderSide, params.orderPrice, params.size),
    ),
    metadata: BYTES32_ZERO,
    salt: generateOrderSalt().toString(),
    side: encodeOrderSide(params.orderSide),
    signatureType: identity.signatureType,
    signer: identity.signer,
    takerAmount: toBaseUnits(
      takerAmount(params.orderSide, params.orderPrice, params.size),
    ),
    timestamp: Math.floor(Date.now() / 1000).toString(),
    tokenId: params.tokenId,
  };

  let signature: EvmSignature;
  try {
    signature = await params.signer.signTypedData(
      createExchangeOrderTypedDataPayload({
        domain: createRfqExchangeDomain(params),
        order,
      }),
    );
  } catch (error) {
    throw SigningError.fromError(error, 'Could not sign the RFQ quote order.');
  }

  return {
    ...order,
    signature: createExchangeOrderSignature({
      domain: createRfqExchangeDomain(params),
      order,
      signature,
    }),
  };
}

function createRfqExchangeDomain(params: SignRfqQuoteOrderParams) {
  return {
    chainId: params.chainId,
    exchange: params.exchange,
    protocolVersion: ExchangeOrderProtocolVersion.V3,
  };
}

function makerAmount(side: OrderSide, price: bigint, size: bigint): string {
  if (side === OrderSide.SELL) return size.toString();

  return ((price * size + 999_999n) / 1_000_000n).toString();
}

function takerAmount(side: OrderSide, price: bigint, size: bigint): string {
  if (side === OrderSide.SELL) {
    return ((price * size) / 1_000_000n).toString();
  }

  return size.toString();
}

function encodeOrderSide(side: OrderSide): 0 | 1 {
  return side === OrderSide.BUY ? 0 : 1;
}

function generateOrderSalt(): bigint {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);

  return BigInt(
    `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
  );
}

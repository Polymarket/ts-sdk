import type { Erc1271Signature, EvmSignature } from '@polymarket/types';
import {
  createExchangeOrderSignature,
  createExchangeOrderTypedDataPayload,
} from '../../exchange';
import type { TypedDataPayload } from '../../types';
import type { UnsignedOrder } from './types';

export function createOrderTypedDataPayload(
  order: UnsignedOrder,
): TypedDataPayload {
  return createExchangeOrderTypedDataPayload({
    domain: createOrderExchangeDomain(order),
    order,
  });
}

export function createOrderSignature(
  order: UnsignedOrder,
  signature: EvmSignature,
): EvmSignature | Erc1271Signature {
  return createExchangeOrderSignature({
    domain: createOrderExchangeDomain(order),
    order,
    signature,
  });
}

function createOrderExchangeDomain(order: UnsignedOrder) {
  return {
    chainId: order.chainId,
    exchange: order.exchangeAddress,
    protocolVersion: order.protocolVersion,
  };
}

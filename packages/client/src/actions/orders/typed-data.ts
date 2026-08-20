import type {
  Erc1271Signature,
  EvmAddress,
  EvmSignature,
} from '@polymarket/types';
import {
  createExchangeOrderSignature,
  createExchangeOrderTypedDataPayload,
} from '../../exchange';
import type { TypedDataPayload } from '../../types';
import { wrapDepositWalletSessionSignerSignature } from '../../wallet';
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
  sessionSigner?: EvmAddress,
): EvmSignature | Erc1271Signature {
  const orderSignature = createExchangeOrderSignature({
    domain: createOrderExchangeDomain(order),
    order,
    signature,
  });

  return sessionSigner === undefined
    ? orderSignature
    : wrapDepositWalletSessionSignerSignature(sessionSigner, orderSignature);
}

function createOrderExchangeDomain(order: UnsignedOrder) {
  return {
    chainId: order.chainId,
    exchange: order.exchangeAddress,
    protocolVersion: order.protocolVersion,
  };
}

import {
  type OrderSide,
  type PositionId,
  toBaseUnits,
} from '@polymarket/bindings';
import type { RfqSignedOrder } from '@polymarket/bindings/combos';
import type { EvmAddress, EvmSignature, HexString } from '@polymarket/types';
import { SigningError } from '../../errors';
import {
  calculateExchangeOrderMakerAmount,
  calculateExchangeOrderTakerAmount,
  createExchangeOrderSignature,
  createExchangeOrderTypedDataPayload,
  createExchangeV3OrderDomain,
  encodeExchangeOrderSide,
  generateExchangeOrderSalt,
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
  const domain = createExchangeV3OrderDomain({
    chainId: params.chainId,
    exchange: params.exchange,
  });
  const order: Omit<RfqSignedOrder, 'signature'> = {
    builder: BYTES32_ZERO,
    maker: identity.maker,
    makerAmount: toBaseUnits(
      calculateExchangeOrderMakerAmount(
        params.orderSide,
        params.orderPrice,
        params.size,
      ),
    ),
    metadata: BYTES32_ZERO,
    salt: generateExchangeOrderSalt().toString(),
    side: encodeExchangeOrderSide(params.orderSide),
    signatureType: identity.signatureType,
    signer: identity.signer,
    takerAmount: toBaseUnits(
      calculateExchangeOrderTakerAmount(
        params.orderSide,
        params.orderPrice,
        params.size,
      ),
    ),
    timestamp: Math.floor(Date.now() / 1000).toString(),
    tokenId: params.tokenId,
  };

  let signature: EvmSignature;
  try {
    signature = await params.signer.signTypedData(
      createExchangeOrderTypedDataPayload({ domain, order }),
    );
  } catch (error) {
    throw SigningError.fromError(error, 'Could not sign the RFQ quote order.');
  }

  return {
    ...order,
    signature: createExchangeOrderSignature({ domain, order, signature }),
  };
}

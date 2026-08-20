import {
  DecimalishSchema,
  type DecimalString,
  OrderSide,
  type PositionId,
} from '@polymarket/bindings';
import {
  RfqDirection,
  type RfqQuoteRequest,
  type RfqRequestedSize,
  RfqRequestedSizeUnit,
  type RfqSignedOrder,
} from '@polymarket/bindings/combos';
import type { EvmAddress } from '@polymarket/types';
import { z } from 'zod';
import type { RfqQuoteResponse, RfqQuoteSource } from '../../actions/rfq';
import { UserInputError } from '../../errors';
import { parseUserInput } from '../../input';
import type { Signer } from '../../types';
import type { AccountIdentity } from '../../wallet';
import { signRfqQuoteOrder } from './signing';

const DecimalishToBigIntSchema = DecimalishSchema.transform((value) =>
  decimalToScaledInteger(value),
).refine((value) => value <= BigInt(Number.MAX_SAFE_INTEGER), {
  message: 'Value exceeds the temporary numeric wire limit.',
});

const RfqQuoteResponseSchema = z.strictObject({
  price: DecimalishToBigIntSchema.refine((price) => price < 1_000_000n, {
    message: 'Price must be less than 1.',
  }),
  size: DecimalishToBigIntSchema.optional(),
  source: z.enum(['collateral', 'inventory']).default('collateral'),
});

export type ParsedRfqQuoteResponse = {
  price: bigint;
  size?: bigint;
  source: RfqQuoteSource;
};

export type CreateRfqQuoteParams = {
  account: AccountIdentity;
  chainId: number;
  exchange: EvmAddress;
  request: RfqQuoteRequest;
  response: ParsedRfqQuoteResponse;
  signer: Signer;
};

export type RfqQuote = {
  price: bigint;
  signedOrder: RfqSignedOrder;
  size: bigint;
};

export function parseRfqQuoteResponse(
  response: RfqQuoteResponse,
): ParsedRfqQuoteResponse {
  return parseUserInput(response, RfqQuoteResponseSchema);
}

export async function createRfqQuote(
  params: CreateRfqQuoteParams,
): Promise<RfqQuote> {
  const price = params.response.price;
  const size =
    params.response.size === undefined
      ? defaultQuoteSize(params.request.requestedSize, price)
      : params.response.size;
  const signedOrder = await signRfqQuoteOrder({
    account: params.account,
    chainId: params.chainId,
    exchange: params.exchange,
    orderPrice: quoteOrderPrice(params.request, params.response.source, price),
    orderSide: quoteOrderSide(params.response.source),
    signer: params.signer,
    size,
    tokenId: quoteOrderTokenId(params.request, params.response.source),
  });

  return { price, signedOrder, size };
}

function quoteOrderTokenId(
  request: RfqQuoteRequest,
  source: RfqQuoteSource,
): PositionId {
  if (request.direction === RfqDirection.Buy) {
    return source === 'collateral'
      ? request.noPositionId
      : request.yesPositionId;
  }

  return source === 'collateral' ? request.yesPositionId : request.noPositionId;
}

function quoteOrderPrice(
  request: RfqQuoteRequest,
  source: RfqQuoteSource,
  price: bigint,
): bigint {
  const usesComplementPrice =
    (request.direction === RfqDirection.Buy && source === 'collateral') ||
    (request.direction === RfqDirection.Sell && source === 'inventory');

  return usesComplementPrice ? 1_000_000n - price : price;
}

function quoteOrderSide(source: RfqQuoteSource): OrderSide {
  return source === 'collateral' ? OrderSide.BUY : OrderSide.SELL;
}

function defaultQuoteSize(
  requestedSize: RfqRequestedSize,
  price: bigint,
): bigint {
  const value = decimalToScaledInteger(requestedSize.value);

  if (requestedSize.unit === RfqRequestedSizeUnit.Shares) {
    return value;
  }

  return (value * 1_000_000n) / price;
}

function decimalToScaledInteger(value: DecimalString): bigint {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value);
  if (match === null) {
    throw new UserInputError('Value must be a valid decimal.');
  }

  const [, whole = '', fraction = ''] = match;

  if (fraction.length > 6) {
    throw new UserInputError('Value must have at most 6 decimal places.');
  }

  const scaledValue =
    BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));

  if (scaledValue <= 0n) {
    throw new UserInputError('Value must be greater than 0.');
  }

  return scaledValue;
}

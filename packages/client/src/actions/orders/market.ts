import {
  BuilderCodeSchema,
  OrderSide,
  OrderType,
  PositiveDecimalNumberSchema,
  type TickSizeValue,
  TokenIdSchema,
} from '@polymarket/bindings';
import type { MarketFeeInfo, OrderBook } from '@polymarket/bindings/clob';
import type { EvmAddress } from '@polymarket/types';
import { invariant } from '@polymarket/types';
import { z } from 'zod';
import type { BaseSecureClient } from '../../clients';
import { fetchOrderBook } from '../clob';
import { ensureBuilderFeeRates, ensureMarketMeta } from './cache';
import {
  resolveExchangeAddress,
  resolveRoundingConfig,
  validatePriceOnTickGrid,
} from './context';
import { resolveMarketPriceFromOrderBook } from './estimate';
import { decimalPlaces, parseAmount, roundDown, roundUp } from './math';
import type { OrderDraft, PrepareMarketOrderRequest } from './types';

const BasePrepareMarketOrderParamsSchema = z.object({
  tokenId: TokenIdSchema,
  builderCode: BuilderCodeSchema.optional(),
  orderType: z
    .union([z.literal(OrderType.FAK), z.literal(OrderType.FOK)])
    .default(OrderType.FAK),
});

export const PrepareMarketOrderParamsSchema = z.discriminatedUnion('side', [
  BasePrepareMarketOrderParamsSchema.extend({
    side: z.literal(OrderSide.BUY),
    amount: PositiveDecimalNumberSchema,
    maxSpend: PositiveDecimalNumberSchema.optional(),
    maxPrice: PositiveDecimalNumberSchema.optional(),
  }),
  BasePrepareMarketOrderParamsSchema.extend({
    side: z.literal(OrderSide.SELL),
    shares: PositiveDecimalNumberSchema,
    minPrice: PositiveDecimalNumberSchema.optional(),
  }),
]) satisfies z.ZodType<PrepareMarketOrderRequest>;

export type PrepareMarketOrderDraftParams = z.output<
  typeof PrepareMarketOrderParamsSchema
>;

export async function prepareMarketOrderDraft(
  client: BaseSecureClient,
  params: PrepareMarketOrderDraftParams,
): Promise<OrderDraft> {
  const context = await resolveMarketOrderContext(client, params);
  const amounts = computeMarketOrderAmounts({
    amount: context.resolvedAmount,
    price: context.price,
    protectPrice: hasProtectedPrice(params),
    side: params.side,
    tickSize: context.tickSize,
  });

  return {
    builderCode: params.builderCode,
    chainId: client.environment.chainId,
    exchangeAddress: context.exchangeAddress,
    expiration: 0,
    funderAddress: context.funderAddress,
    offeredAmount: amounts.offeredAmount,
    orderType: params.orderType,
    side: params.side,
    signer: context.signerAddress,
    requestedAmount: amounts.requestedAmount,
    tokenId: params.tokenId,
  };
}

type ResolveMarketOrderAmountParams = {
  amount: number;
  builderTakerFeeRate: number;
  feeInfo: MarketFeeInfo;
  maxSpend?: number;
  price: number;
  side: OrderSide;
};

type MarketOrderContext = {
  exchangeAddress: EvmAddress;
  funderAddress: EvmAddress;
  negRisk: boolean;
  price: number;
  resolvedAmount: number;
  signerAddress: EvmAddress;
  tickSize: TickSizeValue;
};

async function resolveMarketOrderContext(
  client: BaseSecureClient,
  params: PrepareMarketOrderDraftParams,
): Promise<MarketOrderContext> {
  const account = client.account;
  const amount = params.side === OrderSide.BUY ? params.amount : params.shares;
  // Market metadata, live book depth, and builder fee rates have no
  // interdependencies, so they resolve in parallel. The book request can fire
  // even when metadata resolution ultimately fails; that is an accepted
  // tradeoff for the shorter critical path.
  const [meta, orderBook, builderTakerFeeRate] = await Promise.all([
    ensureMarketMeta(client, params.tokenId),
    hasProtectedPrice(params)
      ? undefined
      : fetchOrderBook(client, { tokenId: params.tokenId }),
    resolveBuilderTakerFeeRate(client, params),
  ]);
  const price = resolveMarketOrderPrice(
    params,
    amount,
    meta.tickSize,
    orderBook,
  );
  const resolvedAmount = resolveMarketOrderAmount({
    amount,
    builderTakerFeeRate,
    feeInfo: meta.feeInfo,
    maxSpend: params.side === OrderSide.BUY ? params.maxSpend : undefined,
    price,
    side: params.side,
  });

  return {
    exchangeAddress: resolveExchangeAddress(client, meta.negRisk),
    funderAddress: account.wallet,
    negRisk: meta.negRisk,
    price,
    resolvedAmount,
    signerAddress: account.signer,
    tickSize: meta.tickSize,
  };
}

function resolveMarketOrderPrice(
  params: PrepareMarketOrderDraftParams,
  amount: number,
  tickSize: TickSizeValue,
  orderBook: OrderBook | undefined,
): number {
  if (params.side === OrderSide.BUY && params.maxPrice !== undefined) {
    return validatePriceOnTickGrid(params.maxPrice, tickSize, 'maxPrice');
  }

  if (params.side === OrderSide.SELL && params.minPrice !== undefined) {
    return validatePriceOnTickGrid(params.minPrice, tickSize, 'minPrice');
  }

  invariant(
    orderBook !== undefined,
    'An order book is required to estimate an unprotected market price.',
  );

  return resolveMarketPriceFromOrderBook({
    amount,
    orderBook,
    orderType: params.orderType,
    side: params.side,
    tickSize,
  });
}

function resolveBuilderTakerFeeRate(
  client: BaseSecureClient,
  params: PrepareMarketOrderDraftParams,
): Promise<number> | number {
  if (
    params.side !== OrderSide.BUY ||
    params.maxSpend === undefined ||
    params.builderCode === undefined
  ) {
    return 0;
  }

  return ensureBuilderFeeRates(client, params.builderCode).then(
    (rates) => rates.taker,
  );
}

function hasProtectedPrice(params: PrepareMarketOrderDraftParams): boolean {
  return (
    (params.side === OrderSide.BUY && params.maxPrice !== undefined) ||
    (params.side === OrderSide.SELL && params.minPrice !== undefined)
  );
}

export function computeMarketOrderAmounts(params: {
  amount: number;
  price: number;
  protectPrice?: boolean;
  side: OrderSide;
  tickSize: TickSizeValue;
}): {
  offeredAmount: bigint;
  requestedAmount: bigint;
} {
  const roundConfig = resolveRoundingConfig(params.tickSize);
  const rawPrice = roundDown(params.price, roundConfig.price);
  const rawMakerAmount = roundDown(params.amount, roundConfig.size);

  if (params.side === OrderSide.BUY) {
    let rawTakerAmount = rawMakerAmount / rawPrice;

    if (decimalPlaces(rawTakerAmount) > roundConfig.amount) {
      rawTakerAmount = roundUp(rawTakerAmount, roundConfig.amount + 4);

      if (decimalPlaces(rawTakerAmount) > roundConfig.amount) {
        rawTakerAmount = params.protectPrice
          ? roundUp(rawTakerAmount, roundConfig.amount)
          : roundDown(rawTakerAmount, roundConfig.amount);
      }
    }

    return {
      offeredAmount: parseAmount(rawMakerAmount),
      requestedAmount: parseAmount(rawTakerAmount),
    };
  }

  let rawTakerAmount = rawMakerAmount * rawPrice;

  if (decimalPlaces(rawTakerAmount) > roundConfig.amount) {
    rawTakerAmount = roundUp(rawTakerAmount, roundConfig.amount + 4);

    if (decimalPlaces(rawTakerAmount) > roundConfig.amount) {
      rawTakerAmount = params.protectPrice
        ? roundUp(rawTakerAmount, roundConfig.amount)
        : roundDown(rawTakerAmount, roundConfig.amount);
    }
  }

  return {
    offeredAmount: parseAmount(rawMakerAmount),
    requestedAmount: parseAmount(rawTakerAmount),
  };
}

function resolveMarketOrderAmount(
  params: ResolveMarketOrderAmountParams,
): number {
  if (params.side !== OrderSide.BUY || params.maxSpend === undefined) {
    return params.amount;
  }

  return adjustBuyAmountForFees({
    amount: params.amount,
    builderTakerFeeRate: params.builderTakerFeeRate,
    platformFeeExponent: params.feeInfo.exponent,
    platformFeeRate: params.feeInfo.rate,
    maxSpend: params.maxSpend,
    price: params.price,
  });
}

export function adjustBuyAmountForFees(params: {
  amount: number;
  price: number;
  maxSpend: number;
  platformFeeRate: number;
  platformFeeExponent: number;
  builderTakerFeeRate: number;
}): number {
  const platformFeeRate =
    params.platformFeeRate *
    (params.price * (1 - params.price)) ** params.platformFeeExponent;
  const platformFee = (params.amount / params.price) * platformFeeRate;
  const totalCost =
    params.amount + platformFee + params.amount * params.builderTakerFeeRate;

  if (params.maxSpend <= totalCost) {
    return (
      params.maxSpend /
      (1 + platformFeeRate / params.price + params.builderTakerFeeRate)
    );
  }

  return params.amount;
}

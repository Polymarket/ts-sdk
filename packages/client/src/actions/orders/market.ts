import {
  type BuilderCode,
  BuilderCodeSchema,
  OrderSide,
  OrderType,
  PositiveDecimalNumberSchema,
  type TickSizeValue,
  type TokenId,
  TokenIdSchema,
} from '@polymarket/bindings';
import { type EvmAddress, invariant } from '@polymarket/types';
import { z } from 'zod';
import type { BaseSecureClient } from '../../clients';
import { UnexpectedResponseError, UserInputError } from '../../errors';
import { fetchOrderBook } from '../clob';
import {
  fetchCurrentOrderMarketMetadata,
  type OrderMarketMetadata,
  resolveBuilderTakerFeeRate,
  resolveOrderMarketMetadata,
} from './cache';
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

type MarketOrderContext = {
  exchangeAddress: EvmAddress;
  funderAddress: EvmAddress;
  price: number;
  resolvedAmount: number;
  signerAddress: EvmAddress;
  tickSize: TickSizeValue;
};

async function resolveMarketOrderContext(
  client: BaseSecureClient,
  params: PrepareMarketOrderDraftParams,
): Promise<MarketOrderContext> {
  return hasProtectedPrice(params)
    ? resolveProtectedMarketOrderContext(client, params)
    : resolveUnprotectedMarketOrderContext(client, params);
}

async function resolveProtectedMarketOrderContext(
  client: BaseSecureClient,
  params: PrepareMarketOrderDraftParams,
): Promise<MarketOrderContext> {
  const amount = params.side === OrderSide.BUY ? params.amount : params.shares;

  if (params.side === OrderSide.BUY && params.maxSpend !== undefined) {
    const { builderTakerFeeRate, market } = await resolveFeeInputs(
      client,
      params.tokenId,
      params.builderCode,
    );

    try {
      return buildProtectedBuyMarketOrderContext(
        client,
        params,
        amount,
        builderTakerFeeRate,
        params.maxSpend,
        market,
      );
    } catch (error) {
      if (!(error instanceof UserInputError)) {
        throw error;
      }

      const currentMarket = await fetchCurrentOrderMarketMetadata(
        client,
        params.tokenId,
      );

      return buildProtectedBuyMarketOrderContext(
        client,
        params,
        amount,
        builderTakerFeeRate,
        params.maxSpend,
        currentMarket,
      );
    }
  }

  const metadata = await resolveOrderMarketMetadata(client, params.tokenId);

  try {
    return buildProtectedMarketOrderContext(client, params, amount, metadata);
  } catch (error) {
    if (!(error instanceof UserInputError)) {
      throw error;
    }

    const currentMetadata = await fetchCurrentOrderMarketMetadata(
      client,
      params.tokenId,
    );

    return buildProtectedMarketOrderContext(
      client,
      params,
      amount,
      currentMetadata,
    );
  }
}

function buildProtectedBuyMarketOrderContext(
  client: BaseSecureClient,
  params: PrepareMarketOrderDraftParams,
  amount: number,
  builderTakerFeeRate: number,
  maxSpend: number,
  metadata: OrderMarketMetadata,
): MarketOrderContext {
  const price = resolveProtectedMarketOrderPrice(params, metadata.tickSize);

  return {
    exchangeAddress: resolveExchangeAddress(client, metadata.negRisk),
    funderAddress: client.account.wallet,
    price,
    resolvedAmount: adjustBuyAmountForFees({
      amount,
      builderTakerFeeRate,
      maxSpend,
      platformFeeExponent: metadata.feeInfo.exponent,
      platformFeeRate: metadata.feeInfo.rate,
      price,
    }),
    signerAddress: client.account.signer,
    tickSize: metadata.tickSize,
  };
}

function buildProtectedMarketOrderContext(
  client: BaseSecureClient,
  params: PrepareMarketOrderDraftParams,
  amount: number,
  metadata: OrderMarketMetadata,
): MarketOrderContext {
  const price = resolveProtectedMarketOrderPrice(params, metadata.tickSize);

  return {
    exchangeAddress: resolveExchangeAddress(client, metadata.negRisk),
    funderAddress: client.account.wallet,
    price,
    resolvedAmount: amount,
    signerAddress: client.account.signer,
    tickSize: metadata.tickSize,
  };
}

async function resolveUnprotectedMarketOrderContext(
  client: BaseSecureClient,
  params: PrepareMarketOrderDraftParams,
): Promise<MarketOrderContext> {
  const amount = params.side === OrderSide.BUY ? params.amount : params.shares;
  const feeInputs =
    params.side === OrderSide.BUY && params.maxSpend !== undefined
      ? resolveFeeInputs(client, params.tokenId, params.builderCode)
      : undefined;
  const [orderBook, resolvedFeeInputs] = await Promise.all([
    fetchOrderBook(client, { tokenId: params.tokenId }),
    feeInputs,
  ]);

  if (orderBook.tokenId !== params.tokenId) {
    throw new UnexpectedResponseError(
      `Order book returned token ${orderBook.tokenId} for requested token ${params.tokenId}.`,
    );
  }

  const price = resolveMarketPriceFromOrderBook({
    amount,
    orderBook,
    orderType: params.orderType,
    side: params.side,
  });

  return {
    exchangeAddress: resolveExchangeAddress(client, orderBook.negRisk),
    funderAddress: client.account.wallet,
    price,
    resolvedAmount: resolveUnprotectedMarketOrderAmount(
      params,
      amount,
      price,
      resolvedFeeInputs,
    ),
    signerAddress: client.account.signer,
    tickSize: orderBook.tickSize,
  };
}

function resolveUnprotectedMarketOrderAmount(
  params: PrepareMarketOrderDraftParams,
  amount: number,
  price: number,
  feeInputs: FeeInputs | undefined,
): number {
  if (
    params.side !== OrderSide.BUY ||
    params.maxSpend === undefined ||
    feeInputs === undefined
  ) {
    return amount;
  }

  return adjustBuyAmountForFees({
    amount,
    builderTakerFeeRate: feeInputs.builderTakerFeeRate,
    maxSpend: params.maxSpend,
    platformFeeExponent: feeInputs.market.feeInfo.exponent,
    platformFeeRate: feeInputs.market.feeInfo.rate,
    price,
  });
}

function resolveProtectedMarketOrderPrice(
  params: PrepareMarketOrderDraftParams,
  tickSize: TickSizeValue,
): number {
  if (params.side === OrderSide.BUY) {
    invariant(
      params.maxPrice !== undefined,
      'Protected BUY market order requires maxPrice.',
    );
    return validateProtectedPriceOnTickGrid(
      'maxPrice',
      params.maxPrice,
      tickSize,
    );
  }

  invariant(
    params.minPrice !== undefined,
    'Protected SELL market order requires minPrice.',
  );
  return validateProtectedPriceOnTickGrid(
    'minPrice',
    params.minPrice,
    tickSize,
  );
}

function validateProtectedPriceOnTickGrid(
  field: 'maxPrice' | 'minPrice',
  price: number,
  tickSize: TickSizeValue,
): number {
  try {
    return validatePriceOnTickGrid(price, tickSize);
  } catch (error) {
    if (!(error instanceof UserInputError)) {
      throw error;
    }

    throw new UserInputError(`${field} ${error.message}`, { cause: error });
  }
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

type FeeInputs = {
  builderTakerFeeRate: number;
  market: OrderMarketMetadata;
};

async function resolveFeeInputs(
  client: BaseSecureClient,
  tokenId: TokenId,
  builderCode: BuilderCode | undefined,
): Promise<FeeInputs> {
  const [market, builderTakerFeeRate] = await Promise.all([
    resolveOrderMarketMetadata(client, tokenId),
    resolveBuilderTakerFeeRate(client, builderCode),
  ]);

  return { builderTakerFeeRate, market };
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

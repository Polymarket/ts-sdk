import {
  type BuilderCode,
  BuilderCodeSchema,
  OrderSide,
  OrderType,
  PositiveDecimalNumberSchema,
  type TickSizeValue,
} from '@polymarket/bindings';
import { type EvmAddress, invariant } from '@polymarket/types';
import { z } from 'zod';
import type { BaseSecureClient } from '../../clients';
import { UnexpectedResponseError, UserInputError } from '../../errors';
import { fetchOrderBook } from '../clob';
import { computeMarketOrderAmounts } from './amounts';
import {
  createOrderRouting,
  type OrderAssetId,
  type OrderRouting,
  PositionOrderAssetSchema,
  TokenOrderAssetSchema,
} from './asset';
import {
  fetchCurrentOrderMarketMetadata,
  type OrderMarketMetadata,
  resolveBuilderTakerFeeRate,
  resolveOrderMarketMetadata,
} from './cache';
import {
  resolveOrderExchangeAddress,
  validatePriceOnTickGrid,
} from './context';
import { resolveMarketPriceFromOrderBook } from './estimate';
import { fromScaledPrice, type ScaledPrice, toScaledPrice } from './fixed';
import type { OrderDraft, PrepareMarketOrderRequest } from './types';

const BasePrepareMarketOrderParamsSchema = z.object({
  builderCode: BuilderCodeSchema.optional(),
  orderType: z
    .union([z.literal(OrderType.FAK), z.literal(OrderType.FOK)])
    .default(OrderType.FAK),
});

const PrepareMarketBuyOrderParamsSchema =
  BasePrepareMarketOrderParamsSchema.extend({
    side: z.literal(OrderSide.BUY),
    amount: PositiveDecimalNumberSchema,
    maxSpend: PositiveDecimalNumberSchema.optional(),
    maxPrice: PositiveDecimalNumberSchema.optional(),
  });

const PrepareMarketSellOrderParamsSchema =
  BasePrepareMarketOrderParamsSchema.extend({
    side: z.literal(OrderSide.SELL),
    shares: PositiveDecimalNumberSchema,
    minPrice: PositiveDecimalNumberSchema.optional(),
  });

export const PrepareMarketOrderParamsSchema = z.union([
  PrepareMarketBuyOrderParamsSchema.extend(TokenOrderAssetSchema.shape),
  PrepareMarketBuyOrderParamsSchema.extend(PositionOrderAssetSchema.shape),
  PrepareMarketSellOrderParamsSchema.extend(TokenOrderAssetSchema.shape),
  PrepareMarketSellOrderParamsSchema.extend(PositionOrderAssetSchema.shape),
]) satisfies z.ZodType<PrepareMarketOrderRequest>;

export type PrepareMarketOrderDraftParams = z.output<
  typeof PrepareMarketOrderParamsSchema
>;

export async function prepareMarketOrderDraft(
  client: BaseSecureClient,
  params: PrepareMarketOrderDraftParams,
): Promise<OrderDraft> {
  const routing = createOrderRouting(params);
  const context = await resolveMarketOrderContext(client, params, routing);
  const amounts = computeMarketOrderAmounts({
    amount: context.resolvedAmount,
    price: context.price,
    protectPrice: hasProtectedPrice(params),
    side: params.side,
    tickSize: context.tickSize,
  });

  return {
    ...routing,
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
  };
}

type MarketOrderContext = {
  exchangeAddress: EvmAddress;
  funderAddress: EvmAddress;
  price: ScaledPrice;
  resolvedAmount: number;
  signerAddress: EvmAddress;
  tickSize: TickSizeValue;
};

async function resolveMarketOrderContext(
  client: BaseSecureClient,
  params: PrepareMarketOrderDraftParams,
  routing: OrderRouting,
): Promise<MarketOrderContext> {
  return hasProtectedPrice(params)
    ? resolveProtectedMarketOrderContext(client, params, routing)
    : resolveUnprotectedMarketOrderContext(client, params, routing);
}

async function resolveProtectedMarketOrderContext(
  client: BaseSecureClient,
  params: PrepareMarketOrderDraftParams,
  routing: OrderRouting,
): Promise<MarketOrderContext> {
  const { assetId } = routing;
  const amount = params.side === OrderSide.BUY ? params.amount : params.shares;

  if (params.side === OrderSide.BUY && params.maxSpend !== undefined) {
    const { builderTakerFeeRate, market } = await resolveFeeInputs(
      client,
      assetId,
      params.builderCode,
    );

    try {
      return buildProtectedBuyMarketOrderContext(
        client,
        params,
        routing,
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
        assetId,
      );

      return buildProtectedBuyMarketOrderContext(
        client,
        params,
        routing,
        amount,
        builderTakerFeeRate,
        params.maxSpend,
        currentMarket,
      );
    }
  }

  const metadata = await resolveOrderMarketMetadata(client, assetId);

  try {
    return buildProtectedMarketOrderContext(
      client,
      params,
      routing,
      amount,
      metadata,
    );
  } catch (error) {
    if (!(error instanceof UserInputError)) {
      throw error;
    }

    const currentMetadata = await fetchCurrentOrderMarketMetadata(
      client,
      assetId,
    );

    return buildProtectedMarketOrderContext(
      client,
      params,
      routing,
      amount,
      currentMetadata,
    );
  }
}

function buildProtectedBuyMarketOrderContext(
  client: BaseSecureClient,
  params: PrepareMarketOrderDraftParams,
  routing: OrderRouting,
  amount: number,
  builderTakerFeeRate: number,
  maxSpend: number,
  metadata: OrderMarketMetadata,
): MarketOrderContext {
  const price = resolveProtectedMarketOrderPrice(params, metadata.tickSize);
  const priceNumber = fromScaledPrice(price);

  return {
    exchangeAddress: resolveOrderExchangeAddress(
      client,
      routing,
      metadata.negRisk,
    ),
    funderAddress: client.account.wallet,
    price,
    resolvedAmount: adjustBuyAmountForFees({
      amount,
      builderTakerFeeRate,
      maxSpend,
      platformFeeExponent: metadata.feeInfo.exponent,
      platformFeeRate: metadata.feeInfo.rate,
      price: priceNumber,
    }),
    signerAddress: client.account.signer,
    tickSize: metadata.tickSize,
  };
}

function buildProtectedMarketOrderContext(
  client: BaseSecureClient,
  params: PrepareMarketOrderDraftParams,
  routing: OrderRouting,
  amount: number,
  metadata: OrderMarketMetadata,
): MarketOrderContext {
  const price = resolveProtectedMarketOrderPrice(params, metadata.tickSize);

  return {
    exchangeAddress: resolveOrderExchangeAddress(
      client,
      routing,
      metadata.negRisk,
    ),
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
  routing: OrderRouting,
): Promise<MarketOrderContext> {
  const { assetId } = routing;
  const amount = params.side === OrderSide.BUY ? params.amount : params.shares;
  const feeInputs =
    params.side === OrderSide.BUY && params.maxSpend !== undefined
      ? resolveFeeInputs(client, assetId, params.builderCode)
      : undefined;
  const [orderBook, resolvedFeeInputs] = await Promise.all([
    fetchOrderBook(client, { assetId }),
    feeInputs,
  ]);

  if (orderBook.assetId !== assetId) {
    throw new UnexpectedResponseError(
      `Order book returned asset ${orderBook.assetId} for requested asset ${assetId}.`,
    );
  }

  const price = toScaledPrice(
    resolveMarketPriceFromOrderBook({
      amount,
      orderBook,
      orderType: params.orderType,
      side: params.side,
    }),
  );

  return {
    exchangeAddress: resolveOrderExchangeAddress(
      client,
      routing,
      orderBook.negRisk,
    ),
    funderAddress: client.account.wallet,
    price,
    resolvedAmount: resolveUnprotectedMarketOrderAmount(
      params,
      amount,
      fromScaledPrice(price),
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
): ScaledPrice {
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
): ScaledPrice {
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

type FeeInputs = {
  builderTakerFeeRate: number;
  market: OrderMarketMetadata;
};

async function resolveFeeInputs(
  client: BaseSecureClient,
  assetId: OrderAssetId,
  builderCode: BuilderCode | undefined,
): Promise<FeeInputs> {
  const [market, builderTakerFeeRate] = await Promise.all([
    resolveOrderMarketMetadata(client, assetId),
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

import {
  BuilderCodeSchema,
  OrderSide,
  OrderSideSchema,
  OrderType,
  PositiveDecimalNumberSchema,
  type TickSizeValue,
  TokenIdSchema,
} from '@polymarket/bindings';
import type { EvmAddress } from '@polymarket/types';
import { z } from 'zod';
import type { BaseSecureClient } from '../../clients';
import { ensureMarketMeta } from './cache';
import {
  resolveExchangeAddress,
  resolveRoundingConfig,
  validatePriceOnTickGrid,
} from './context';
import {
  decimalPlaces,
  parseAmount,
  roundDown,
  roundNormal,
  roundUp,
} from './math';
import type { OrderDraft, PrepareLimitOrderRequest } from './types';

const MINIMUM_LIMIT_ORDER_EXPIRATION_SECONDS = 180;

export const PrepareLimitOrderParamsSchema = z
  .strictObject({
    tokenId: TokenIdSchema,
    price: PositiveDecimalNumberSchema,
    size: PositiveDecimalNumberSchema,
    side: OrderSideSchema,
    builderCode: BuilderCodeSchema.optional(),
    postOnly: z.boolean().default(false),
    expiration: z.number().int().nonnegative().optional(),
  })
  .superRefine((params, context) => {
    if (params.expiration !== undefined) {
      const minimumExpiration =
        Math.floor(Date.now() / 1000) + MINIMUM_LIMIT_ORDER_EXPIRATION_SECONDS;

      if (params.expiration < minimumExpiration) {
        context.addIssue({
          code: 'custom',
          message: 'Expiration must be at least 3 minutes in the future.',
          path: ['expiration'],
        });
      }
    }
  }) satisfies z.ZodType<PrepareLimitOrderRequest>;

export type PrepareLimitOrderDraftParams = z.output<
  typeof PrepareLimitOrderParamsSchema
>;

type ResolveLimitOrderContextParams = {
  price: number;
  tokenId: string;
};

export async function prepareLimitOrderDraft(
  client: BaseSecureClient,
  params: PrepareLimitOrderDraftParams,
): Promise<OrderDraft> {
  const context = await resolveLimitOrderContext(client, {
    price: params.price,
    tokenId: params.tokenId,
  });
  const amounts = computeLimitOrderAmounts({
    price: context.price,
    side: params.side,
    size: params.size,
    tickSize: context.tickSize,
  });

  return {
    builderCode: params.builderCode,
    chainId: client.environment.chainId,
    exchangeAddress: context.exchangeAddress,
    expiration: params.expiration ?? 0,
    funderAddress: context.funderAddress,
    offeredAmount: amounts.offeredAmount,
    orderType: params.expiration === undefined ? OrderType.GTC : OrderType.GTD,
    side: params.side,
    signer: context.signerAddress,
    requestedAmount: amounts.requestedAmount,
    tokenId: params.tokenId,
  };
}

type LimitOrderContext = {
  exchangeAddress: EvmAddress;
  funderAddress: EvmAddress;
  negRisk: boolean;
  price: number;
  signerAddress: EvmAddress;
  tickSize: TickSizeValue;
};

async function resolveLimitOrderContext(
  client: BaseSecureClient,
  params: ResolveLimitOrderContextParams,
): Promise<LimitOrderContext> {
  const account = client.account;
  const { negRisk, tickSize } = await ensureMarketMeta(client, params.tokenId);

  return {
    exchangeAddress: resolveExchangeAddress(client, negRisk),
    funderAddress: account.wallet,
    negRisk,
    price: validatePriceOnTickGrid(params.price, tickSize, 'Price'),
    signerAddress: account.signer,
    tickSize,
  };
}

function computeLimitOrderAmounts(params: {
  price: number;
  side: OrderSide;
  size: number;
  tickSize: TickSizeValue;
}): {
  offeredAmount: bigint;
  requestedAmount: bigint;
} {
  const roundConfig = resolveRoundingConfig(params.tickSize);
  const rawPrice = roundNormal(params.price, roundConfig.price);

  if (params.side === OrderSide.BUY) {
    const rawTakerAmount = roundDown(params.size, roundConfig.size);
    let rawMakerAmount = rawTakerAmount * rawPrice;

    if (decimalPlaces(rawMakerAmount) > roundConfig.amount) {
      rawMakerAmount = roundUp(rawMakerAmount, roundConfig.amount + 4);

      if (decimalPlaces(rawMakerAmount) > roundConfig.amount) {
        rawMakerAmount = roundDown(rawMakerAmount, roundConfig.amount);
      }
    }

    return {
      offeredAmount: parseAmount(rawMakerAmount),
      requestedAmount: parseAmount(rawTakerAmount),
    };
  }

  const rawMakerAmount = roundDown(params.size, roundConfig.size);
  let rawTakerAmount = rawMakerAmount * rawPrice;

  if (decimalPlaces(rawTakerAmount) > roundConfig.amount) {
    rawTakerAmount = roundUp(rawTakerAmount, roundConfig.amount + 4);

    if (decimalPlaces(rawTakerAmount) > roundConfig.amount) {
      rawTakerAmount = roundDown(rawTakerAmount, roundConfig.amount);
    }
  }

  return {
    offeredAmount: parseAmount(rawMakerAmount),
    requestedAmount: parseAmount(rawTakerAmount),
  };
}

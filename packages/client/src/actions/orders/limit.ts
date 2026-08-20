import {
  BuilderCodeSchema,
  OrderSideSchema,
  OrderType,
  PositiveDecimalNumberSchema,
  type TickSizeValue,
} from '@polymarket/bindings';
import type { EvmAddress } from '@polymarket/types';
import { z } from 'zod';
import type { BaseSecureClient } from '../../clients';
import { UserInputError } from '../../errors';
import { computeLimitOrderAmounts } from './amounts';
import {
  createOrderRouting,
  type OrderRouting,
  PositionOrderAssetSchema,
  TokenOrderAssetSchema,
} from './asset';
import {
  fetchCurrentOrderMarketMetadata,
  type OrderMarketMetadata,
  resolveOrderMarketMetadata,
} from './cache';
import {
  resolveOrderExchangeAddress,
  validatePriceOnTickGrid,
} from './context';
import type { ScaledPrice } from './fixed';
import type { OrderDraft, PrepareLimitOrderRequest } from './types';

const MINIMUM_LIMIT_ORDER_EXPIRATION_SECONDS = 180;

const BasePrepareLimitOrderParamsSchema = z.strictObject({
  price: PositiveDecimalNumberSchema,
  size: PositiveDecimalNumberSchema,
  side: OrderSideSchema,
  builderCode: BuilderCodeSchema.optional(),
  postOnly: z.boolean().default(false),
  expiration: z.number().int().nonnegative().optional(),
});

export const PrepareLimitOrderParamsSchema = z
  .union([
    BasePrepareLimitOrderParamsSchema.extend(TokenOrderAssetSchema.shape),
    BasePrepareLimitOrderParamsSchema.extend(PositionOrderAssetSchema.shape),
  ])
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
  routing: OrderRouting;
  price: number;
};

export async function prepareLimitOrderDraft(
  client: BaseSecureClient,
  params: PrepareLimitOrderDraftParams,
): Promise<OrderDraft> {
  const routing = createOrderRouting(params);
  const context = await resolveLimitOrderContext(client, {
    routing,
    price: params.price,
  });
  const amounts = computeLimitOrderAmounts({
    price: context.price,
    side: params.side,
    size: params.size,
    tickSize: context.tickSize,
  });

  return {
    ...routing,
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
  };
}

type LimitOrderContext = {
  exchangeAddress: EvmAddress;
  funderAddress: EvmAddress;
  price: ScaledPrice;
  signerAddress: EvmAddress;
  tickSize: TickSizeValue;
};

async function resolveLimitOrderContext(
  client: BaseSecureClient,
  params: ResolveLimitOrderContextParams,
): Promise<LimitOrderContext> {
  const { assetId } = params.routing;
  const metadata = await resolveOrderMarketMetadata(client, assetId);

  try {
    return buildLimitOrderContext(client, params, metadata);
  } catch (error) {
    if (!(error instanceof UserInputError)) {
      throw error;
    }

    const currentMetadata = await fetchCurrentOrderMarketMetadata(
      client,
      assetId,
    );

    return buildLimitOrderContext(client, params, currentMetadata);
  }
}

function buildLimitOrderContext(
  client: BaseSecureClient,
  params: ResolveLimitOrderContextParams,
  metadata: OrderMarketMetadata,
): LimitOrderContext {
  const price = validateExactPriceOnTickGrid(params.price, metadata.tickSize);

  return {
    exchangeAddress: resolveOrderExchangeAddress(
      client,
      params.routing,
      metadata.negRisk,
    ),
    funderAddress: client.account.wallet,
    price,
    signerAddress: client.account.signer,
    tickSize: metadata.tickSize,
  };
}

function validateExactPriceOnTickGrid(
  price: number,
  tickSize: TickSizeValue,
): ScaledPrice {
  try {
    return validatePriceOnTickGrid(price, tickSize);
  } catch (error) {
    if (!(error instanceof UserInputError)) {
      throw error;
    }

    throw new UserInputError(`Price ${error.message}`, { cause: error });
  }
}

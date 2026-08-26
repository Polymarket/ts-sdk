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
import { type OrderAssetId, OrderAssetInputSchema } from './asset';
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

const PrepareLimitOrderFieldsSchema = z.strictObject({
  price: PositiveDecimalNumberSchema,
  size: PositiveDecimalNumberSchema,
  side: OrderSideSchema,
  builderCode: BuilderCodeSchema.optional(),
  postOnly: z.boolean().default(false),
  expiration: z.number().int().nonnegative().optional(),
  // Recognized here so the strict object can compose with OrderAssetInputSchema.
  assetId: z.unknown().optional(),
  tokenId: z.unknown().optional(),
});

const PrepareLimitOrderInputSchema = z
  .intersection(PrepareLimitOrderFieldsSchema, OrderAssetInputSchema)
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
  })
  .transform(({ assetId, tokenId, ...params }) => ({
    ...params,
    assetId: assetId ?? tokenId,
  }));

export type PrepareLimitOrderDraftParams = z.output<
  typeof PrepareLimitOrderInputSchema
>;

export const PrepareLimitOrderParamsSchema =
  PrepareLimitOrderInputSchema satisfies z.ZodType<
    PrepareLimitOrderDraftParams,
    PrepareLimitOrderRequest
  >;

type ResolveLimitOrderContextParams = {
  assetId: OrderAssetId;
  price: number;
};

export async function prepareLimitOrderDraft(
  client: BaseSecureClient,
  params: PrepareLimitOrderDraftParams,
): Promise<OrderDraft> {
  const context = await resolveLimitOrderContext(client, {
    assetId: params.assetId,
    price: params.price,
  });
  const amounts = computeLimitOrderAmounts({
    price: context.price,
    side: params.side,
    size: params.size,
    tickSize: context.tickSize,
  });

  return {
    assetId: params.assetId,
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
  const metadata = await resolveOrderMarketMetadata(client, params.assetId);

  try {
    return buildLimitOrderContext(client, params, metadata);
  } catch (error) {
    if (!(error instanceof UserInputError)) {
      throw error;
    }

    const currentMetadata = await fetchCurrentOrderMarketMetadata(
      client,
      params.assetId,
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
      params.assetId,
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

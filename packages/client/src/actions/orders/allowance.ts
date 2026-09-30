import { type ClobAssetId, OrderSide } from '@polymarket/bindings';
import { AssetType } from '@polymarket/bindings/clob';
import { type EvmAddress, isSameEvmAddress } from '@polymarket/types';
import type { BaseSecureClient } from '../../clients';
import { isV2PositionId } from '../../protocol';
import { fetchBalanceAllowance } from '../account';

/** @internal */
export function resolveOrderAssetType(
  side: OrderSide,
  assetId: ClobAssetId,
): AssetType {
  if (side === OrderSide.BUY) {
    return AssetType.COLLATERAL;
  }

  return isV2PositionId(assetId)
    ? AssetType.CONDITIONAL_V2
    : AssetType.CONDITIONAL;
}

export type ResolveCurrentAllowanceParams = {
  assetId: ClobAssetId;
  spenderAddress: EvmAddress;
  side: OrderSide;
};

/* @internal */
export async function resolveCurrentAllowance(
  client: BaseSecureClient,
  params: ResolveCurrentAllowanceParams,
): Promise<bigint> {
  const assetType = resolveOrderAssetType(params.side, params.assetId);
  const { allowances } = await fetchBalanceAllowance(
    client,
    params.side === OrderSide.BUY
      ? {
          assetType,
        }
      : {
          assetType,
          assetId: params.assetId,
        },
  );

  return resolveAllowanceAmount(allowances, params.spenderAddress);
}

function resolveAllowanceAmount(
  allowances: Record<EvmAddress, bigint>,
  spender: EvmAddress,
): bigint {
  const match = (Object.entries(allowances) as [EvmAddress, bigint][]).find(
    ([key]) => isSameEvmAddress(key, spender),
  );

  return match?.[1] ?? 0n;
}

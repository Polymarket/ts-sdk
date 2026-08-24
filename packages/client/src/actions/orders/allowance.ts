import { OrderSide } from '@polymarket/bindings';
import { AssetType } from '@polymarket/bindings/clob';
import { type EvmAddress, isSameEvmAddress } from '@polymarket/types';
import type { BaseSecureClient } from '../../clients';
import { fetchBalanceAllowance } from '../account';
import type { OrderAssetId } from './asset';

export type ResolveCurrentAllowanceParams = {
  assetId: OrderAssetId;
  spenderAddress: EvmAddress;
  side: OrderSide;
};

/* @internal */
export async function resolveCurrentAllowance(
  client: BaseSecureClient,
  params: ResolveCurrentAllowanceParams,
): Promise<bigint> {
  const assetType =
    params.side === OrderSide.BUY
      ? AssetType.COLLATERAL
      : AssetType.CONDITIONAL;
  const { allowances } = await fetchBalanceAllowance(
    client,
    params.side === OrderSide.BUY
      ? {
          assetType,
        }
      : {
          assetType,
          tokenId: params.assetId,
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

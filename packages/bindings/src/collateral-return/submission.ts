import { expectHexString } from '@polymarket/types';
import { z } from 'zod';
import {
  RelayerDepositWalletExecuteRequestSchema,
  RelayerLegacyExecuteRequestSchema,
} from '../relayer';

const HexStringSchema = z.string().transform((value) => expectHexString(value));

/**
 * Submission payload for a planned collateral return: the plan identifier and
 * the signed relayer envelope carrying the plan's exact Router call. The
 * envelope is a Deposit Wallet batch request or a Safe/Proxy relay request.
 */
export const CollateralReturnSubmitRequestSchema = z.object({
  plan_hash: HexStringSchema,
  envelope: z.union([
    RelayerDepositWalletExecuteRequestSchema,
    RelayerLegacyExecuteRequestSchema,
  ]),
});

export type CollateralReturnSubmitRequest = z.input<
  typeof CollateralReturnSubmitRequestSchema
>;

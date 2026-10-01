import { z } from 'zod';
import { EvmAddressSchema } from '../shared';
import { dataEnvelopeSchema } from './envelope';

export enum ApprovalStandard {
  Erc20 = 'ERC20',
  Erc1155 = 'ERC1155',
}

const ApprovalAmountSchema = z.union([
  z.literal('max'),
  z
    .string()
    .regex(/^(0|[1-9][0-9]{0,77})$/)
    .transform(BigInt)
    .refine((amount) => amount <= 2n ** 256n - 1n, 'Expected a uint256 amount'),
]);

/**
 * Rows for the standards the SDK evaluates. Every field a consumer relies on
 * is validated here, so a malformed required row fails loudly downstream.
 */
const KnownApprovalContractSchema = z.discriminatedUnion('standard', [
  z.object({
    token: EvmAddressSchema,
    spender: EvmAddressSchema,
    standard: z.literal(ApprovalStandard.Erc20),
    amount: ApprovalAmountSchema,
    approved: z.boolean(),
  }),
  z.object({
    token: EvmAddressSchema,
    spender: EvmAddressSchema,
    standard: z.literal(ApprovalStandard.Erc1155),
    approved: z.boolean(),
  }),
]);

/**
 * Any other row. The catalog grows independently of SDK releases, so rows the
 * SDK does not evaluate must parse without failing the whole snapshot. Only
 * the addresses are kept, so consumers can match and then reject the row if
 * they actually needed it.
 */
const UnknownApprovalContractSchema = z
  .object({
    token: z.string(),
    spender: z.string(),
  })
  .transform((row) => ({
    token: row.token,
    spender: row.spender,
    standard: undefined,
  }));

const ApprovalContractSchema = z.union([
  KnownApprovalContractSchema,
  UnknownApprovalContractSchema,
]);

export type ApprovalContract = z.infer<typeof ApprovalContractSchema>;

/** An indexed approval snapshot. Recent changes may not yet be reflected. */
export const FetchApprovalsResponseSchema = dataEnvelopeSchema(
  z
    .object({
      address: EvmAddressSchema,
      chain_id: z.number().int().positive(),
      contracts: z.array(ApprovalContractSchema),
    })
    .transform(({ chain_id, ...snapshot }) => ({
      ...snapshot,
      chainId: chain_id,
    })),
);

export type ApprovalsSnapshot = z.infer<typeof FetchApprovalsResponseSchema>;

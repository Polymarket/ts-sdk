import { z } from 'zod';
import { EvmAddressSchema, TransactionIdSchema, TxHashSchema } from '../shared';

export const RelayerSessionSignerScopeSchema = z.enum([
  'ALL',
  'CLOB',
  'RFQ',
  'COMBOSRFQ',
  'BLOCKTRADE',
]);

export type RelayerSessionSignerScope = z.output<
  typeof RelayerSessionSignerScopeSchema
>;

export const RelayerAuthorizeSessionSignerRequestSchema = z.object({
  deadline: z.string().regex(/^\d+$/),
  nonce: z.string().regex(/^\d+$/),
  scopes: z.array(RelayerSessionSignerScopeSchema).min(1),
  sessionSignerAddress: EvmAddressSchema,
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
  validUntil: z.string().regex(/^\d+$/),
  walletAddress: EvmAddressSchema,
});

export type RelayerAuthorizeSessionSignerRequest = z.input<
  typeof RelayerAuthorizeSessionSignerRequestSchema
>;

export const RelayerAuthorizeSessionSignerResponseSchema = z.object({
  operationId: z.string().min(1),
  status: z.string().min(1),
  transactionHash: TxHashSchema.nullish().transform((value) => value ?? null),
  transactionId: TransactionIdSchema,
});

export type RelayerAuthorizeSessionSignerResponse = z.output<
  typeof RelayerAuthorizeSessionSignerResponseSchema
>;

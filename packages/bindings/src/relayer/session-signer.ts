import { z } from 'zod';
import {
  type EvmAddress,
  EvmAddressSchema,
  type TransactionId,
  TransactionIdSchema,
  type TxHash,
  TxHashSchema,
} from '../shared';

/** Scope values accepted by session-signer authorization requests. */
export enum RelayerSessionSignerScope {
  /** All supported scopes. */
  ALL = 'ALL',
  /** Central limit order book trading. */
  CLOB = 'CLOB',
  /** Request-for-quote trading. */
  RFQ = 'RFQ',
  /** Combos request-for-quote trading. */
  COMBOSRFQ = 'COMBOSRFQ',
  /** Block trading. */
  BLOCKTRADE = 'BLOCKTRADE',
}

export const RelayerSessionSignerScopeSchema = z.enum(
  RelayerSessionSignerScope,
);

export type RelayerAuthorizeSessionSignerRequest = {
  /** Signed batch deadline encoded as whole Unix seconds. */
  deadline: string;
  /** Deposit Wallet nonce encoded as a base-10 integer. */
  nonce: string;
  /** Venue scopes assigned to the session signer. */
  scopes: RelayerSessionSignerScope[];
  /** Public address of the session signer. */
  sessionSignerAddress: EvmAddress;
  /** Owner signature authorizing the wallet call. */
  signature: string;
  /** Session-signer expiry encoded as whole Unix seconds. */
  validUntil: string;
  /** Deposit Wallet that grants the authorization. */
  walletAddress: EvmAddress;
};

export const RelayerAuthorizeSessionSignerRequestSchema = z.object({
  deadline: z.string().regex(/^\d+$/),
  nonce: z.string().regex(/^\d+$/),
  scopes: z.array(RelayerSessionSignerScopeSchema).min(1),
  sessionSignerAddress: EvmAddressSchema,
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
  validUntil: z.string().regex(/^\d+$/),
  walletAddress: EvmAddressSchema,
}) satisfies z.ZodType<RelayerAuthorizeSessionSignerRequest>;

export type RelayerAuthorizeSessionSignerResponse = {
  /** Identifier assigned to the accepted authorization operation. */
  operationId: string;
  /** Raw operation status returned at submission time. */
  status: string;
  /** Submitted transaction hash when it is already available. */
  transactionHash: TxHash | null;
  /** Identifier used to poll the submitted transaction. */
  transactionId: TransactionId;
};

export const RelayerAuthorizeSessionSignerResponseSchema = z.object({
  operationId: z.string().min(1),
  status: z.string().min(1),
  transactionHash: TxHashSchema.nullish().transform((value) => value ?? null),
  transactionId: TransactionIdSchema,
}) satisfies z.ZodType<RelayerAuthorizeSessionSignerResponse>;

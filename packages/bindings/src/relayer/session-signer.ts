import { z } from 'zod';
import {
  type EvmAddress,
  type TransactionId,
  TransactionIdSchema,
  type TxHash,
  TxHashSchema,
} from '../shared';

export enum RelayerAuthorizeSessionSignerStatus {
  SUBMITTED = 'SUBMITTED',
  REGISTRY_PENDING = 'REGISTRY_PENDING',
  REGISTERED = 'REGISTERED',
  FAILED = 'FAILED',
  SUPERSEDED = 'SUPERSEDED',
  REPAIR_REQUIRED = 'REPAIR_REQUIRED',
}

export type RelayerAuthorizeSessionSignerResponse = {
  /** Lifecycle status of the authorization operation. */
  status: RelayerAuthorizeSessionSignerStatus;
  /** Submitted transaction hash when it is already available. */
  transactionHash: TxHash | null;
  /** Identifier used to poll the submitted transaction. */
  transactionId: TransactionId;
};

// The upstream `operationId` is omitted from the normalized response because
// it is an opaque identifier with no SDK consumer.
export const RelayerAuthorizeSessionSignerResponseSchema = z.object({
  status: z.enum(RelayerAuthorizeSessionSignerStatus),
  transactionHash: TxHashSchema.nullish().transform((value) => value ?? null),
  transactionId: TransactionIdSchema,
}) satisfies z.ZodType<RelayerAuthorizeSessionSignerResponse>;

export type RelayerRevokeSessionSignerRequest = {
  /** Signed batch deadline encoded as whole Unix seconds. */
  deadline: string;
  /** Deposit Wallet nonce encoded as a base-10 integer. */
  nonce: string;
  /** Public address of the session signer to revoke. */
  sessionSignerAddress: EvmAddress;
  /** Owner signature authorizing the wallet call. */
  signature: string;
  /** Deposit Wallet that revokes the authorization. */
  walletAddress: EvmAddress;
};

export enum RelayerRevokeSessionSignerStatus {
  PENDING = 'PENDING',
  FENCED = 'FENCED',
  SWEPT = 'SWEPT',
  CHAIN_SUBMITTED = 'CHAIN_SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
}

export type RelayerRevokeSessionSignerResponse = {
  /** Lifecycle status of the revocation operation. */
  status: RelayerRevokeSessionSignerStatus;
  /** Identifier used to poll the submitted transaction. */
  transactionId: TransactionId;
};

// The upstream response includes `operationId` and `fenced`. They are omitted
// from the normalized response because the operation ID has no SDK consumer,
// while `fenced` is only a submission-time snapshot rather than the eventual
// revocation outcome.
export const RelayerRevokeSessionSignerResponseSchema = z.object({
  status: z.enum(RelayerRevokeSessionSignerStatus),
  transactionId: TransactionIdSchema,
}) satisfies z.ZodType<RelayerRevokeSessionSignerResponse>;

import { EvmAddressSchema } from '@polymarket/bindings';
import {
  type PerpsBuilderApproval,
  PerpsBuilderApprovalSchema,
  type PerpsBuilderStatus,
  PerpsBuilderStatusSchema,
} from '@polymarket/bindings/perps';
import { type EvmSignature, unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseClient, BaseSecureClient } from '../../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../errors';
import { parseUserInput } from '../../input';
import type { RequestOptions } from '../../request-options';
import { validateWith } from '../../response';
import type { TypedDataPayload } from '../../types';
import { PerpsBuilderFeeRateInputSchema } from '../../websockets/perps/actions/builder-terms';
import type { PerpsSession } from '../../websockets/perps/session';
import {
  createPerpsOpTypedDataPayload,
  randomUint32,
} from '../../websockets/perps/signing';
import { snakeCase, toSearchParams } from '../params';

const FetchPerpsBuilderStatusRequestSchema = z.object({
  address: EvmAddressSchema,
}) satisfies z.ZodType<FetchPerpsBuilderStatusRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsBuilderStatusRequest = {
  /** Builder account whose public availability should be checked. */
  address: string;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type FetchPerpsBuilderStatusError =
  | RequestAbortedError
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsBuilderStatusError = makeErrorGuard(
  RequestAbortedError,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches public builder availability and the platform fee cap.
 *
 * @throws {@link FetchPerpsBuilderStatusError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsBuilderStatus(
  client: BaseClient,
  request: FetchPerpsBuilderStatusRequest,
  options: RequestOptions = {},
): Promise<PerpsBuilderStatus> {
  const params = parseUserInput(request, FetchPerpsBuilderStatusRequestSchema);
  return unwrap(
    client.perps
      .get('/v1/info/builder', {
        signal: options.signal,
        params: toSearchParams(params, snakeCase()),
      })
      .andThen(validateWith(PerpsBuilderStatusSchema, options)),
  );
}

const ResolvedPerpsBuilderFeeSchema = z.strictObject({
  builder: EvmAddressSchema,
  maxFeeRate: PerpsBuilderFeeRateInputSchema,
  approvalVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

/** @internal */
export const ApprovePerpsBuilderFeeRequestSchema = z.strictObject({
  builderAddress: EvmAddressSchema.optional(),
  maxFeeRate: PerpsBuilderFeeRateInputSchema,
}) satisfies z.ZodType<ApprovePerpsBuilderFeeRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ApprovePerpsBuilderFeeRequest = {
  /** Builder account to authorize. Defaults to the session builder. */
  builderAddress?: string;
  /** Explicit maximum fee to authorize. Zero revokes permission. */
  maxFeeRate: string;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ApprovePerpsBuilderFeeError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const ApprovePerpsBuilderFeeError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Signs builder consent with the owner and returns the committed approval.
 *
 * @remarks
 * A zero maximum revokes permission for new orders, including zero-rate orders.
 * Reads this session's saved approval and submits its version plus one,
 * or 1 for the first approval. Consent is signed with
 * the parent client's owner signer, not the delegated session key.
 * Existing orders retain their saved terms. Conflicts and ambiguous submission
 * failures propagate without automatically signing or submitting again.
 *
 * @throws {@link ApprovePerpsBuilderFeeError}
 * Thrown on failure.
 *
 * @internal
 */
export async function approvePerpsBuilderFee(
  client: BaseSecureClient,
  session: PerpsSession,
  request: ApprovePerpsBuilderFeeRequest,
): Promise<PerpsBuilderApproval> {
  const input = parseUserInput(request, ApprovePerpsBuilderFeeRequestSchema);
  if (input.builderAddress === undefined) {
    throw new UserInputError(
      'A builder address is required when the session has no builder attribution.',
    );
  }
  const approvalVersion = nextPerpsBuilderApprovalVersion(
    await session.fetchBuilderApprovals({ builder: input.builderAddress }),
    input.builderAddress,
  );
  const params = parseUserInput(
    {
      builder: input.builderAddress,
      maxFeeRate: input.maxFeeRate,
      approvalVersion,
    },
    ResolvedPerpsBuilderFeeSchema,
  );
  const op: PerpsBuilderFeeApprovalOp = {
    ...params,
    chainId: client.environment.chainId,
    salt: randomUint32(),
    timestamp: Date.now(),
  };
  let signature: EvmSignature;
  try {
    signature = await client.signer.signTypedData(
      createPerpsBuilderFeeApprovalTypedData(op),
    );
  } catch (error) {
    throw SigningError.fromError(error, 'Could not sign builder consent');
  }

  return unwrap(
    client.perps
      .post('/v1/account/builder-approvals', {
        json: createPerpsBuilderFeeApprovalBody(op, signature),
      })
      .andThen(validateWith(PerpsBuilderApprovalSchema)),
  );
}

/** @internal Returns the saved version for the builder plus one, or 1. */
export function nextPerpsBuilderApprovalVersion(
  approvals: readonly PerpsBuilderApproval[],
  builder: string,
): number {
  const previous = approvals.find(
    (approval) => approval.builder.toLowerCase() === builder.toLowerCase(),
  );
  return (previous?.approvalVersion ?? 0) + 1;
}

/** @internal */
export type PerpsBuilderFeeApprovalOp = {
  chainId: number;
  builder: string;
  maxFeeRate: string;
  approvalVersion: number;
  salt: number;
  timestamp: number;
};

/** @internal Typed data the owner signs to approve builder fees. */
export function createPerpsBuilderFeeApprovalTypedData(
  op: PerpsBuilderFeeApprovalOp,
): TypedDataPayload {
  return createPerpsOpTypedDataPayload({
    chainId: op.chainId,
    op: ['approveBuilder', [op.builder, op.maxFeeRate, op.approvalVersion]],
    salt: op.salt,
    timestamp: op.timestamp,
  });
}

/** @internal Submission body carrying the signed approval values. */
export function createPerpsBuilderFeeApprovalBody(
  op: PerpsBuilderFeeApprovalOp,
  signature: EvmSignature,
) {
  return {
    op: {
      type: 'approveBuilder',
      args: {
        builder: op.builder,
        max_fee_rate: op.maxFeeRate,
        approval_version: op.approvalVersion,
      },
    },
    salt: op.salt,
    sig: signature,
    ts: op.timestamp,
  };
}

/** @internal Owner-signing operation bound to the parent secure client. */
export type PerpsBuilderFeeApprover = (
  session: PerpsSession,
  request: ApprovePerpsBuilderFeeRequest,
) => Promise<PerpsBuilderApproval>;

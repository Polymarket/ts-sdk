import { EvmAddressSchema } from '@polymarket/bindings';
import {
  type PerpsBuilderApproval,
  PerpsBuilderApprovalSchema,
  type PerpsBuilderStatus,
  PerpsBuilderStatusSchema,
} from '@polymarket/bindings/perps';
import { type EvmSignature, invariant, unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseClient, BaseSecureClient } from '../../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../errors';
import { parseUserInput } from '../../input';
import { validateWith } from '../../response';
import { PerpsBuilderFeeRateInputSchema } from '../../websockets/perps/actions/builder-terms';
import type { PerpsSession } from '../../websockets/perps/session';
import { createPerpsOpTypedDataPayload } from '../../websockets/perps/signing';
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
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export const FetchPerpsBuilderStatusError = makeErrorGuard(
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
): Promise<PerpsBuilderStatus> {
  const params = parseUserInput(request, FetchPerpsBuilderStatusRequestSchema);
  return unwrap(
    client.perps
      .get('/v1/info/builder', { params: toSearchParams(params, snakeCase()) })
      .andThen(validateWith(PerpsBuilderStatusSchema)),
  );
}

const ResolvedPerpsBuilderFeeSchema = z.object({
  builder: EvmAddressSchema,
  maxFeeRate: PerpsBuilderFeeRateInputSchema,
  approvalVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

const ApprovePerpsBuilderFeeRequestSchema =
  ResolvedPerpsBuilderFeeSchema.partial().default(
    {},
  ) satisfies z.ZodType<ApprovePerpsBuilderFeeRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ApprovePerpsBuilderFeeRequest = {
  /** Builder address. Defaults to the selected session. */
  builder?: string;
  /** Maximum fee fraction. Defaults to session terms; zero revokes permission. */
  maxFeeRate?: string;
  /** Omit to fetch the saved version and add one; the first approval uses 1. */
  approvalVersion?: number;
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
 * Explicit parameters override session defaults. Without session defaults,
 * provide builder and maxFeeRate explicitly.
 * If the version is omitted, reads this session's saved approval and submits
 * its version plus one, or 1 for the first approval. Consent is signed with
 * the parent client's owner signer, not the delegated session key.
 * Existing orders retain their saved terms. Conflicts and ambiguous submission
 * failures propagate without automatically signing or submitting again.
 *
 * @throws {@link ApprovePerpsBuilderFeeError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function approvePerpsBuilderFee(
  client: BaseSecureClient,
  session: PerpsSession,
  request?: ApprovePerpsBuilderFeeRequest,
): Promise<PerpsBuilderApproval> {
  const input = parseUserInput(request, ApprovePerpsBuilderFeeRequestSchema);
  const defaults = session.builderAttribution;
  const terms = parseUserInput(
    {
      builder: input.builder ?? defaults?.address,
      maxFeeRate: input.maxFeeRate ?? defaults?.feeRate,
    },
    ResolvedPerpsBuilderFeeSchema.omit({ approvalVersion: true }),
  );
  let approvalVersion = input.approvalVersion;
  if (approvalVersion === undefined) {
    const approvals = await session.fetchBuilderApprovals({
      builder: terms.builder,
    });
    const previous = approvals.find(
      (approval) =>
        approval.builder.toLowerCase() === terms.builder.toLowerCase(),
    );
    approvalVersion = (previous?.approvalVersion ?? 0) + 1;
  }

  const params = parseUserInput(
    { ...terms, approvalVersion },
    ResolvedPerpsBuilderFeeSchema,
  );
  const [salt] = crypto.getRandomValues(new Uint32Array(1));
  invariant(salt !== undefined, 'Expected a random Perps operation salt.');
  const timestamp = Date.now();
  let signature: EvmSignature;
  try {
    signature = await client.signer.signTypedData(
      createPerpsOpTypedDataPayload({
        chainId: client.environment.chainId,
        op: [
          'approveBuilder',
          [params.builder, params.maxFeeRate, params.approvalVersion],
        ],
        salt,
        timestamp,
      }),
    );
  } catch (error) {
    throw SigningError.fromError(error, 'Could not sign builder consent');
  }

  return unwrap(
    client.perps
      .post('/v1/account/builder-approvals', {
        json: {
          op: {
            type: 'approveBuilder',
            args: {
              builder: params.builder,
              max_fee_rate: params.maxFeeRate,
              approval_version: params.approvalVersion,
            },
          },
          salt,
          sig: signature,
          ts: timestamp,
        },
      })
      .andThen(validateWith(PerpsBuilderApprovalSchema)),
  );
}

/** @internal Owner-signing operation bound to the parent secure client. */
export type PerpsBuilderFeeApprover = (
  session: PerpsSession,
  request?: ApprovePerpsBuilderFeeRequest,
) => Promise<PerpsBuilderApproval>;

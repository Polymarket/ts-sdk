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

const ApprovePerpsBuilderFeeRequestSchema = z.object({
  builder: EvmAddressSchema,
  maxFeeRate: PerpsBuilderFeeRateInputSchema,
  approvalVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}) satisfies z.ZodType<ApprovePerpsBuilderFeeRequest>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type ApprovePerpsBuilderFeeRequest = {
  /** Account receiving builder fees on attributed orders. */
  builder: string;
  /** Exact decimal fraction from 0 to 0.001. Zero revokes future admission. */
  maxFeeRate: string;
  /** Exactly the previous committed version plus one, initially 1. */
  approvalVersion: number;
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
 * Existing orders retain their saved terms. Versions are explicit: after a
 * conflict or an ambiguous failure, read the saved approval before retrying.
 * This action never advances the version or resubmits consent automatically.
 *
 * @throws {@link ApprovePerpsBuilderFeeError}
 * Thrown on failure.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function approvePerpsBuilderFee(
  client: BaseSecureClient,
  request: ApprovePerpsBuilderFeeRequest,
): Promise<PerpsBuilderApproval> {
  const params = parseUserInput(request, ApprovePerpsBuilderFeeRequestSchema);
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

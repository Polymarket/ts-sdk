import {
  OrderSide,
  OrderSideSchema,
  toBaseUnits,
  toBuilderCode,
  toPositionId,
  toRfqId,
  toRfqQuoteId,
} from '@polymarket/bindings';
import {
  type BuilderRfqCreateRequest,
  type BuilderRfqCreateResponse,
  type BuilderRfqFinalStateResponse,
  type BuilderRfqQuoteReadyResponse,
  type BuilderRfqStatusResponse,
  ComboAcceptFailureReason,
  ComboQuoteUnavailableReason,
  RfqDirection,
  type RfqErrorCode,
  RfqExecutionStatus,
  type RfqId,
  RfqKnownErrorCode,
  RfqRequestedSizeUnit,
  RfqSide,
  type RfqSignedOrder,
  RfqStatus,
} from '@polymarket/bindings/combos';
import { delay, type EvmSignature } from '@polymarket/types';
import { z } from 'zod';
import {
  CancelledSigningError,
  RequestRejectedError,
  SigningError,
  TimeoutError,
  TransportError,
  UnexpectedResponseError,
} from '../../errors';
import {
  createExchangeOrderSignature,
  createExchangeOrderTypedDataPayload,
  type ExchangeOrderDomain,
  encodeExchangeOrderSide,
} from '../../exchange';
import { parseUserInput } from '../../input';
import type { TypedDataPayload } from '../../types';
import type { OrderIdentity } from '../../wallet';
import type {
  AcceptComboQuoteResult,
  RequestComboQuoteParams,
  RequestComboQuoteResult,
  WaitForComboFillResult,
} from '../rfq';
import {
  RfqRequestRejectedError,
  toRfqRejectionCode,
  toRfqRequestRejection,
} from './request-errors';

const ACCEPT_OUTCOME_TIMEOUT_MS = 30_000;
const ACCEPT_OUTCOME_POLL_INTERVAL_MS = 500;
const BYTES32_ZERO =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
const ComboLegPositionIdsSchema = z
  .array(
    z
      .string()
      .regex(/^\d+$/, 'Leg position IDs must be numeric strings.')
      .transform((value) => toPositionId(BigInt(value).toString())),
  )
  .min(2, 'Combo requests require at least 2 legs.')
  .max(50, 'Combo requests allow at most 50 legs.')
  .refine(
    (legs) => new Set(legs).size === legs.length,
    'Leg position IDs must not contain duplicates.',
  )
  .transform((legs) =>
    [...legs].sort((left, right) => {
      const leftPositionId = BigInt(left);
      const rightPositionId = BigInt(right);

      if (leftPositionId < rightPositionId) return -1;
      if (leftPositionId > rightPositionId) return 1;
      return 0;
    }),
  );

const ComboAmountToBaseUnitsSchema = z
  .union([z.number(), z.string()])
  .transform((value, context): string => {
    const match = /^(\d+)(?:\.(\d*))?$/.exec(String(value));

    if (match === null) {
      context.addIssue({
        code: 'custom',
        message: 'Value must be a valid decimal.',
      });
      return z.NEVER;
    }

    const [, whole = '', fraction = ''] = match;

    if (fraction.length > 6) {
      context.addIssue({
        code: 'custom',
        message: 'Value must have at most 6 decimal places.',
      });
      return z.NEVER;
    }

    const scaledValue = scaleE6DecimalParts(whole, fraction);

    if (scaledValue <= 0n) {
      context.addIssue({
        code: 'custom',
        message: 'Value must be greater than 0.',
      });
      return z.NEVER;
    }

    return scaledValue.toString();
  });

function scaleE6DecimalParts(whole: string, fraction: string): bigint {
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

const RequestComboQuoteParamsSchema = z.discriminatedUnion('direction', [
  z.object({
    amount: ComboAmountToBaseUnitsSchema,
    direction: z.literal(OrderSide.BUY),
    legPositionIds: ComboLegPositionIdsSchema,
    side: z.literal(RfqSide.Yes).optional(),
  }),
  z.object({
    direction: z.literal(OrderSide.SELL),
    legPositionIds: ComboLegPositionIdsSchema,
    side: z.literal(RfqSide.Yes).optional(),
    size: ComboAmountToBaseUnitsSchema,
  }),
]);

const AcceptComboQuoteDirectionSchema: z.ZodType<OrderSide, `${OrderSide}`> =
  OrderSideSchema;

export const AcceptComboQuoteParamsSchema = z.object({
  blendedPrice: z.string(),
  builderCode: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'builderCode must be a 32-byte hex string.')
    .transform(toBuilderCode),
  direction: AcceptComboQuoteDirectionSchema,
  expiresAt: z.number().int().nonnegative(),
  makerAmount: ComboAmountToBaseUnitsSchema.transform(toBaseUnits),
  netReceive: z.string().optional(),
  positionId: z
    .string()
    .regex(/^\d+$/, 'positionId must be a numeric string.')
    .transform(toPositionId),
  quoteId: z.string().min(1).transform(toRfqQuoteId),
  rfqId: z.string().min(1).transform(toRfqId),
  takerAmount: ComboAmountToBaseUnitsSchema.transform(toBaseUnits),
  totalRequired: z.string(),
});

type ParsedAcceptComboQuoteParams = z.output<
  typeof AcceptComboQuoteParamsSchema
>;

/** @internal */
export function buildComboQuoteRequest(
  identity: OrderIdentity,
  params: RequestComboQuoteParams,
): BuilderRfqCreateRequest {
  const input = parseUserInput(params, RequestComboQuoteParamsSchema);

  return {
    direction:
      input.direction === OrderSide.BUY ? RfqDirection.Buy : RfqDirection.Sell,
    leg_position_ids: input.legPositionIds,
    maker_address: identity.maker,
    requested_size:
      input.direction === OrderSide.BUY
        ? { unit: RfqRequestedSizeUnit.Notional, value_e6: input.amount }
        : { unit: RfqRequestedSizeUnit.Shares, value_e6: input.size },
    side: RfqSide.Yes,
    signature_type: identity.signatureType,
    signer_address: identity.signer,
  };
}
/** @internal */
export function resolveComboQuote(
  response: BuilderRfqCreateResponse,
  request: BuilderRfqCreateRequest,
): RequestComboQuoteResult {
  if ('quote' in response) {
    assertBuilderRfqResponseMatchesRequest(response, request);

    const direction =
      response.request.direction === RfqDirection.Buy
        ? OrderSide.BUY
        : OrderSide.SELL;
    const quote = {
      blendedPrice: response.quote.blendedPrice,
      builderCode: response.builderCode,
      expiresAt: response.expiresAt,
      makerAmount: response.quote.makerAmount,
      positionId: response.request.yesPositionId,
      quoteId: response.quote.quoteId,
      rfqId: response.rfqId,
      takerAmount: response.quote.takerAmount,
      totalRequired: response.quote.totalRequired,
    };

    if (direction === OrderSide.SELL) {
      if (response.quote.netReceive === undefined) {
        throw new UnexpectedResponseError(
          `SELL quote for RFQ ${response.rfqId} omitted net sell proceeds.`,
        );
      }

      return {
        quote: {
          ...quote,
          direction,
          netReceive: response.quote.netReceive,
        },
        rfqId: response.rfqId,
      };
    }

    return {
      quote: {
        ...quote,
        direction,
      },
      rfqId: response.rfqId,
    };
  }

  return toQuoteUnavailableResult(response);
}
function assertBuilderRfqResponseMatchesRequest(
  response: BuilderRfqQuoteReadyResponse,
  request: BuilderRfqCreateRequest,
): void {
  const echoed = response.request;
  const mismatchedFields: string[] = [];

  if (echoed.rfqId !== response.rfqId) mismatchedFields.push('rfq_id');
  if (echoed.direction !== request.direction) {
    mismatchedFields.push('direction');
  }
  if (echoed.side !== request.side) mismatchedFields.push('side');
  if (
    echoed.legPositionIds.length !== request.leg_position_ids.length ||
    echoed.legPositionIds.some(
      (positionId, index) => positionId !== request.leg_position_ids[index],
    )
  ) {
    mismatchedFields.push('leg_position_ids');
  }
  if (
    echoed.requestedSize.unit !== request.requested_size.unit ||
    echoed.requestedSize.valueE6 !== request.requested_size.value_e6
  ) {
    mismatchedFields.push('requested_size');
  }

  if (mismatchedFields.length > 0) {
    throw new UnexpectedResponseError(
      `Builder RFQ response did not echo the submitted ${mismatchedFields.join(', ')}.`,
    );
  }
}

function toQuoteUnavailableResult(
  response: BuilderRfqFinalStateResponse,
): RequestComboQuoteResult {
  switch (response.error?.code) {
    case RfqKnownErrorCode.NoQuotes:
      return {
        quote: null,
        reason: ComboQuoteUnavailableReason.NoQuotes,
        rfqId: response.rfqId,
      };
    case RfqKnownErrorCode.SizeTooLarge:
      return {
        quote: null,
        reason: ComboQuoteUnavailableReason.SizeTooLarge,
        rfqId: response.rfqId,
      };
    default:
      throw new RfqRequestRejectedError(
        response.error?.message ?? 'The combo quote request failed.',
        {
          code: toRfqRejectionCode(response.error?.code),
          status: 200,
          ...(response.error === undefined ? {} : { cause: response.error }),
        },
      );
  }
}

/** @internal */
export function createComboAcceptanceOrder(
  identity: OrderIdentity,
  input: ParsedAcceptComboQuoteParams,
): Omit<RfqSignedOrder, 'signature'> {
  return {
    builder: input.builderCode,
    maker: identity.maker,
    makerAmount: input.makerAmount,
    metadata: BYTES32_ZERO,
    salt: generateComboAcceptanceOrderSalt().toString(),
    side: encodeExchangeOrderSide(input.direction),
    signatureType: identity.signatureType,
    signer: identity.signer,
    takerAmount: input.takerAmount,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    tokenId: input.positionId,
  };
}

function generateComboAcceptanceOrderSalt(): bigint {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);

  // RFQ salts stay strings on the wire, so the full 64-bit value is lossless.
  return BigInt(
    `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
  );
}

/** @internal */
export async function signComboAcceptanceOrder(
  signTypedData: (payload: TypedDataPayload) => Promise<EvmSignature>,
  domain: ExchangeOrderDomain,
  order: Omit<RfqSignedOrder, 'signature'>,
): Promise<RfqSignedOrder> {
  let signature: EvmSignature;

  try {
    signature = await signTypedData(
      createExchangeOrderTypedDataPayload({ domain, order }),
    );
  } catch (error) {
    if (error instanceof CancelledSigningError) {
      throw error;
    }

    throw SigningError.fromError(
      error,
      'Could not sign the combo quote acceptance order.',
    );
  }

  return {
    ...order,
    signature: createExchangeOrderSignature({ domain, order, signature }),
  };
}

/** @internal */
export async function acceptComboQuoteOutcome(
  rfqId: RfqId,
  postAcceptance: () => Promise<BuilderRfqStatusResponse>,
  readStatus: () => Promise<BuilderRfqStatusResponse>,
): Promise<AcceptComboQuoteResult> {
  let accepted: BuilderRfqStatusResponse;
  try {
    try {
      accepted = await postAcceptance();
    } catch (error) {
      // Acceptance is idempotent server-side, so a single retry safely covers
      // both an interrupted request and a response that could not be validated.
      if (
        !(
          error instanceof TransportError ||
          error instanceof UnexpectedResponseError
        )
      ) {
        throw error;
      }
      accepted = await postAcceptance();
    }
  } catch (error) {
    const expired = toAcceptanceExpiredResult(rfqId, error);
    if (expired !== undefined) return expired;
    throw toRfqRequestRejection(error);
  }

  let status = accepted;
  // Only the accept response carries the taker order hash; status polls do
  // not, so capture it before entering the poll loop.
  const takerOrderHash = accepted.takerOrderHash;
  const deadline = Date.now() + ACCEPT_OUTCOME_TIMEOUT_MS;

  // The gateway holds the accept through maker last look but responds with
  // AWAITING_MAKER_CONFIRMATION when the outcome is still pending after its
  // hold window; resume over the status endpoint until the outcome lands.
  while (status.status === RfqStatus.AwaitingMakerConfirmation) {
    if (Date.now() >= deadline) {
      throw new TimeoutError(
        `Timed out waiting for the acceptance outcome of RFQ ${rfqId}.`,
      );
    }

    await delay(ACCEPT_OUTCOME_POLL_INTERVAL_MS);
    status = await readStatus();
  }

  if (
    status.status === RfqStatus.Failed ||
    status.status === RfqStatus.Expired ||
    status.status === RfqStatus.Canceled
  ) {
    return {
      reason: toComboAcceptFailureReason(status.status, status.error?.code),
      rfqId: status.rfqId,
      status: 'failed',
      ...(status.error === undefined ? {} : { error: status.error }),
    };
  }

  return {
    rfqId: status.rfqId,
    status: 'executing',
    ...(takerOrderHash === undefined ? {} : { takerOrderHash }),
  };
}
function toAcceptanceExpiredResult(
  rfqId: RfqId,
  error: unknown,
): AcceptComboQuoteResult | undefined {
  if (
    error instanceof RequestRejectedError &&
    error.code === RfqKnownErrorCode.ExpiredRfq
  ) {
    return {
      error: { code: RfqKnownErrorCode.ExpiredRfq, message: error.message },
      reason: ComboAcceptFailureReason.AcceptanceWindowExpired,
      rfqId,
      status: 'failed',
    };
  }

  return undefined;
}

function toComboAcceptFailureReason(
  status: RfqStatus,
  code: RfqErrorCode | undefined,
): ComboAcceptFailureReason {
  if (status === RfqStatus.Expired || code === RfqKnownErrorCode.ExpiredRfq) {
    return ComboAcceptFailureReason.AcceptanceWindowExpired;
  }

  if (code === RfqKnownErrorCode.MakerDeclined) {
    return ComboAcceptFailureReason.MakerDeclined;
  }

  return ComboAcceptFailureReason.ExecutionFailed;
}

/** @internal */
export async function pollComboFill(
  rfqId: RfqId,
  timeoutMs: number,
  pollingIntervalMs: number,
  readStatus: () => Promise<BuilderRfqStatusResponse>,
): Promise<WaitForComboFillResult> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const status = await readStatus();

    if (
      status.status === RfqStatus.Filled ||
      status.status === RfqExecutionStatus.Confirmed
    ) {
      if (status.txHash === undefined) {
        throw new UnexpectedResponseError(
          `RFQ ${status.rfqId} reached ${status.status} without a transaction hash.`,
        );
      }

      return {
        rfqId: status.rfqId,
        status: RfqStatus.Filled,
        txHash: status.txHash,
      };
    }

    if (
      status.status === RfqStatus.Failed ||
      status.status === RfqStatus.Expired ||
      status.status === RfqStatus.Canceled
    ) {
      return {
        rfqId: status.rfqId,
        status: status.status,
        ...(status.error === undefined ? {} : { error: status.error }),
      };
    }

    if (Date.now() >= deadline) {
      throw new TimeoutError(
        `Timed out after ${timeoutMs}ms waiting for RFQ ${rfqId} to reach a terminal state.`,
      );
    }

    await delay(pollingIntervalMs);
  }
}

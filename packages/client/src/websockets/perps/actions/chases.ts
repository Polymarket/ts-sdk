import { OrderSide, OrderSideSchema } from '@polymarket/bindings';
import {
  CreatePerpsChaseResponseSchema,
  FetchPerpsChasesResponseSchema,
  type PerpsChase,
  type PerpsChaseAccepted,
  PerpsChaseIdSchema,
  PerpsClientOrderIdSchema,
  PerpsCommandAckSchema,
  type PerpsDecimalInput,
  PerpsDecimalInputSchema,
} from '@polymarket/bindings/perps';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../../errors';
import { parseUserInput } from '../../../input';
import { validateWith } from '../../../response';
import type { ServiceClient } from '../../../ServiceClient';
import type { PerpsSignedOp } from '../signing';
import type { SignPerpsRestCommand } from './trading';

// Use fixed-point strings for signing and exact bounds comparison, including numeric exponent inputs.
const BoundedDecimalSchema = PerpsDecimalInputSchema.transform(
  (value, context) => {
    const match = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
    if (!match) {
      context.addIssue({
        code: 'custom',
        message: 'Expected a nonnegative decimal',
      });
      return z.NEVER;
    }
    const whole = match[1] ?? '0';
    const fraction = match[2] ?? '';
    const exponent = Number(match[3] ?? '0');
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) {
      context.addIssue({
        code: 'custom',
        message: 'Decimal exceeds supported precision',
      });
      return z.NEVER;
    }
    const digits = whole + fraction;
    const point = whole.length + exponent;
    const expanded =
      point <= 0
        ? `0.${'0'.repeat(-point)}${digits}`
        : point >= digits.length
          ? digits.padEnd(point, '0')
          : `${digits.slice(0, point)}.${digits.slice(point)}`;
    const [integer = '0', fractional = ''] = expanded.split('.');
    const normalizedFraction = fractional.replace(/0+$/, '');
    if (
      normalizedFraction.length > 28 ||
      BigInt(integer + normalizedFraction) > 79228162514264337593543950335n
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Decimal exceeds supported precision',
      });
      return z.NEVER;
    }
    return normalizedFraction ? `${integer}.${normalizedFraction}` : integer;
  },
);
function decimalUnits(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(28, '0')}`);
}

const CreatePerpsChaseRequestSchema = z
  .object({
    instrumentId: z.number().int().min(0).max(4294967295),
    side: OrderSideSchema,
    quantity: BoundedDecimalSchema.refine(
      (value) => decimalUnits(value) > 0n,
      'quantity must be positive',
    ),
    limitPrice: BoundedDecimalSchema.optional(),
    maxDistance: BoundedDecimalSchema.optional(),
    maxDistanceBps: z.number().int().min(1).max(1000).optional(),
    postOnly: z.boolean().default(true),
    reduceOnly: z.boolean().default(false),
    clientOrderId: PerpsClientOrderIdSchema.optional(),
    expiresAt: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
  })
  .superRefine((request, context) => {
    if (
      decimalUnits(request.maxDistance ?? '0') !== 0n &&
      request.maxDistanceBps !== undefined
    )
      context.addIssue({
        code: 'custom',
        path: ['maxDistanceBps'],
        message: 'Use maxDistance or maxDistanceBps, not both',
      });
  });
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type CreatePerpsChaseRequest = {
  instrumentId: number;
  side: OrderSide;
  quantity: PerpsDecimalInput;
  /** Highest buy price or lowest sell price. Zero or omission disables this bound. */ limitPrice?: PerpsDecimalInput;
  /** Maximum distance from the first price at which a child rests or fills. Zero or omission disables this bound. */ maxDistance?: PerpsDecimalInput;
  /** 1 to 1000 bps. Omit to disable; cannot combine with positive maxDistance. */ maxDistanceBps?: number;
  /** Refuse children that cross. Defaults to true. */ postOnly?: boolean;
  reduceOnly?: boolean;
  /** Retain this identity when reconciling an uncertain submission. */ clientOrderId?: string;
  /** Command deadline in Unix milliseconds; does not end the chase. */ expiresAt?: number;
};
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type CreatePerpsChaseError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const CreatePerpsChaseError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);
/** Start a chase with one submission attempt. Reconcile an uncertain outcome before creating again.
 * @internal
 * @throws {@link CreatePerpsChaseError} Thrown on failure.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function createPerpsChase(
  client: ServiceClient,
  signCommand: SignPerpsRestCommand,
  request: CreatePerpsChaseRequest,
): Promise<PerpsChaseAccepted> {
  const params = parseUserInput(request, CreatePerpsChaseRequestSchema);
  const args = {
    iid: params.instrumentId,
    buy: params.side === OrderSide.BUY,
    qty: params.quantity,
    lim: params.limitPrice,
    max_dist: params.maxDistance,
    max_dist_bps: params.maxDistanceBps,
    po: params.postOnly,
    ro: params.reduceOnly,
    c: params.clientOrderId,
  };
  const op = [
    'createChase',
    [
      args.iid,
      args.buy,
      args.qty,
      args.lim,
      args.max_dist,
      args.max_dist_bps,
      args.po,
      args.ro,
      args.c,
    ],
  ] as const satisfies PerpsSignedOp;
  const accepted = await unwrap(
    client
      .post('/v1/trade/chases', {
        retry: false,
        json: {
          ...signCommand(op, params.expiresAt),
          op: { type: 'createChase', args },
        },
      })
      .andThen(validateWith(CreatePerpsChaseResponseSchema)),
  );
  if ('status' in accepted)
    throw new RequestRejectedError(accepted.error, { status: 200 });
  return accepted;
}
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type FetchPerpsChasesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const FetchPerpsChasesError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
);
/** Fetch running chases in ascending identity order, without pagination. Ended chases are absent.
 * @internal
 * @throws {@link FetchPerpsChasesError} Thrown on failure.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsChases(
  client: ServiceClient,
): Promise<PerpsChase[]> {
  return await unwrap(
    client
      .get('/v1/account/chases')
      .andThen(validateWith(FetchPerpsChasesResponseSchema)),
  );
}
const CancelPerpsChaseRequestSchema = z.object({
  chaseId: PerpsChaseIdSchema,
  expiresAt: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type CancelPerpsChaseRequest = {
  chaseId: number;
  /** Command deadline in Unix milliseconds. */ expiresAt?: number;
};
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type CancelPerpsChaseError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const CancelPerpsChaseError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);
/** End a chase. The exchange cancels its resting child; completed fills remain.
 * @internal
 * @throws {@link CancelPerpsChaseError} Thrown on failure.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function cancelPerpsChase(
  client: ServiceClient,
  signCommand: SignPerpsRestCommand,
  request: CancelPerpsChaseRequest,
): Promise<void> {
  const params = parseUserInput(request, CancelPerpsChaseRequestSchema);
  const op = ['cancelChase', [params.chaseId]] as const satisfies PerpsSignedOp;
  const response = await unwrap(
    client
      .del('/v1/trade/chases', {
        retry: false,
        json: {
          ...signCommand(op, params.expiresAt),
          op: { type: 'cancelChase', args: { chid: params.chaseId } },
        },
      })
      .andThen(validateWith(PerpsCommandAckSchema)),
  );
  if (response.status === 'err')
    throw new RequestRejectedError(response.error, { status: 200 });
}

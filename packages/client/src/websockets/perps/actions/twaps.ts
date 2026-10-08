import { OrderSide, OrderSideSchema } from '@polymarket/bindings';
import {
  CreatePerpsTwapResponseSchema,
  FetchPerpsTwapsResponseSchema,
  PerpsClientOrderIdSchema,
  PerpsCommandAckSchema,
  type PerpsDecimalInput,
  PerpsDecimalInputSchema,
  type PerpsTwap,
  type PerpsTwapAccepted,
  PerpsTwapIdSchema,
} from '@polymarket/bindings/perps';
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
const CreatePerpsTwapRequestSchema = z
  .object({
    instrumentId: z.number().int().min(0).max(4294967295),
    side: OrderSideSchema,
    quantity: BoundedDecimalSchema.refine(
      (value) => decimalUnits(value) > 0n,
      'quantity must be positive',
    ),
    durationMs: z.number().int().min(300000).max(86400000),
    intervalMs: z.number().int().nonnegative().optional(),
    randomize: z.boolean().default(false),
    slippageBps: z.number().int().min(0).max(10000).default(0),
    minPrice: BoundedDecimalSchema.optional(),
    maxPrice: BoundedDecimalSchema.optional(),
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
    const interval = request.intervalMs;
    if (
      interval !== undefined &&
      interval !== 0 &&
      (interval < 30000 ||
        interval > request.durationMs ||
        request.durationMs % interval !== 0)
    )
      context.addIssue({
        code: 'custom',
        path: ['intervalMs'],
        message:
          'intervalMs must be at least 30000 and divide durationMs exactly',
      });
    const minimum = decimalUnits(request.minPrice ?? '0');
    const maximum = decimalUnits(request.maxPrice ?? '0');
    if (minimum !== 0n && maximum !== 0n && minimum >= maximum)
      context.addIssue({
        code: 'custom',
        path: ['maxPrice'],
        message: 'maxPrice must exceed minPrice when both bounds are set',
      });
  });
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type CreatePerpsTwapRequest = {
  instrumentId: number;
  side: OrderSide;
  quantity: PerpsDecimalInput;
  /** Run duration in milliseconds, from five minutes to 24 hours. */ durationMs: number;
  /** Omit or set zero to derive cadence. Otherwise at least 30000 and an exact divisor of durationMs. */ intervalMs?: number;
  /** Jitter slice quantities by up to 20%. Defaults to false. */ randomize?: boolean;
  /** 0 uses the venue default (300 bps). Maximum 10000. */ slippageBps?: number;
  /** Zero or omission disables this lower mark-price bound. */ minPrice?: PerpsDecimalInput;
  /** Zero or omission disables this upper mark-price bound. */ maxPrice?: PerpsDecimalInput;
  reduceOnly?: boolean;
  /** Retain this identity to reconcile an uncertain create. */ clientOrderId?: string;
  /** Command deadline in Unix milliseconds, distinct from run duration. */ expiresAt?: number;
};
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type CreatePerpsTwapError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const CreatePerpsTwapError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);
/** Start a server-managed TWAP. Reconcile uncertain submissions with fetchTwaps; do not blindly resubmit.
 * @internal
 * @throws {@link CreatePerpsTwapError} Thrown on failure.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function createPerpsTwap(
  client: ServiceClient,
  signCommand: SignPerpsRestCommand,
  request: CreatePerpsTwapRequest,
): Promise<PerpsTwapAccepted> {
  const params = parseUserInput(request, CreatePerpsTwapRequestSchema);
  const args = {
    iid: params.instrumentId,
    buy: params.side === OrderSide.BUY,
    qty: params.quantity,
    dur: params.durationMs,
    ivl: params.intervalMs,
    rnd: params.randomize,
    slip_bps: params.slippageBps,
    min_px: params.minPrice,
    max_px: params.maxPrice,
    ro: params.reduceOnly,
    c: params.clientOrderId,
  };
  const op = [
    'createTwap',
    [
      args.iid,
      args.buy,
      args.qty,
      args.dur,
      args.ivl,
      args.rnd,
      args.slip_bps,
      args.min_px,
      args.max_px,
      args.ro,
      args.c,
    ],
  ] as const satisfies PerpsSignedOp;
  const accepted = await client.post('/v1/trade/twaps', {
    schema: CreatePerpsTwapResponseSchema,
    retry: false,
    json: {
      ...signCommand(op, params.expiresAt),
      op: { type: 'createTwap', args },
    },
  });
  if ('status' in accepted)
    throw new RequestRejectedError(accepted.error, { status: 200 });
  return accepted;
}
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type FetchPerpsTwapsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const FetchPerpsTwapsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
);
/** Fetch all active runs in ascending identity order. Ended runs are absent; this is not paginated.
 * @internal
 * @throws {@link FetchPerpsTwapsError} Thrown on failure.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function fetchPerpsTwaps(
  client: ServiceClient,
): Promise<PerpsTwap[]> {
  return await client.get('/v1/account/twaps', {
    schema: FetchPerpsTwapsResponseSchema,
  });
}

const TwapIdentityRequestSchema = z.object({
  twapId: PerpsTwapIdSchema,
  expiresAt: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
});
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PausePerpsTwapRequest = {
  twapId: number /** Command deadline in Unix milliseconds. */;
  expiresAt?: number;
};
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type PausePerpsTwapError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const PausePerpsTwapError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);
/** Pause an active TWAP. An in-flight slice completes independently; the original end time is unchanged.
 * @internal
 * @throws {@link PausePerpsTwapError} Thrown on failure.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function pausePerpsTwap(
  client: ServiceClient,
  signCommand: SignPerpsRestCommand,
  request: PausePerpsTwapRequest,
): Promise<void> {
  const params = parseUserInput(request, TwapIdentityRequestSchema);
  const op = [
    'controlTwap',
    [params.twapId, 'pause'],
  ] as const satisfies PerpsSignedOp;
  const body = {
    type: 'controlTwap',
    args: { twid: params.twapId, act: 'pause' },
  };
  const response = await client.patch('/v1/trade/twaps', {
    schema: PerpsCommandAckSchema,
    retry: false,
    json: { ...signCommand(op, params.expiresAt), op: body },
  });
  if (response.status === 'err')
    throw new RequestRejectedError(response.error, { status: 200 });
}
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type ResumePerpsTwapRequest = {
  twapId: number /** Command deadline in Unix milliseconds. */;
  expiresAt?: number;
};
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type ResumePerpsTwapError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const ResumePerpsTwapError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);
/** Resume an active TWAP. An in-flight slice completes independently; the original end time is unchanged.
 * @internal
 * @throws {@link ResumePerpsTwapError} Thrown on failure.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function resumePerpsTwap(
  client: ServiceClient,
  signCommand: SignPerpsRestCommand,
  request: ResumePerpsTwapRequest,
): Promise<void> {
  const params = parseUserInput(request, TwapIdentityRequestSchema);
  const op = [
    'controlTwap',
    [params.twapId, 'resume'],
  ] as const satisfies PerpsSignedOp;
  const body = {
    type: 'controlTwap',
    args: { twid: params.twapId, act: 'resume' },
  };
  const response = await client.patch('/v1/trade/twaps', {
    schema: PerpsCommandAckSchema,
    retry: false,
    json: { ...signCommand(op, params.expiresAt), op: body },
  });
  if (response.status === 'err')
    throw new RequestRejectedError(response.error, { status: 200 });
}
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type CancelPerpsTwapRequest = {
  twapId: number /** Command deadline in Unix milliseconds. */;
  expiresAt?: number;
};
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type CancelPerpsTwapError =
  | RateLimitError
  | RequestRejectedError
  | SigningError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const CancelPerpsTwapError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  SigningError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);
/** Cancel an active TWAP. An in-flight slice completes independently; the original end time is unchanged.
 * @internal
 * @throws {@link CancelPerpsTwapError} Thrown on failure.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export async function cancelPerpsTwap(
  client: ServiceClient,
  signCommand: SignPerpsRestCommand,
  request: CancelPerpsTwapRequest,
): Promise<void> {
  const params = parseUserInput(request, TwapIdentityRequestSchema);
  const op = ['cancelTwap', [params.twapId]] as const satisfies PerpsSignedOp;
  const body = { type: 'cancelTwap', args: { twid: params.twapId } };
  const response = await client.del('/v1/trade/twaps', {
    schema: PerpsCommandAckSchema,
    retry: false,
    json: { ...signCommand(op, params.expiresAt), op: body },
  });
  if (response.status === 'err')
    throw new RequestRejectedError(response.error, { status: 200 });
}

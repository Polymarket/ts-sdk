import { RfqRejectionCode } from '@polymarket/bindings/combos';
import { PolymarketError } from '@polymarket/types';
import { RequestRejectedError } from '../../errors';

export type RfqRequestRejectedErrorOptions = {
  /** HTTP status of the rejection. */
  status: number;
  /** Classified rejection reason. */
  code: RfqRejectionCode;
};

/**
 * Error thrown when an RFQ request or acceptance is rejected.
 *
 * @remarks
 * Inspect {@link RfqRequestRejectedError.code} to distinguish permanent input
 * problems (`INVALID_RFQ`, `CONTRADICTORY_LEGS`) from transient conditions
 * (`LEG_METADATA_UNAVAILABLE`) that may be retried.
 *
 * Wire codes not recognized by this SDK version map to
 * {@link RfqRejectionCode.RequestFailed}; the original error is preserved on
 * `cause`.
 */
export class RfqRequestRejectedError extends PolymarketError {
  override name = 'RfqRequestRejectedError' as const;

  /** HTTP status of the rejection. */
  readonly status: number;

  /** Classified rejection reason. */
  readonly code: RfqRejectionCode;

  constructor(
    message: string,
    options: ErrorOptions & RfqRequestRejectedErrorOptions,
  ) {
    super(message, options);
    this.status = options.status;
    this.code = options.code;
  }
}

export function toRfqRequestRejection(error: unknown): unknown {
  if (error instanceof RequestRejectedError) {
    return new RfqRequestRejectedError(error.message, {
      cause: error,
      code: toRfqRejectionCode(error.code),
      status: error.status,
    });
  }

  return error;
}

const RFQ_REJECTION_CODES = new Set<string>(Object.values(RfqRejectionCode));

export function toRfqRejectionCode(code: string | undefined): RfqRejectionCode {
  if (code !== undefined && RFQ_REJECTION_CODES.has(code)) {
    return code as RfqRejectionCode;
  }

  return RfqRejectionCode.RequestFailed;
}

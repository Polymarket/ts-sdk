import { PolymarketError } from '@polymarket/types';
import type { ZodError } from 'zod';
import {
  formatInputZodError,
  formatResponseZodError,
  type ResponseValidationContext,
} from './validation';

/**
 * Error thrown when an action input fails SDK validation before a request is
 * sent.
 */
export class UserInputError extends PolymarketError {
  override name = 'UserInputError' as const;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
  }

  static fromZodError(error: ZodError): UserInputError {
    return new UserInputError(formatInputZodError(error), {
      cause: error,
    });
  }
}

/**
 * Error thrown when a service response does not match the action's expected
 * response shape.
 */
export class UnexpectedResponseError extends PolymarketError {
  override name = 'UnexpectedResponseError' as const;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
  }

  static fromZodError(
    error: ZodError,
    context: ResponseValidationContext,
  ): UnexpectedResponseError {
    return new UnexpectedResponseError(formatResponseZodError(error, context), {
      cause: error,
    });
  }
}

/**
 * Error thrown when the SDK cannot complete a request because of a network or
 * runtime transport failure.
 */
export class TransportError extends PolymarketError {
  override name = 'TransportError' as const;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
  }

  static fromError(error: unknown): TransportError {
    return new TransportError(
      error instanceof Error ? error.message : 'Request failed',
      {
        cause: error,
      },
    );
  }
}

export type RequestRejectedErrorOptions = {
  status: number;
};

/**
 * Error thrown when a service responds with a non-success status other than
 * rate limiting.
 */
export class RequestRejectedError extends PolymarketError {
  override name = 'RequestRejectedError' as const;

  readonly status: number;

  constructor(
    message: string,
    options: ErrorOptions & RequestRejectedErrorOptions,
  ) {
    super(message, options);
    this.status = options.status;
  }
}

/**
 * Error thrown when the service rejects a request because the rate limit has
 * been exceeded.
 */
export class RateLimitError extends PolymarketError {
  override name = 'RateLimitError' as const;
}

/**
 * Error thrown when an async wait operation exceeds its allotted polling time.
 */
export class TimeoutError extends PolymarketError {
  override name = 'TimeoutError' as const;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
  }
}

/**
 * Error thrown when a submitted transaction reaches a terminal failure state.
 */
export class TransactionFailedError extends PolymarketError {
  override name = 'TransactionFailedError' as const;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
  }
}

/**
 * Error thrown when the user cancels a required wallet signing action.
 */
export class CancelledSigningError extends PolymarketError {
  override name = 'CancelledSigningError' as const;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
  }

  static fromError(error: Error): CancelledSigningError {
    return new CancelledSigningError(error.message, {
      cause: error,
    });
  }
}

/**
 * Error thrown when there is not enough resting market liquidity to satisfy the
 * requested execution semantics.
 */
export class InsufficientLiquidityError extends PolymarketError {
  override name = 'InsufficientLiquidityError' as const;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
  }
}

/**
 * Error thrown when the SDK cannot produce a required signature or
 * authentication payload.
 */
export class SigningError extends PolymarketError {
  override name = 'SigningError' as const;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message, options);
  }

  static fromError(error: unknown, message?: string): SigningError {
    const msg =
      message ?? (error instanceof Error ? error.message : 'Signing failed');
    return new SigningError(msg, { cause: error });
  }
}

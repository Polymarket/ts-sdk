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

/**
 * WebSocket close codes defined by RFC 6455 and the IANA WebSocket Close Code
 * Number registry. Codes 4000-4999 are reserved for application use and are
 * intentionally not modeled here.
 */
export enum WebSocketKnownCloseCode {
  NormalClosure = 1000,
  GoingAway = 1001,
  ProtocolError = 1002,
  UnsupportedData = 1003,
  /** Synthesized locally when the peer closed without a status code. */
  NoStatusReceived = 1005,
  /** Synthesized locally when the connection dropped without a close frame. */
  AbnormalClosure = 1006,
  InvalidFramePayload = 1007,
  PolicyViolation = 1008,
  MessageTooBig = 1009,
  InternalError = 1011,
  ServiceRestart = 1012,
  TryAgainLater = 1013,
}

/**
 * A WebSocket close code. Codes enumerated in
 * {@link WebSocketKnownCloseCode} are defined by RFC 6455; other values, such
 * as application-defined 4000-4999 codes, flow through as plain numbers.
 */
export type WebSocketCloseCode = WebSocketKnownCloseCode | (number & {});

export type ConnectionLostErrorOptions = {
  /** WebSocket close code reported for the lost connection. */
  code: WebSocketCloseCode;
  /** Close reason provided by the peer. Empty when none was sent. */
  reason: string;
};

/**
 * Error thrown when a live connection ends without the SDK requesting it.
 */
export class ConnectionLostError extends PolymarketError {
  override name = 'ConnectionLostError' as const;

  readonly code: WebSocketCloseCode;
  readonly reason: string;

  constructor(
    message: string,
    options: ErrorOptions & ConnectionLostErrorOptions,
  ) {
    super(message, options);
    this.code = options.code;
    this.reason = options.reason;
  }
}

export type RequestRejectedErrorOptions = {
  status: number;
  /**
   * Server-requested delay in seconds before retrying, when the response
   * provided one.
   */
  retryAfter?: number;
};

/**
 * Error thrown when a service responds with a non-success status other than
 * rate limiting.
 */
export class RequestRejectedError extends PolymarketError {
  override name = 'RequestRejectedError' as const;

  readonly status: number;
  /**
   * Server-requested delay in seconds before retrying, when the response
   * provided one.
   */
  readonly retryAfter?: number;

  constructor(
    message: string,
    options: ErrorOptions & RequestRejectedErrorOptions,
  ) {
    super(message, options);
    this.status = options.status;
    this.retryAfter = options.retryAfter;
  }
}

export type RateLimitErrorOptions = {
  /**
   * Server-requested delay in seconds before retrying, when the response
   * provided one.
   */
  retryAfter?: number;
};

/**
 * Error thrown when the service rejects a request because the rate limit has
 * been exceeded.
 */
export class RateLimitError extends PolymarketError {
  override name = 'RateLimitError' as const;

  /**
   * Server-requested delay in seconds before retrying, when the response
   * provided one.
   */
  readonly retryAfter?: number;

  constructor(
    message: string,
    options: ErrorOptions & RateLimitErrorOptions = {},
  ) {
    super(message, options);
    this.retryAfter = options.retryAfter;
  }
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
 * Error thrown when arming auto-cancel is rejected because the account has
 * reached its daily auto-cancel trigger limit. Arming is rejected until the
 * daily counter resets at the next UTC midnight; clearing an existing
 * schedule is always allowed.
 *
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export class AutoCancelDailyLimitError extends PolymarketError {
  override name = 'AutoCancelDailyLimitError' as const;

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

export function makeErrorGuard<
  // biome-ignore lint/suspicious/noExplicitAny: constructor rest args require any[]
  TClasses extends ReadonlyArray<new (...args: any[]) => unknown>,
>(
  ...classes: TClasses
): { isError(error: unknown): error is InstanceType<TClasses[number]> } {
  return {
    isError(error: unknown): error is InstanceType<TClasses[number]> {
      return classes.some((c) => error instanceof c);
    },
  };
}

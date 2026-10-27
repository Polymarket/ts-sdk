import { z } from 'zod';

/** Known rejection codes; unknown future codes remain valid. */
export enum GatewayKnownErrorCode {
  InvalidCursor = 'invalid_cursor',
  InvalidQueryParam = 'invalid_query_param',
  InvalidPathParam = 'invalid_path_param',
  InvalidRequestBody = 'invalid_request_body',
  InsufficientLiquidity = 'insufficient_liquidity',
  InvalidApiKey = 'invalid_api_key',
  InvalidCredentials = 'invalid_credentials',
  LoginRejected = 'login_rejected',
  InvalidOrderTokenId = 'invalid_order_token_id',
  InvalidOrderPrice = 'invalid_order_price',
  InvalidBuilderCode = 'invalid_builder_code',
  InvalidOrderExpiration = 'invalid_order_expiration',
  InvalidOrderAmount = 'invalid_order_amount',
  InvalidOrderIdentity = 'invalid_order_identity',
  OrderTooSmall = 'order_too_small',
  InvalidClobCredentials = 'invalid_clob_credentials',
  PayloadTooLarge = 'payload_too_large',
  InvalidBuilderCredentials = 'invalid_builder_credentials',
  UpstreamUnavailable = 'upstream_unavailable',
  RateLimited = 'rate_limited',
  SubmissionOutcomeUnknown = 'submission_outcome_unknown',
  CancelOutcomeUnknown = 'cancel_outcome_unknown',
  RfqOutcomeUnknown = 'rfq_outcome_unknown',
  BuilderAttributionUnsupported = 'builder_attribution_unsupported',
  RestrictedRegionCloseOnly = 'restricted_region_close_only',
  NotFound = 'not_found',
  EventArchived = 'event_archived',
  MarketNotFound = 'market_not_found',
  DepositWalletNotFound = 'deposit_wallet_not_found',
  InvalidTransaction = 'invalid_transaction',
  TransactionNotAllowed = 'transaction_not_allowed',
  DuplicateInFlightNonce = 'duplicate_in_flight_nonce',
  InternalError = 'internal_error',
  InvalidAccessToken = 'invalid_access_token',
  ExpiredAccessToken = 'expired_access_token',
  ApiKeyMismatch = 'api_key_mismatch',
  IdentityProviderUnavailable = 'identity_provider_unavailable',
  IdentityProviderProtocolError = 'identity_provider_protocol_error',
  InvalidSigner = 'invalid_signer',
  InvalidSignature = 'invalid_signature',
  MalformedRefreshToken = 'malformed_refresh_token',
  ChallengeNotFound = 'challenge_not_found',
  ChallengeExpired = 'challenge_expired',
  InvalidAttestation = 'invalid_attestation',
  InvalidRefreshToken = 'invalid_refresh_token',
  ChallengeConsumed = 'challenge_consumed',
  InvalidWallet = 'invalid_wallet',
  WalletNotAuthorized = 'wallet_not_authorized',
}

/** A known rejection code or an unrecognized code returned by the server. */
export type GatewayErrorCode = GatewayKnownErrorCode | (string & {});

// Nullable optional hints carry no value; keep the error envelope usable.
const RetryAfterSecondsSchema = z
  .number()
  .finite()
  .nonnegative()
  .nullish()
  .transform((value) => value ?? undefined);

/** Native error envelope, retaining unrecognized codes for forward compatibility. */
export const GatewayErrorResponseSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .transform((code): GatewayErrorCode => code),
    message: z.string().min(1),
    retry_after_seconds: RetryAfterSecondsSchema,
  })
  .transform(({ code, message, retry_after_seconds }) => ({
    code,
    message,
    retryAfter: retry_after_seconds,
  }));

/** Upstream error envelope normalized to the transport's error fields. */
export const PassthroughErrorResponseSchema = z
  .object({
    error: z.string().min(1),
    code: z.string().nullish(),
    retry_after_seconds: RetryAfterSecondsSchema,
  })
  .transform(({ error, code, retry_after_seconds }) => ({
    message: error,
    code: code || undefined,
    retryAfter: retry_after_seconds,
  }));

// Preserve upstream error/retry precedence for responses containing both shapes.
export const ErrorResponseSchema = z.union([
  PassthroughErrorResponseSchema,
  GatewayErrorResponseSchema,
]);

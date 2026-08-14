import {
  BuilderCodeSchema,
  EvmAddressSchema,
  PaginationCursorSchema,
  toPaginationCursor,
} from '@polymarket/bindings';
import {
  type FundingAddressSet,
  FundingAddressSetResponseSchema,
  type FundingAsset,
  type FundingQuote,
  FundingQuoteSchema,
  type FundingTransaction,
  FundingTransactionsPageSchema,
  SupportedFundingAssetsResponseSchema,
} from '@polymarket/bindings/bridge';
import { unwrap } from '@polymarket/types';
import { z } from 'zod';
import type { BaseClient } from '../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../errors';
import { parseUserInput } from '../input';
import { PageSizeSchema, type Paginated, paginate } from '../pagination';
import { validateWith } from '../response';
import { snakeCase, toSearchParams } from './params';

const BuilderCodeInputSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'Expected a 32-byte hex string')
  .pipe(BuilderCodeSchema);

const EvmWalletInputSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Expected an EVM address')
  .pipe(EvmAddressSchema);

/** Identifies a token on a funding source or destination chain. */
export type FundingAssetLocation = {
  /** Chain identifier serialized as a decimal string. */
  chainId: string;
  /** Token address on the chain. */
  tokenAddress: string;
};

/** Identifies the token and recipient for a funding destination. */
export type FundingDestination = FundingAssetLocation & {
  /** Wallet address that receives the destination token. */
  recipientAddress: string;
};

const FundingAssetLocationSchema = z.strictObject({
  chainId: z.string().trim().regex(/^\d+$/, 'Expected a decimal chain ID'),
  tokenAddress: z.string().trim().min(1),
}) satisfies z.ZodType<FundingAssetLocation>;

const FundingDestinationSchema = FundingAssetLocationSchema.extend({
  recipientAddress: z.string().trim().min(1),
}) satisfies z.ZodType<FundingDestination>;

const CreateDepositAddressesRequestSchema = z.strictObject({
  builderCode: BuilderCodeInputSchema.optional(),
  wallet: EvmWalletInputSchema,
});

export type CreateDepositAddressesRequest = z.input<
  typeof CreateDepositAddressesRequestSchema
>;

export type CreateDepositAddressesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const CreateDepositAddressesError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Creates chain-specific addresses that fund a Polymarket wallet.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link CreateDepositAddressesError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const result = await createDepositAddresses(client, {
 *   wallet: '0x56687bf447db6ffa42ffe2204a05edaa20f55839',
 * });
 *
 * // result.addresses.evm
 * ```
 */
export async function createDepositAddresses(
  client: BaseClient,
  request: CreateDepositAddressesRequest,
): Promise<FundingAddressSet> {
  const params = parseUserInput(request, CreateDepositAddressesRequestSchema);

  return unwrap(
    client.bridge
      .post('/deposit', {
        headers:
          params.builderCode === undefined
            ? undefined
            : { 'X-Builder-Code': params.builderCode },
        json: { address: params.wallet },
      })
      .andThen(validateWith(FundingAddressSetResponseSchema)),
  );
}

export type FetchSupportedFundingAssetsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError;
export const FetchSupportedFundingAssetsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
);

/**
 * Fetches the current chains and tokens supported for account funding.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchSupportedFundingAssetsError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const assets = await fetchSupportedFundingAssets(client);
 * ```
 */
export async function fetchSupportedFundingAssets(
  client: BaseClient,
): Promise<FundingAsset[]> {
  const response = await unwrap(
    client.bridge
      .get('/supported-assets')
      .andThen(validateWith(SupportedFundingAssetsResponseSchema)),
  );

  return response.supportedAssets;
}

const FetchFundingQuoteRequestSchema = z.strictObject({
  amount: z.bigint().positive(),
  source: FundingAssetLocationSchema,
  destination: FundingDestinationSchema,
}) satisfies z.ZodType<FetchFundingQuoteRequest>;

export type FetchFundingQuoteRequest = {
  /** Amount of the source token to send, in base units. */
  amount: bigint;
  /** Source chain and token. */
  source: FundingAssetLocation;
  /** Destination chain, token, and recipient. */
  destination: FundingDestination;
};

export type FetchFundingQuoteError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const FetchFundingQuoteError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Fetches an estimated account-funding or withdrawal quote.
 *
 * @remarks
 * This is a low-level function. Most SDK consumers should prefer the client instance API.
 *
 * @throws {@link FetchFundingQuoteError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const quote = await fetchFundingQuote(client, {
 *   amount: 10_000_000n,
 *   source: {
 *     chainId: '137',
 *     tokenAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
 *   },
 *   destination: {
 *     chainId: '137',
 *     tokenAddress: '0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb',
 *     recipientAddress: '0x17ec161f126e82a8ba337f4022d574dbeafef575',
 *   },
 * });
 * ```
 */
export async function fetchFundingQuote(
  client: BaseClient,
  request: FetchFundingQuoteRequest,
): Promise<FundingQuote> {
  const params = parseUserInput(request, FetchFundingQuoteRequestSchema);

  return unwrap(
    client.bridge
      .post('/quote', {
        json: {
          fromAmountBaseUnit: params.amount.toString(),
          fromChainId: params.source.chainId,
          fromTokenAddress: params.source.tokenAddress,
          recipientAddress: params.destination.recipientAddress,
          toChainId: params.destination.chainId,
          toTokenAddress: params.destination.tokenAddress,
        },
      })
      .andThen(validateWith(FundingQuoteSchema)),
  );
}

const ListFundingTransactionsRequestSchema = z.strictObject({
  address: z.string().trim().min(1),
  cursor: PaginationCursorSchema.optional(),
  pageSize: PageSizeSchema.max(100).default(50),
});

export type ListFundingTransactionsRequest = z.input<
  typeof ListFundingTransactionsRequestSchema
>;

export type ListFundingTransactionsError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const ListFundingTransactionsError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Lists deposit and withdrawal transactions for a funding address across all pages.
 *
 * @remarks
 * Pass an EVM, SVM, BTC, or Tron address returned when creating deposit or
 * withdrawal addresses.
 *
 * Results are ordered newest first. Cursors are opaque and bound to the
 * funding address; pass them back without inspecting or modifying them.
 * Page size must be between 1 and 100 and defaults to 50.
 *
 * @throws {@link ListFundingTransactionsError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const result = listFundingTransactions(client, {
 *   address: '0x23566f8b2e82adfcf01846e54899d110e97ac053',
 * });
 *
 * for await (const page of result) {
 *   // page.items: FundingTransaction[]
 * }
 * ```
 */
export function listFundingTransactions(
  client: BaseClient,
  request: ListFundingTransactionsRequest,
): Paginated<FundingTransaction[]> {
  const { address, cursor, pageSize } = parseUserInput(
    request,
    ListFundingTransactionsRequestSchema,
  );

  return paginate(
    (nextCursor) =>
      client.bridge
        .get(`/status/${encodeURIComponent(address)}`, {
          params: toSearchParams(
            { cursor: nextCursor, limit: pageSize },
            snakeCase(),
          ),
        })
        .andThen(validateWith(FundingTransactionsPageSchema))
        .map((response) => ({
          items: response.transactions,
          hasMore: response.nextCursor !== null,
          nextCursor:
            response.nextCursor === null
              ? undefined
              : toPaginationCursor(response.nextCursor),
        })),
    cursor,
  );
}

const CreateWithdrawalAddressesRequestSchema = z.strictObject({
  builderCode: BuilderCodeInputSchema.optional(),
  destination: FundingDestinationSchema,
  wallet: EvmWalletInputSchema,
});

export type CreateWithdrawalAddressesRequest = z.input<
  typeof CreateWithdrawalAddressesRequestSchema
>;

export type CreateWithdrawalAddressesError =
  | RateLimitError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
export const CreateWithdrawalAddressesError = makeErrorGuard(
  RateLimitError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/**
 * Creates addresses configured to route funds to a withdrawal destination.
 *
 * @remarks
 * Creating the addresses does not move funds. Send pUSD from the Polymarket
 * wallet to the returned EVM address to begin the withdrawal.
 *
 * @throws {@link CreateWithdrawalAddressesError}
 * Thrown on failure.
 *
 * @example
 * ```ts
 * const result = await createWithdrawalAddresses(client, {
 *   wallet: '0x9156dd10bea4c8d7e2d591b633d1694b1d764756',
 *   destination: {
 *     chainId: '1',
 *     tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
 *     recipientAddress: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
 *   },
 * });
 * ```
 */
export async function createWithdrawalAddresses(
  client: BaseClient,
  request: CreateWithdrawalAddressesRequest,
): Promise<FundingAddressSet> {
  const params = parseUserInput(
    request,
    CreateWithdrawalAddressesRequestSchema,
  );

  return unwrap(
    client.bridge
      .post('/withdraw', {
        headers:
          params.builderCode === undefined
            ? undefined
            : { 'X-Builder-Code': params.builderCode },
        json: {
          address: params.wallet,
          recipientAddr: params.destination.recipientAddress,
          toChainId: params.destination.chainId,
          toTokenAddress: params.destination.tokenAddress,
        },
      })
      .andThen(validateWith(FundingAddressSetResponseSchema)),
  );
}

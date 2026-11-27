import { type HexString, isHexString } from '@polymarket/types';
import { z } from 'zod';
import { EvmAddressSchema } from '../shared';

/**
 * The known states of a wallet migration and of a leftover sweep.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum WalletMigrationKnownState {
  NotRequired = 'NOT_REQUIRED',
  Required = 'REQUIRED',
  SmartWalletDeploymentInProgress = 'SMART_WALLET_DEPLOYMENT_IN_PROGRESS',
  RequiresFundsTransfers = 'REQUIRES_FUNDS_TRANSFERS',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
}

/** A wallet migration state. A later release can add states. */
export type WalletMigrationState = WalletMigrationKnownState | (string & {});

/**
 * The next step of a wallet migration or of a leftover sweep.
 * @internal
 */
export enum WalletMigrationNextAction {
  None = 'none',
  Start = 'start',
  Sign = 'sign',
  Execute = 'execute',
}

/**
 * How the account signs a sweep.
 * @internal
 */
export enum WalletMigrationSweepShape {
  Proxy = 'proxy',
  Safe = 'safe',
  SafeCreate = 'safe-create',
}

/**
 * The known reasons that stop a wallet migration or a leftover sweep.
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export enum WalletMigrationKnownBlockerCode {
  MultipleAccounts = 'MULTIPLE_ACCOUNTS',
  UnsupportedWallet = 'UNSUPPORTED_WALLET',
  TooManyPositions = 'TOO_MANY_POSITIONS',
  LegacyFunds = 'LEGACY_FUNDS',
  SiblingFunded = 'SIBLING_FUNDED',
  DestinationInUse = 'DESTINATION_IN_USE',
  ProfileRestricted = 'PROFILE_RESTRICTED',
}

/** A blocker code. A later release can add codes. */
export type WalletMigrationBlockerCode =
  | WalletMigrationKnownBlockerCode
  | (string & {});

const WalletMigrationStateSchema = z
  .string()
  .transform((state): WalletMigrationState => state);

const OptionalEvmAddressSchema = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  EvmAddressSchema.optional(),
);

const WalletMigrationNextActionSchema = z
  .object({ type: z.enum(WalletMigrationNextAction) })
  .transform(({ type }) => type);

export const WalletMigrationManifestEntrySchema = z.object({
  assetClass: z.string(),
  kind: z.string(),
  contract: z.string(),
  count: z.number().int(),
  rawBalance: z.string().nullish(),
});

export type WalletMigrationManifestEntry = z.infer<
  typeof WalletMigrationManifestEntrySchema
>;

const ManifestSchema = z
  .array(WalletMigrationManifestEntrySchema)
  .nullish()
  .transform((entries) => entries ?? []);

export const WalletMigrationBlockerSchema = z.object({
  code: z.string().transform((code): WalletMigrationBlockerCode => code),
  message: z.string(),
  address: z.string().nullish(),
  limit: z.number().int().nullish(),
  assets: z.array(WalletMigrationManifestEntrySchema).nullish(),
});

export type WalletMigrationBlocker = z.infer<
  typeof WalletMigrationBlockerSchema
>;

const BlockersSchema = z
  .array(WalletMigrationBlockerSchema)
  .nullish()
  .transform((blockers) => blockers ?? []);

export const WalletMigrationSchema = z.object({
  state: WalletMigrationStateSchema,
  depositWallet: OptionalEvmAddressSchema,
  failedReason: z.string().nullish(),
  tradingPaused: z.boolean(),
  cancelable: z.boolean(),
  manifest: ManifestSchema,
  sweepSubmitted: z.boolean().nullish(),
});

/** The wallet migration of an account. */
export type WalletMigration = z.infer<typeof WalletMigrationSchema>;

export const WalletMigrationPreviewSchema = z.object({
  manifest: ManifestSchema,
  positionCount: z.number().int().nullish(),
  marketsTraded: z.number().int().nullish(),
  blockers: BlockersSchema,
});

/** What a wallet migration would move, and each blocker that stops it. */
export type WalletMigrationPreview = z.infer<
  typeof WalletMigrationPreviewSchema
>;

/** @internal */
export const WalletMigrationSweepSchema = z.object({
  digest: z
    .string()
    .refine(
      (digest) => isHexString(digest) && digest.length === 66,
      'Expected a 32-byte hex digest',
    )
    .transform((digest) => digest as HexString),
  shape: z.enum(WalletMigrationSweepShape),
  typedData: z.unknown().optional(),
});

/**
 * A sweep that the account signs.
 * @internal
 */
export type WalletMigrationSweep = z.infer<typeof WalletMigrationSweepSchema>;

function field<TName extends string, TType extends string>(
  name: TName,
  type: TType,
) {
  return z.object({ name: z.literal(name), type: z.literal(type) }).strict();
}

// A uint256 member of the typed data: a decimal string or a non-negative safe
// integer within the uint256 range. Other JSON values are refused instead of
// coerced.
const TypedDataUintSchema = z
  .union([
    z.string().regex(/^(0|[1-9][0-9]{0,77})$/),
    z.number().int().nonnegative(),
  ])
  .transform((value) => BigInt(value))
  .refine((value) => value <= 2n ** 256n - 1n, 'Expected a uint256 value');

/**
 * The typed data of a `safe-create` sweep: a Safe deployment with its payment fields.
 * @internal
 */
export const WalletMigrationSafeCreateTypedDataSchema = z
  .object({
    primaryType: z.literal('CreateProxy'),
    domain: z
      .object({
        name: z.literal('Polymarket Contract Proxy Factory'),
        chainId: TypedDataUintSchema,
        verifyingContract: EvmAddressSchema,
      })
      .strict(),
    types: z
      .object({
        EIP712Domain: z
          .tuple([
            field('name', 'string'),
            field('chainId', 'uint256'),
            field('verifyingContract', 'address'),
          ])
          .optional(),
        CreateProxy: z.tuple([
          field('paymentToken', 'address'),
          field('payment', 'uint256'),
          field('paymentReceiver', 'address'),
        ]),
      })
      .strict(),
    message: z
      .object({
        paymentToken: EvmAddressSchema,
        payment: TypedDataUintSchema,
        paymentReceiver: EvmAddressSchema,
      })
      .strict(),
  })
  .strict();

/** @internal */
export const WalletMigrationStepSchema = z.object({
  state: WalletMigrationStateSchema,
  depositWallet: OptionalEvmAddressSchema,
  failedReason: z.string().nullish(),
  nextAction: WalletMigrationNextActionSchema,
  sweep: WalletMigrationSweepSchema.nullish(),
  sweepSubmitted: z.boolean().nullish(),
});

/**
 * One step of a wallet migration or of a leftover sweep.
 * @internal
 */
export type WalletMigrationStep = z.infer<typeof WalletMigrationStepSchema>;

export const WalletSweepSummarySchema = z.object({
  state: WalletMigrationStateSchema,
  failedReason: z.string().nullish(),
  sweepSubmitted: z.boolean().nullish(),
});

export const WalletLeftoversSchema = z.object({
  hasLeftovers: z.boolean(),
  legacyWallet: OptionalEvmAddressSchema,
  depositWallet: OptionalEvmAddressSchema,
  manifest: ManifestSchema,
  positionCount: z.number().int().nullish(),
  cashUsd: z.number(),
  positionsValueUsd: z.number().nullish(),
  amountUsd: z.number(),
  amountComplete: z.boolean(),
  blockers: BlockersSchema,
  lastSweep: WalletSweepSummarySchema.nullish(),
  sweepAvailable: z.boolean(),
});

/** What the old wallet of a migrated account still holds. */
export type WalletLeftovers = z.infer<typeof WalletLeftoversSchema>;

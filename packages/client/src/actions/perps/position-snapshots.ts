import { EvmAddressSchema } from '@polymarket/bindings';
import {
  PerpsCredentialsResponseSchema,
  type PerpsPositionSnapshots,
  PerpsPositionSnapshotsSchema,
} from '@polymarket/bindings/perps';
import { z } from 'zod';
import type { BaseClient } from '../../clients';
import {
  makeErrorGuard,
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
} from '../../errors';
import { parseUserInput } from '../../input';
import type { RequestOptions } from '../../request-options';
import type { ServiceClient } from '../../ServiceClient';

/** A historical fill key. Trade IDs remain decimal strings, including above 2^53.
 * @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsPositionSnapshotFill = {
  instrumentId: number;
  tradeId: string;
  timestamp: number;
};
/** Select up to 20 active instruments and 4 historical fills, with at least one selection.
 * @experimental This API may change in a breaking way in any release, including patch releases. */
export type PerpsPositionSnapshotSelection = {
  activeInstrumentIds?: readonly number[];
  historyFills?: readonly PerpsPositionSnapshotFill[];
};
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type FetchPerpsPositionSnapshotsRequest =
  PerpsPositionSnapshotSelection & { address: string };

const SelectionShape = {
  activeInstrumentIds: z
    .array(z.number().int().min(0).max(4294967295))
    .max(20)
    .optional(),
  historyFills: z
    .array(
      z.strictObject({
        instrumentId: z.number().int().min(0).max(4294967295),
        tradeId: z
          .string()
          .regex(/^[0-9]{1,20}$/)
          .refine(
            (value) =>
              /^[0-9]{1,20}$/.test(value) &&
              BigInt(value) <= 18446744073709551615n,
          ),
        timestamp: z.number().int().min(0).max(18446744073709),
      }),
    )
    .max(4)
    .optional(),
};
function validSelection(selection: PerpsPositionSnapshotSelection): boolean {
  const active = selection.activeInstrumentIds ?? [];
  const history = selection.historyFills ?? [];
  return (
    active.length + history.length > 0 &&
    new Set(active).size === active.length &&
    history.every((fill) => /^[0-9]{1,20}$/.test(fill.tradeId)) &&
    new Set(
      history.map((fill) => `${fill.instrumentId}:${BigInt(fill.tradeId)}`),
    ).size === history.length
  );
}
const SelectionSchema = z
  .strictObject(SelectionShape)
  .refine(
    validSelection,
    'Select at least one item without duplicate instruments or fills',
  );
const RequestSchema = z
  .strictObject({ address: EvmAddressSchema, ...SelectionShape })
  .refine(
    validSelection,
    'Select at least one item without duplicate instruments or fills',
  );

/** @experimental This API may change in a breaking way in any release, including patch releases. */
export type FetchPerpsPositionSnapshotsError =
  | RateLimitError
  | RequestAbortedError
  | RequestRejectedError
  | TransportError
  | UnexpectedResponseError
  | UserInputError;
/** @experimental This API may change in a breaking way in any release, including patch releases. */
export const FetchPerpsPositionSnapshotsError = makeErrorGuard(
  RateLimitError,
  RequestAbortedError,
  RequestRejectedError,
  TransportError,
  UnexpectedResponseError,
  UserInputError,
);

/** Fetches ordered position snapshots anonymously, including on secure clients.
 * Use session.fetchPositionSnapshots for owner-only leverage and PnL percentage.
 * This direct batch read does not paginate or retry item statuses.
 * @throws {@link FetchPerpsPositionSnapshotsError} Thrown on failure.
 * @experimental This API may change in a breaking way in any release, including patch releases. */
export async function fetchPerpsPositionSnapshots(
  client: BaseClient,
  request: FetchPerpsPositionSnapshotsRequest,
  options: RequestOptions = {},
): Promise<PerpsPositionSnapshots> {
  const parsed = parseUserInput(request, RequestSchema);
  return fetchSnapshots(client.perps, parsed, options);
}

/** @internal */
export async function fetchOwnPerpsPositionSnapshots(
  api: ServiceClient,
  request: PerpsPositionSnapshotSelection,
): Promise<PerpsPositionSnapshots> {
  const selection = parseUserInput(request, SelectionSchema);
  const owner = await api.get('/v1/account/credentials', {
    schema: PerpsCredentialsResponseSchema,
  });
  return fetchSnapshots(api, { ...selection, address: owner.address });
}

async function fetchSnapshots(
  api: ServiceClient,
  request: FetchPerpsPositionSnapshotsRequest,
  options: RequestOptions = {},
): Promise<PerpsPositionSnapshots> {
  return api.post('/v1/info/position-snapshots', {
    schema: PerpsPositionSnapshotsSchema,
    signal: options.signal,
    json: {
      address: request.address,
      ...(request.activeInstrumentIds === undefined
        ? {}
        : { active_instrument_ids: request.activeInstrumentIds }),
      ...(request.historyFills === undefined
        ? {}
        : {
            history_fills: request.historyFills.map((fill) => ({
              instrument_id: fill.instrumentId,
              trade_id: fill.tradeId,
              timestamp: fill.timestamp,
            })),
          }),
    },
  });
}

import { expectHexString, type HexString } from '@polymarket/types';
import { z } from 'zod';
import type {
  ComboConditionId,
  DecimalString,
  EventId,
  EvmAddress,
  PositionId,
} from '../shared';
import {
  ComboConditionIdSchema,
  DecimalStringSchema,
  E6BigIntStringToDecimalStringSchema,
  EventIdSchema,
  EvmAddressSchema,
  PositionIdSchema,
} from '../shared';

const HexStringSchema = z.string().transform((value) => expectHexString(value));

/**
 * Known collateral-return plan operation kinds.
 *
 * The service evolves this set independently of released clients, so plan
 * parsing accepts unknown kinds as plain strings; see
 * {@link CollateralReturnOperationKind}.
 */
export enum CollateralReturnKnownOperationKind {
  Split = 'split',
  Merge = 'merge',
  Redeem = 'redeem',
  SplitOnCondition = 'split_on_condition',
  MergeOnCondition = 'merge_on_condition',
  SplitOnEvent = 'split_on_event',
  MergeOnEvent = 'merge_on_event',
  ConvertOnEvent = 'convert_on_event',
  Extract = 'extract',
  Inject = 'inject',
  ConvertToYesBasket = 'convert_to_yes_basket',
  MergeFromYesBasket = 'merge_from_yes_basket',
  Compress = 'compress',
}

/**
 * A collateral-return operation kind. Known kinds are enumerated in
 * {@link CollateralReturnKnownOperationKind}; newly introduced kinds flow
 * through as plain strings so plans keep parsing before a client release that
 * enumerates them.
 */
export type CollateralReturnOperationKind =
  | CollateralReturnKnownOperationKind
  | (string & {});

const CollateralReturnOperationKindSchema = z
  .string()
  .transform((value): CollateralReturnOperationKind => value);

export type CollateralReturnOperation = {
  kind: CollateralReturnOperationKind;
  conditionId?: ComboConditionId;
  eventId?: EventId;
  positionId?: PositionId;
  conditionIndex: number;
  amount: DecimalString;
};

const CollateralReturnOperationSchema = z
  .object({
    kind: CollateralReturnOperationKindSchema,
    condition_id: ComboConditionIdSchema.optional(),
    event_id: EventIdSchema.optional(),
    position_id: PositionIdSchema.optional(),
    // The wire format omits zero values, so an absent index means 0.
    condition_index: z.number().int().nonnegative().optional().default(0),
    amount: E6BigIntStringToDecimalStringSchema,
  })
  .transform(
    (operation): CollateralReturnOperation => ({
      amount: operation.amount,
      conditionId: operation.condition_id,
      conditionIndex: operation.condition_index,
      eventId: operation.event_id,
      kind: operation.kind,
      positionId: operation.position_id,
    }),
  );

export type CollateralReturnPositionAmount = {
  positionId: PositionId;
  amount: DecimalString;
};

const CollateralReturnPositionAmountSchema = z
  .object({
    position_id: PositionIdSchema,
    amount: E6BigIntStringToDecimalStringSchema,
  })
  .transform(
    (position): CollateralReturnPositionAmount => ({
      amount: position.amount,
      positionId: position.position_id,
    }),
  );

export type CollateralReturnPositionSummary = {
  consumed: CollateralReturnPositionAmount[];
  created: CollateralReturnPositionAmount[];
};

const CollateralReturnPositionSummarySchema = z
  .object({
    consumed: z.array(CollateralReturnPositionAmountSchema),
    created: z.array(CollateralReturnPositionAmountSchema),
  })
  .transform(
    (summary): CollateralReturnPositionSummary => ({
      consumed: summary.consumed,
      created: summary.created,
    }),
  );

export type CollateralReturnRouterCall = {
  to: EvmAddress;
  data: HexString;
};

const CollateralReturnRouterCallSchema = z
  .object({
    to: EvmAddressSchema,
    data: HexStringSchema,
  })
  .transform(
    (call): CollateralReturnRouterCall => ({
      data: call.data,
      to: call.to,
    }),
  );

/**
 * The plan fields execution consumes: the plan identifier round-tripped to
 * the service, the chain and wallet the plan was computed for, and the exact
 * Router call the execution signs and submits.
 */
export const CollateralReturnPlanSchema = z.looseObject({
  planHash: HexStringSchema,
  chainId: z.number().int(),
  wallet: EvmAddressSchema,
  routerCall: CollateralReturnRouterCallSchema,
});

export type CollateralReturnPlanResponse = {
  planHash: HexString;
  chainId: number;
  wallet: EvmAddress;
  blockNumber: bigint;
  startingPusd: DecimalString;
  netPusdOut: DecimalString;
  finalPusd: DecimalString;
  operations: CollateralReturnOperation[];
  operationCount: number;
  truncated: boolean;
  estimatedCost: number;
  requiredPusdInput: DecimalString;
  requiredPositions: CollateralReturnPositionAmount[];
  positionSummary: CollateralReturnPositionSummary;
  candidatePositionIds: PositionId[];
  routerCall: CollateralReturnRouterCall;
};

export const CollateralReturnPlanResponseSchema = z
  .object({
    plan_hash: HexStringSchema,
    chain_id: z.number().int(),
    wallet: EvmAddressSchema,
    block_number: z.string().regex(/^\d+$/).transform(BigInt),
    starting_pusd: DecimalStringSchema,
    net_pusd_out: DecimalStringSchema,
    final_pusd: DecimalStringSchema,
    operations: z.array(CollateralReturnOperationSchema),
    operation_count: z.number().int(),
    truncated: z.boolean(),
    estimated_cost: z.number(),
    required_pusd_input: DecimalStringSchema,
    required_positions: z.array(CollateralReturnPositionAmountSchema),
    // Tolerate older service builds that predate the summary field.
    position_summary: CollateralReturnPositionSummarySchema.optional(),
    candidate_position_ids: z.array(PositionIdSchema),
    router_call: CollateralReturnRouterCallSchema,
  })
  .transform(
    (response): CollateralReturnPlanResponse => ({
      blockNumber: response.block_number,
      candidatePositionIds: response.candidate_position_ids,
      chainId: response.chain_id,
      estimatedCost: response.estimated_cost,
      finalPusd: response.final_pusd,
      netPusdOut: response.net_pusd_out,
      operationCount: response.operation_count,
      operations: response.operations,
      planHash: response.plan_hash,
      positionSummary: response.position_summary ?? {
        consumed: [],
        created: [],
      },
      requiredPositions: response.required_positions,
      requiredPusdInput: response.required_pusd_input,
      routerCall: response.router_call,
      startingPusd: response.starting_pusd,
      truncated: response.truncated,
      wallet: response.wallet,
    }),
  );

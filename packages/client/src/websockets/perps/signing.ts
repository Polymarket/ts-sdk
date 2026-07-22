import { encode } from '@msgpack/msgpack';
import type { EvmSignature, PrivateKey } from '@polymarket/types';
import { expectEvmSignature } from '@polymarket/types';
import { Hash, Secp256k1, Signature, TypedData } from 'ox';
import type { TypedDataPayload } from '../../types';

type MsgpackValue =
  | boolean
  | number
  | string
  | readonly MsgpackValue[]
  | { readonly [key: string]: MsgpackValue }
  | undefined;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsSignedOp = readonly MsgpackValue[];
/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type PerpsSignableValue = MsgpackValue;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type SignPerpsOpRequest = {
  chainId: number;
  op: PerpsSignableValue;
  privateKey: PrivateKey;
  salt: number;
  timestamp: number;
};

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export type CreatePerpsOpTypedDataPayloadRequest = Omit<
  SignPerpsOpRequest,
  'privateKey'
>;

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function signPerpsOp(request: SignPerpsOpRequest): EvmSignature {
  const payload = TypedData.getSignPayload(
    createPerpsOpTypedDataPayload(request),
  );
  return expectEvmSignature(
    Signature.toHex(
      Secp256k1.sign({ payload, privateKey: request.privateKey }),
    ),
  );
}

/**
 * @experimental This API may change in a breaking way in any release, including patch releases.
 */
export function createPerpsOpTypedDataPayload(
  request: CreatePerpsOpTypedDataPayloadRequest,
): TypedDataPayload {
  return {
    domain: {
      chainId: request.chainId,
      name: 'Polymarket',
      version: '1',
    },
    message: {
      data: Hash.keccak256(encode(compactSignableValue(request.op)), {
        as: 'Hex',
      }),
      salt: BigInt(request.salt),
      ts: BigInt(request.timestamp),
    },
    primaryType: 'Op',
    types: {
      Op: [
        { name: 'data', type: 'bytes32' },
        { name: 'salt', type: 'uint64' },
        { name: 'ts', type: 'uint64' },
      ],
    },
  };
}

function compactSignableValue(value: PerpsSignableValue): PerpsSignableValue {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map(compactSignableValue);
  }

  return value;
}

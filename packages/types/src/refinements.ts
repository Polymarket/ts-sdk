import type { NonEmptyArray } from './array';
import { invariant } from './helpers';
import {
  type Erc1271Signature,
  type EvmAddress,
  type EvmSignature,
  type HexString,
  isHexString,
  isPrivateKey,
  type PrivateKey,
  type SessionSignerSignature,
  type TxHash,
} from './hex';

/**
 * Refines a value to exclude `null` and `undefined`.
 */
export function expectPresent<T>(
  value: T,
  message = 'Expected value to be present',
): Exclude<T, null | undefined> {
  invariant(value !== null && value !== undefined, message);
  return value as Exclude<T, null | undefined>;
}

/**
 * Refines an array to a non-empty tuple or throws when the array is empty.
 */
export function expectNonEmptyArray<T>(
  value: readonly T[],
  message = 'Expected a non-empty array',
): NonEmptyArray<T> {
  invariant(value.length > 0, message);

  return value as NonEmptyArray<T>;
}

/**
 * Refines a string to a hex string or throws when the value is invalid.
 */
export function expectHexString(
  value: string,
  message = 'Expected a hex string',
): HexString {
  invariant(isHexString(value), message);
  return value;
}

/**
 * Refines a string to a private key or throws when the value is invalid.
 */
export function expectPrivateKey(
  value: unknown,
  message = 'Expected a private key',
): PrivateKey {
  invariant(isPrivateKey(value), message);
  return value;
}

/**
 * Refines a string to an EVM address or throws when the value is invalid.
 */
export function expectEvmAddress(
  value: unknown,
  message = 'Expected an EVM address',
): EvmAddress {
  invariant(isHexString(value) && value.length === 42, message);
  return value as EvmAddress;
}

/**
 * Refines a string to an EVM signature or throws when the value is invalid.
 */
export function expectEvmSignature(
  value: unknown,
  message = 'Expected an EVM signature',
): EvmSignature {
  invariant(isHexString(value) && value.length === 132, message);
  return value as EvmSignature;
}

/**
 * Refines a string to an ERC-1271 signature payload or throws when the value is invalid.
 */
export function expectErc1271Signature(
  value: unknown,
  message = 'Expected an ERC-1271 signature payload',
): Erc1271Signature {
  invariant(isHexString(value), message);
  return value as Erc1271Signature;
}

/**
 * Refines a string to a Deposit Wallet session-signer signature envelope or throws when the value is invalid.
 */
export function expectSessionSignerSignature(
  value: unknown,
  message = 'Expected a session-signer signature envelope',
): SessionSignerSignature {
  invariant(isHexString(value), message);
  return value as SessionSignerSignature;
}

/**
 * Refines a string to a transaction hash or throws when the value is invalid.
 */
export function expectTxHash(
  value: unknown,
  message = 'Expected a transaction hash',
): TxHash {
  invariant(isHexString(value) && value.length === 66, message);
  return value as TxHash;
}

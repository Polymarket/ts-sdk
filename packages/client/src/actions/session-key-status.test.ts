import {
  RelayerAuthorizeSessionSignerStatus,
  RelayerRevokeSessionSignerStatus,
} from '@polymarket/bindings/relayer';
import { describe, expect, it } from 'vitest';
import { TransactionFailedError } from '../errors';
import { assertSessionSignerOperationAccepted } from './session-key-status';

const ACCEPTED_AUTHORIZATION_STATUSES = [
  RelayerAuthorizeSessionSignerStatus.SUBMITTED,
  RelayerAuthorizeSessionSignerStatus.REGISTRY_PENDING,
  RelayerAuthorizeSessionSignerStatus.REGISTERED,
];
const FAILED_AUTHORIZATION_STATUSES = [
  RelayerAuthorizeSessionSignerStatus.FAILED,
  RelayerAuthorizeSessionSignerStatus.SUPERSEDED,
  RelayerAuthorizeSessionSignerStatus.REPAIR_REQUIRED,
];
const ACCEPTED_REVOCATION_STATUSES = [
  RelayerRevokeSessionSignerStatus.PENDING,
  RelayerRevokeSessionSignerStatus.FENCED,
  RelayerRevokeSessionSignerStatus.SWEPT,
  RelayerRevokeSessionSignerStatus.CHAIN_SUBMITTED,
  RelayerRevokeSessionSignerStatus.CONFIRMED,
];
const FAILED_REVOCATION_STATUSES = [RelayerRevokeSessionSignerStatus.FAILED];

describe('session-signer response status', () => {
  it.each(
    ACCEPTED_AUTHORIZATION_STATUSES,
  )('accepts authorization status %s for polling', (status) => {
    expect(() =>
      assertSessionSignerOperationAccepted({
        kind: 'authorization',
        status,
      }),
    ).not.toThrow();
  });

  it.each(
    FAILED_AUTHORIZATION_STATUSES,
  )('rejects terminal authorization status %s before polling', (status) => {
    const assertStatus = () =>
      assertSessionSignerOperationAccepted({
        kind: 'authorization',
        status,
      });

    expect(assertStatus).toThrowError(TransactionFailedError);
    expect(assertStatus).toThrow(
      `Session-key authorization reached terminal status ${status}`,
    );
  });

  it('classifies every authorization status', () => {
    expect(
      new Set([
        ...ACCEPTED_AUTHORIZATION_STATUSES,
        ...FAILED_AUTHORIZATION_STATUSES,
      ]),
    ).toEqual(new Set(Object.values(RelayerAuthorizeSessionSignerStatus)));
  });

  it.each(
    ACCEPTED_REVOCATION_STATUSES,
  )('accepts revocation status %s for polling', (status) => {
    expect(() =>
      assertSessionSignerOperationAccepted({ kind: 'revocation', status }),
    ).not.toThrow();
  });

  it.each(
    FAILED_REVOCATION_STATUSES,
  )('rejects terminal revocation status %s before polling', (status) => {
    const assertStatus = () =>
      assertSessionSignerOperationAccepted({ kind: 'revocation', status });

    expect(assertStatus).toThrowError(TransactionFailedError);
    expect(assertStatus).toThrow(
      `Session-key revocation reached terminal status ${status}`,
    );
  });

  it('classifies every revocation status', () => {
    expect(
      new Set([...ACCEPTED_REVOCATION_STATUSES, ...FAILED_REVOCATION_STATUSES]),
    ).toEqual(new Set(Object.values(RelayerRevokeSessionSignerStatus)));
  });
});

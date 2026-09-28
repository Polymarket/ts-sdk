import { describe, expect, it } from 'vitest';
import {
  GatewayTradingCredentialsSchema,
  PredictionsIdentitySchema,
  SignerOwnershipChallengeSchema,
} from './identity';

// Pinned to identity-provider/tests/testdata/signer-ownership-vectors.json.
const challenge = {
  challengeId: '019904e4-5600-7000-8000-000000000001',
  expiresAt: new Date(1788206700 * 1000).toISOString(),
  typedData: {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'salt', type: 'bytes32' },
      ],
      SignerOwnership: [
        { name: 'signer', type: 'address' },
        { name: 'nonce', type: 'bytes32' },
        { name: 'issuedAt', type: 'uint256' },
        { name: 'expiresAt', type: 'uint256' },
      ],
    },
    primaryType: 'SignerOwnership',
    domain: {
      name: 'Polymarket',
      version: '1',
      chainId: 137,
      salt: '0xb1ef0dadff0674ef9060b4fb8eb44a810a3a4dffa14c8ef29d892ed5d797ae1e',
    },
    message: {
      signer: '0x1111111111111111111111111111111111111111',
      nonce:
        '0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      issuedAt: '1788206400',
      expiresAt: '1788206700',
    },
  },
};

describe('identity contracts', () => {
  it('preserves the pinned signer ownership payload', () => {
    const parsed = SignerOwnershipChallengeSchema.parse(challenge);
    expect(parsed.typedData).toEqual(challenge.typedData);
  });

  it('rejects extra signing material and reordered EIP-712 fields', () => {
    const valid = challenge;
    const additionalDomain = {
      ...valid,
      typedData: {
        ...valid.typedData,
        domain: {
          ...valid.typedData.domain,
          verifyingContract: valid.typedData.message.signer,
        },
      },
    };
    expect(
      SignerOwnershipChallengeSchema.safeParse(additionalDomain).success,
    ).toBe(false);
    const reversedFields = {
      ...valid,
      typedData: {
        ...valid.typedData,
        types: {
          ...valid.typedData.types,
          SignerOwnership: [...valid.typedData.types.SignerOwnership].reverse(),
        },
      },
    };
    expect(
      SignerOwnershipChallengeSchema.safeParse(reversedFields).success,
    ).toBe(false);
  });

  it('rejects wrapper expiry that differs from the signed expiry', () => {
    expect(
      SignerOwnershipChallengeSchema.safeParse({
        ...challenge,
        expiresAt: new Date(1788206701 * 1000).toISOString(),
      }).success,
    ).toBe(false);
  });

  it('rejects malformed timestamps without throwing outside schema validation', () => {
    expect(
      SignerOwnershipChallengeSchema.safeParse({
        ...challenge,
        typedData: {
          ...challenge.typedData,
          message: {
            ...challenge.typedData.message,
            expiresAt: 'not-a-timestamp',
          },
        },
      }).success,
    ).toBe(false);
  });

  it('requires wallet and signature type together while accepting signer-only identities', () => {
    const signer = challenge.typedData.message.signer;
    expect(PredictionsIdentitySchema.parse({ signer })).toEqual({ signer });
    expect(
      PredictionsIdentitySchema.parse({
        signer,
        wallet: signer,
        signatureType: 0,
      }),
    ).toEqual({ signer, wallet: signer, signatureType: 0 });
    expect(
      PredictionsIdentitySchema.safeParse({ signer, wallet: signer }).success,
    ).toBe(false);
    expect(
      PredictionsIdentitySchema.safeParse({ signer, signatureType: 0 }).success,
    ).toBe(false);
  });

  it('normalizes tagged trading credentials to the existing credential model', () => {
    const credentials = {
      key: '019904e4-5600-7000-8000-000000000002',
      secret: 'test-secret',
      passphrase: 'test-passphrase',
    };
    expect(
      GatewayTradingCredentialsSchema.parse({
        type: 'L2_CREDENTIALS',
        ...credentials,
      }),
    ).toEqual(credentials);
    expect(
      GatewayTradingCredentialsSchema.safeParse({
        type: 'OTHER',
        ...credentials,
      }).success,
    ).toBe(false);
  });
});

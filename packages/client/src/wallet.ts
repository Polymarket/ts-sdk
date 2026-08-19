import { SignatureType } from '@polymarket/bindings/clob';
import { WalletType } from '@polymarket/bindings/gamma';
import type { HexString } from '@polymarket/types';
import {
  type Erc1271Signature,
  type EvmAddress,
  expectErc1271Signature,
  expectEvmAddress,
  expectHexString,
  isSameEvmAddress,
  never,
  ZERO_ADDRESS,
} from '@polymarket/types';
import { AbiParameters, Bytes, ContractAddress, Hash } from 'ox';
import type { EnvironmentConfig, WalletDerivationConfig } from './environments';
import type { JsonRpcClient } from './rpc';
import { isJsonRpcContractRevert } from './rpc';

export type AccountIdentity = {
  /** Authenticated EOA that signs API authentication, orders, and wallet operations. */
  signer: EvmAddress;
  /** Active Polymarket account/funder wallet used for balances, positions, and execution. */
  wallet: EvmAddress;
  /** Wallet classification used for order signatures and transaction routing. */
  walletType: WalletType;
};

const BYTES32_ZERO =
  '0x0000000000000000000000000000000000000000000000000000000000000000' satisfies HexString;
const SESSION_SIGNER_MAGIC_BYTES =
  '0x6492649264926492649264926492649264926492649264926492649264926492' satisfies HexString;

/** @internal */
export function resolveAccountIdentity(
  environment: EnvironmentConfig,
  signer: EvmAddress,
  wallet: EvmAddress,
): AccountIdentity {
  const account = tryResolveAccountIdentity(environment, signer, wallet);

  if (account !== undefined) {
    return account;
  }

  never(
    `Wallet ${wallet} does not match the signer ${signer} or any supported deterministic wallet address.`,
  );
}

/** @internal */
export function tryResolveAccountIdentity(
  environment: EnvironmentConfig,
  signer: EvmAddress,
  wallet: EvmAddress,
): AccountIdentity | undefined {
  const walletType = classifyWalletType(environment, signer, wallet);

  if (walletType === undefined) {
    return undefined;
  }

  return { signer, wallet, walletType };
}

/** @internal */
export function toSignatureType(walletType: WalletType): SignatureType {
  switch (walletType) {
    case WalletType.EOA:
      return SignatureType.EOA;
    case WalletType.POLY_PROXY:
      return SignatureType.POLY_PROXY;
    case WalletType.GNOSIS_SAFE:
      return SignatureType.POLY_GNOSIS_SAFE;
    case WalletType.DEPOSIT_WALLET:
      return SignatureType.POLY_1271;
  }
}

/** @internal */
export type OrderIdentity = {
  maker: EvmAddress;
  signatureType: SignatureType;
  signer: EvmAddress;
};

/** @internal */
export function resolveOrderIdentity(account: AccountIdentity): OrderIdentity {
  const signatureType = toSignatureType(account.walletType);

  return {
    maker: account.wallet,
    signatureType,
    signer:
      signatureType === SignatureType.POLY_1271
        ? account.wallet
        : account.signer,
  };
}

/** @internal */
export function isDepositWalletOwner(
  environment: EnvironmentConfig,
  account: AccountIdentity,
): boolean {
  if (account.walletType !== WalletType.DEPOSIT_WALLET) {
    return false;
  }

  const config = environment.walletDerivation;

  return (
    isSameEvmAddress(
      account.wallet,
      deriveBeaconDepositWalletAddress(account.signer, config),
    ) ||
    isSameEvmAddress(
      account.wallet,
      deriveUupsDepositWalletAddress(account.signer, config),
    )
  );
}

/** @internal */
export function resolveDepositWalletSessionSigner(
  environment: EnvironmentConfig,
  account: AccountIdentity,
): EvmAddress | undefined {
  if (
    account.walletType !== WalletType.DEPOSIT_WALLET ||
    isDepositWalletOwner(environment, account)
  ) {
    return undefined;
  }

  return account.signer;
}

/** @internal */
export function wrapDepositWalletSessionSignerSignature(
  sessionSigner: EvmAddress,
  signature: HexString,
): Erc1271Signature {
  const signerId = expectHexString(
    `0x${sessionSigner.slice(2).padStart(64, '0')}`,
  );
  const payload = AbiParameters.encode(
    [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes' }],
    [signerId, BYTES32_ZERO, signature],
  );

  return expectErc1271Signature(
    `${payload}${SESSION_SIGNER_MAGIC_BYTES.slice(2)}`,
  );
}

const PROXY_BYTECODE_TEMPLATE =
  '3d3d606380380380913d393d73%s5af4602a57600080fd5b602d8060366000396000f3363d3d373d3d3d363d73%s5af43d82803e903d91602b57fd5bf352e831dd00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000';

function proxyWalletBytecodeHash(config: WalletDerivationConfig): HexString {
  const bytecode = PROXY_BYTECODE_TEMPLATE.replace(
    '%s',
    config.proxyFactory.slice(2).toLowerCase(),
  ).replace('%s', config.proxyImplementation.slice(2).toLowerCase());

  return expectHexString(Hash.keccak256(`0x${bytecode}`));
}

/** @internal */
export function deriveProxyWalletAddress(
  signer: EvmAddress,
  config: WalletDerivationConfig,
): EvmAddress {
  return expectEvmAddress(
    ContractAddress.fromCreate2({
      bytecodeHash: proxyWalletBytecodeHash(config),
      from: config.proxyFactory,
      salt: Hash.keccak256(AbiParameters.encodePacked(['address'], [signer])),
    }),
  );
}

/** @internal */
export function deriveSafeWalletAddress(
  signer: EvmAddress,
  config: WalletDerivationConfig,
): EvmAddress {
  return expectEvmAddress(
    ContractAddress.fromCreate2({
      bytecodeHash: config.safeInitCodeHash,
      from: config.safeFactory,
      salt: Hash.keccak256(
        AbiParameters.encode([{ name: 'address', type: 'address' }], [signer]),
      ),
    }),
  );
}

const ERC1967_CONST1 =
  '0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3';
const ERC1967_CONST2 =
  '0x5155f3363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076';
const ERC1967_PREFIX = 0x61003d3d8160233d3973n;

/** @internal */
export function deriveUupsDepositWalletAddress(
  signer: EvmAddress,
  config: WalletDerivationConfig,
): EvmAddress {
  const walletId = expectHexString(`0x${signer.slice(2).padStart(64, '0')}`);
  const args = AbiParameters.encode(
    [{ type: 'address' }, { type: 'bytes32' }],
    [config.depositWalletFactory, walletId],
  );

  return expectEvmAddress(
    ContractAddress.fromCreate2({
      bytecodeHash: depositWalletInitCodeHash(
        config.depositWalletImplementation,
        args,
      ),
      from: config.depositWalletFactory,
      salt: Hash.keccak256(args),
    }),
  );
}

const ERC1967_BEACON_CONST1 =
  '0xb3582b35133d50545afa5036515af43d6000803e604d573d6000fd5b3d6000f3';
const ERC1967_BEACON_CONST2 =
  '0x1b60e01b36527fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6c';
const ERC1967_BEACON_CONST3 =
  '0x60195155f3363d3d373d3d363d602036600436635c60da';
const ERC1967_BEACON_PREFIX = 0x6100523d8160233d3973n;
const FACTORY_BEACON_SELECTOR: HexString = '0x49493a4d';

/** @internal */
export function deriveBeaconDepositWalletAddress(
  signer: EvmAddress,
  config: WalletDerivationConfig,
): EvmAddress {
  const walletId = expectHexString(`0x${signer.slice(2).padStart(64, '0')}`);
  const args = AbiParameters.encode(
    [{ type: 'address' }, { type: 'bytes32' }],
    [config.depositWalletFactory, walletId],
  );

  return expectEvmAddress(
    ContractAddress.fromCreate2({
      bytecodeHash: depositWalletBeaconInitCodeHash(
        config.depositWalletBeacon,
        args,
      ),
      from: config.depositWalletFactory,
      salt: Hash.keccak256(args),
    }),
  );
}

function depositWalletInitCodeHash(
  implementation: EvmAddress,
  args: HexString,
): HexString {
  const argsByteLength = BigInt((args.length - 2) / 2);
  const prefix = ERC1967_PREFIX + (argsByteLength << 56n);

  return expectHexString(
    Hash.keccak256(
      Bytes.concat(
        Bytes.fromNumber(prefix, { size: 10 }),
        Bytes.fromHex(implementation),
        Bytes.fromHex('0x6009'),
        Bytes.fromHex(ERC1967_CONST2),
        Bytes.fromHex(ERC1967_CONST1),
        Bytes.fromHex(args),
      ),
      { as: 'Hex' },
    ),
  );
}

function depositWalletBeaconInitCodeHash(
  beacon: EvmAddress,
  args: HexString,
): HexString {
  const argsByteLength = BigInt((args.length - 2) / 2);
  const prefix = ERC1967_BEACON_PREFIX + (argsByteLength << 56n);

  return expectHexString(
    Hash.keccak256(
      Bytes.concat(
        Bytes.fromNumber(prefix, { size: 10 }),
        Bytes.fromHex(beacon),
        Bytes.fromHex(ERC1967_BEACON_CONST3),
        Bytes.fromHex(ERC1967_BEACON_CONST2),
        Bytes.fromHex(ERC1967_BEACON_CONST1),
        Bytes.fromHex(args),
      ),
      { as: 'Hex' },
    ),
  );
}

/** @internal */
export async function getDepositWalletFactoryBeacon(
  rpc: JsonRpcClient,
  factory: EvmAddress,
): Promise<EvmAddress> {
  try {
    const data = await rpc.ethCall({
      to: factory,
      data: FACTORY_BEACON_SELECTOR,
    });

    return decodeAddressReturnData(data);
  } catch (error) {
    if (isJsonRpcContractRevert(error)) {
      return ZERO_ADDRESS;
    }

    throw error;
  }
}

/** @internal */
export async function isBeaconDepositWalletFactory(
  rpc: JsonRpcClient,
  factory: EvmAddress,
): Promise<boolean> {
  const beacon = await getDepositWalletFactoryBeacon(rpc, factory);

  return !isSameEvmAddress(beacon, ZERO_ADDRESS);
}

/** @internal */
export async function deriveCurrentDepositWalletAddress(
  rpc: JsonRpcClient,
  signer: EvmAddress,
  config: WalletDerivationConfig,
): Promise<EvmAddress> {
  if (await isBeaconDepositWalletFactory(rpc, config.depositWalletFactory)) {
    return deriveBeaconDepositWalletAddress(signer, config);
  }

  return deriveUupsDepositWalletAddress(signer, config);
}

function decodeAddressReturnData(data: HexString): EvmAddress {
  if (data.length < 66) {
    return ZERO_ADDRESS;
  }

  return expectEvmAddress(`0x${data.slice(-40)}`);
}

function classifyWalletType(
  environment: EnvironmentConfig,
  signer: EvmAddress,
  wallet: EvmAddress,
): WalletType | undefined {
  if (isSameEvmAddress(wallet, signer)) {
    return WalletType.EOA;
  }

  const config = environment.walletDerivation;

  if (
    isSameEvmAddress(wallet, deriveBeaconDepositWalletAddress(signer, config))
  ) {
    return WalletType.DEPOSIT_WALLET;
  }

  if (
    isSameEvmAddress(wallet, deriveUupsDepositWalletAddress(signer, config))
  ) {
    return WalletType.DEPOSIT_WALLET;
  }

  if (isSameEvmAddress(wallet, deriveSafeWalletAddress(signer, config))) {
    return WalletType.GNOSIS_SAFE;
  }

  if (isSameEvmAddress(wallet, deriveProxyWalletAddress(signer, config))) {
    return WalletType.POLY_PROXY;
  }

  return undefined;
}

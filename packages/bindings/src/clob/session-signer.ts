import { z } from 'zod';
import { type EvmAddress, EvmAddressSchema } from '../shared';

export type ActiveSessionSigner = {
  address: EvmAddress;
  scopes: string[];
  validUntil: number;
};

export const ActiveSessionSignerSchema = z
  .object({
    address: EvmAddressSchema,
    scopes: z.array(z.string().min(1)).min(1),
    valid_until: z.number().int().nonnegative(),
  })
  .transform(({ valid_until, ...rest }) => ({
    ...rest,
    validUntil: valid_until,
  })) satisfies z.ZodType<ActiveSessionSigner>;

export type ActiveSessionSignersResponse = {
  signers: ActiveSessionSigner[];
  wallet: EvmAddress;
};

export const ActiveSessionSignersResponseSchema = z.object({
  signers: z.array(ActiveSessionSignerSchema),
  wallet: EvmAddressSchema,
}) satisfies z.ZodType<ActiveSessionSignersResponse>;

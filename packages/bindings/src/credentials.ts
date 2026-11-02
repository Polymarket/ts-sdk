import { z } from 'zod';

export const BearerCredentialsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});
export type BearerCredentials = z.infer<typeof BearerCredentialsSchema>;

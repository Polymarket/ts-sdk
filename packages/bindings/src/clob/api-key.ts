import { z } from 'zod';
import {
  ApiKeySchema,
  EpochMillisecondsToIsoDateTimeStringSchema,
} from '../shared';

export const ApiKeyCredsSchema = z
  .object({
    apiKey: ApiKeySchema,
    secret: z.string(),
    passphrase: z.string(),
  })
  .transform((creds) => ({
    key: creds.apiKey,
    passphrase: creds.passphrase,
    secret: creds.secret,
  }));

export type ApiKeyCreds = z.infer<typeof ApiKeyCredsSchema>;

export const ApiKeysResponseSchema = z.object({
  apiKeys: z.array(ApiKeySchema),
});

export type ApiKeysResponse = z.infer<typeof ApiKeysResponseSchema>;

export const BuilderApiKeyCredsSchema = z.object({
  key: ApiKeySchema,
  secret: z.string(),
  passphrase: z.string(),
});

export type BuilderApiKeyCreds = z.infer<typeof BuilderApiKeyCredsSchema>;

export const BuilderApiKeySchema = z.object({
  key: ApiKeySchema,
  createdAt: EpochMillisecondsToIsoDateTimeStringSchema.optional(),
  revokedAt: EpochMillisecondsToIsoDateTimeStringSchema.nullable().optional(),
});

export type BuilderApiKey = z.infer<typeof BuilderApiKeySchema>;

export const BuilderApiKeysResponseSchema = z
  .array(
    z.union([ApiKeySchema.transform((key) => ({ key })), BuilderApiKeySchema]),
  )
  .transform((apiKeys) =>
    apiKeys.map((apiKey) => BuilderApiKeySchema.parse(apiKey)),
  );

export type BuilderApiKeysResponse = z.infer<
  typeof BuilderApiKeysResponseSchema
>;

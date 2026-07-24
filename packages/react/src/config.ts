import type {
  ApiKeyAuthorization,
  EnvironmentConfig,
} from '@polymarket/client';
import { production } from '@polymarket/client';

export type CreateConfigOptions = {
  /**
   * The environment configuration used by the SDK.
   *
   * @defaultValue `production`
   */
  environment?: EnvironmentConfig;

  /**
   * Optional request authorization applied when needed, such as a browser-safe
   * builder key created with `remoteBuilderSigning`.
   */
  apiKey?: ApiKeyAuthorization;
};

/**
 * App-level, connection-independent Polymarket SDK configuration.
 *
 * @remarks
 * Create it with {@link createConfig} at module scope and pass it to
 * `PolymarketProvider`. Session state does not belong here; it depends on
 * which account connects.
 */
export type PolymarketConfig = {
  environment: EnvironmentConfig;
  apiKey: ApiKeyAuthorization | undefined;
};

/**
 * Creates a {@link PolymarketConfig} for `PolymarketProvider`.
 *
 * @remarks
 * Call it at module scope so the config identity stays stable across renders.
 *
 * @example
 * ```ts
 * const config = createConfig();
 *
 * const gaslessConfig = createConfig({
 *   apiKey: remoteBuilderSigning({ url: '/api/builder-sign' }),
 * });
 * ```
 */
export function createConfig(
  options: CreateConfigOptions = {},
): PolymarketConfig {
  return {
    environment: options.environment ?? production,
    apiKey: options.apiKey,
  };
}

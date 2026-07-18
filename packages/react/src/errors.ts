/**
 * Thrown when a Polymarket hook is used outside of a `PolymarketProvider`.
 */
export class MissingProviderError extends Error {
  override name = 'MissingProviderError' as const;

  constructor(hookName: string) {
    super(`\`${hookName}\` must be used within a \`PolymarketProvider\`.`);
  }
}

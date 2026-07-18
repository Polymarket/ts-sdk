/**
 * Sentinel passed to a read hook instead of its request to pause fetching.
 *
 * @remarks
 * Use it when the request is not ready yet, such as inputs that depend on
 * user selection or a connected wallet. A paused hook performs no fetching
 * and reports `isPaused: true` until a real request is provided.
 *
 * @example
 * ```ts
 * const { data: book, isPaused } = useOrderBook(tokenId ? { tokenId } : skip);
 * ```
 */
export const skip = Symbol.for('polymarket.skip');

export type Skip = typeof skip;

/**
 * Computes a stable identity key for a request object.
 *
 * @remarks
 * Read hooks receive fresh request object literals on every render, so
 * effects key off this serialized form instead of object identity. Object
 * keys are sorted and `undefined` members are dropped so equivalent requests
 * produce the same key.
 *
 * @internal
 */
export function createRequestKey(request: unknown): string {
  return stableStringify(request);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, member]) => member !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(
        ([key, member]) => `${JSON.stringify(key)}:${stableStringify(member)}`,
      );

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value) ?? 'undefined';
}

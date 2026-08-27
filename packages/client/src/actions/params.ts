import { z } from 'zod';

export type SearchParamPrimitive = boolean | number | string;

export type SearchParamValue =
  | SearchParamPrimitive
  | readonly SearchParamPrimitive[];

export type SearchParamsInput = Record<string, SearchParamValue | undefined>;

export type SearchParamMappings<TParams extends SearchParamsInput> = {
  [TKey in keyof TParams]: string;
};

type SnakeCaseSearchParamMappings = {
  format: 'snake_case';
  exceptions: Record<string, string | undefined>;
};

export function toSearchParams<TParams extends SearchParamsInput>(
  params: TParams,
  mappings: SearchParamMappings<TParams> | SnakeCaseSearchParamMappings,
): URLSearchParams {
  if (isSnakeCaseSearchParamMappings(mappings)) {
    return toSnakeCaseSearchParams(params, mappings.exceptions);
  }

  const searchParams = new URLSearchParams();

  for (const [paramKey, searchParamKey] of Object.entries(mappings) as Array<
    readonly [keyof TParams, string]
  >) {
    const value = params[paramKey];

    if (value === undefined) {
      continue;
    }

    if (isSearchParamArray(value)) {
      for (const item of value) {
        searchParams.append(searchParamKey, toSearchParamValue(item));
      }

      continue;
    }

    searchParams.append(searchParamKey, toSearchParamValue(value));
  }

  return searchParams;
}

export function snakeCase<TParams extends SearchParamsInput>(
  exceptions: Partial<SearchParamMappings<TParams>> = {},
): SnakeCaseSearchParamMappings {
  return {
    format: 'snake_case',
    exceptions,
  };
}

/**
 * Legacy data endpoints use camelCase query keys and comma-separated arrays.
 * Dies with the last legacy data action; new data actions use
 * {@link toDataSearchParams}.
 */
export function toLegacyDataSearchParams<TParams extends SearchParamsInput>(
  params: TParams,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      searchParams.append(key, value.map(toSearchParamValue).join(','));
      continue;
    }

    searchParams.append(key, toSearchParamValue(value as SearchParamPrimitive));
  }

  return searchParams;
}

/**
 * An instant accepted as epoch seconds or a `Date` (floored to seconds) —
 * the wire's time vocabulary.
 */
export const EpochSecondsLikeSchema = z
  .union([z.number().int().min(0), z.date()])
  .transform((value) =>
    value instanceof Date ? Math.floor(value.getTime() / 1000) : value,
  );

/**
 * The time window of a history request, normalized to the wire's epoch-second
 * `start`/`end` bounds.
 *
 * `'full'` requests the complete history. An omitted window serves the
 * service's default range, and an omitted bound leaves that side open.
 * Bounds accept epoch seconds or `Date` values.
 */
export const TimeWindowSchema = z
  .union([
    z.literal('full'),
    z
      .object({
        start: EpochSecondsLikeSchema.optional(),
        end: EpochSecondsLikeSchema.optional(),
      })
      // A zero bound means unbounded on the wire, mirroring the service.
      .refine(
        (value) => !value.end || value.end >= (value.start ?? 0),
        'end must not precede start',
      ),
  ])
  // `start=1` is the wire's full-history request.
  .transform((value) => (value === 'full' ? { start: 1 } : value));

export type TimeWindow = z.input<typeof TimeWindowSchema>;

/**
 * A list of ids deduplicated case-insensitively (first-seen casing kept) and
 * capped at `max` DISTINCT entries — mirroring the service's dedupe-then-count
 * selector semantics so a duplicate-heavy list is neither rejected early nor
 * sent redundantly.
 */
export function distinctIdList<TId extends string>(
  item: z.ZodType<TId, string>,
  max: number,
) {
  return z
    .array(item)
    .min(1)
    .transform((ids) => [
      ...new Map(ids.map((id) => [id.toLowerCase(), id])).values(),
    ])
    .refine((ids) => ids.length <= max, `At most ${max} distinct ids`);
}

/**
 * Data endpoints use snake_case query keys and comma-separated arrays.
 */
export function toDataSearchParams<TParams extends SearchParamsInput>(
  params: TParams,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    const searchParamKey = toSnakeCase(key);

    if (isSearchParamArray(value)) {
      searchParams.append(
        searchParamKey,
        value.map(toSearchParamValue).join(','),
      );
      continue;
    }

    searchParams.append(searchParamKey, toSearchParamValue(value));
  }

  return searchParams;
}

function isSnakeCaseSearchParamMappings(
  mappings:
    | SearchParamMappings<SearchParamsInput>
    | SnakeCaseSearchParamMappings,
): mappings is SnakeCaseSearchParamMappings {
  return 'format' in mappings;
}

function toSnakeCaseSearchParams<TParams extends SearchParamsInput>(
  params: TParams,
  exceptions: Record<string, string | undefined>,
): URLSearchParams {
  const searchParams = new URLSearchParams();

  for (const [paramKey, value] of Object.entries(params) as Array<
    readonly [string, SearchParamValue]
  >) {
    if (value === undefined) {
      continue;
    }

    const searchParamKey = exceptions[paramKey] ?? toSnakeCase(paramKey);

    if (isSearchParamArray(value)) {
      for (const item of value) {
        searchParams.append(searchParamKey, toSearchParamValue(item));
      }

      continue;
    }

    searchParams.append(searchParamKey, toSearchParamValue(value));
  }

  return searchParams;
}

function isSearchParamArray(
  value: SearchParamValue,
): value is readonly SearchParamPrimitive[] {
  return Array.isArray(value);
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

export function toSearchParamValue(value: SearchParamPrimitive): string {
  return String(value);
}

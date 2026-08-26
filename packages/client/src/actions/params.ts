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
 * Data endpoints use camelCase query keys and comma-separated arrays.
 */
export function toDataSearchParams<TParams extends SearchParamsInput>(
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
 * Data v2 endpoints use snake_case query keys and comma-separated arrays.
 */
export function toDataV2SearchParams<TParams extends SearchParamsInput>(
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

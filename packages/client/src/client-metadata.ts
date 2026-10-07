import { version as sourcePackageVersion } from '../package.json';

declare const __POLYMARKET_CLIENT_VERSION__: string;

const packageVersion =
  typeof __POLYMARKET_CLIENT_VERSION__ === 'string'
    ? __POLYMARKET_CLIENT_VERSION__
    : sourcePackageVersion;

type RuntimeGlobals = {
  Bun?: { version?: unknown };
  Deno?: { version?: { deno?: unknown } };
  process?: { versions?: { node?: unknown }; release?: { name?: unknown } };
  navigator?: { userAgent?: unknown };
  window?: unknown;
  self?: unknown;
  importScripts?: unknown;
};

/**
 * Package/runtime diagnostics, sampled once when constructing a client.
 * Runtime names are bun, deno, nodejs, edge, chrome, firefox, safari, browser,
 * worker, or unknown. Browser versions are best-effort user-agent values.
 */
export function createClientMetadata(): string {
  return `@polymarket/client@${packageVersion}:${detectRuntime()}`;
}

function detectRuntime(): string {
  try {
    const runtime = globalThis as RuntimeGlobals;
    if (runtime.Bun !== undefined) {
      return `bun@${runtimeVersion(runtime.Bun.version)}`;
    }
    if (runtime.Deno !== undefined) {
      return `deno@${runtimeVersion(runtime.Deno.version?.deno)}`;
    }
    if (
      runtime.process?.versions?.node !== undefined ||
      runtime.process?.release?.name === 'node'
    ) {
      return `nodejs@${runtimeVersion(runtime.process?.versions?.node)}`;
    }

    const userAgent = runtime.navigator?.userAgent;
    if (typeof userAgent === 'string') {
      const browsers: Array<[string, RegExp]> = [
        ['edge', /\bEdg(?:e|A|iOS)?(?:\/([\d.]+))?/],
        ['chrome', /\b(?:Chrome|Chromium|CriOS)(?:\/([\d.]+))?/],
        ['firefox', /\b(?:Firefox|FxiOS)(?:\/([\d.]+))?/],
      ];
      for (const [name, pattern] of browsers) {
        const match = pattern.exec(userAgent);
        if (match !== null) return `${name}@${runtimeVersion(match[1])}`;
      }
      if (/\bSafari\//.test(userAgent)) {
        return `safari@${runtimeVersion(/\bVersion\/([\d.]+)/.exec(userAgent)?.[1])}`;
      }
    }

    if (runtime.window !== undefined) return 'browser@unknown';
    if (
      runtime.self !== undefined ||
      typeof runtime.importScripts === 'function'
    ) {
      return 'worker@unknown';
    }
    if (runtime.navigator !== undefined) return 'browser@unknown';
  } catch {
    // Host globals can have restricted getters. Diagnostics must never prevent
    // client creation or require additional runtime permissions.
  }
  return 'unknown@unknown';
}

function runtimeVersion(version: unknown): string {
  return typeof version === 'string' &&
    /^[0-9][0-9A-Za-z.+_-]{0,63}$/.test(version)
    ? version
    : 'unknown';
}

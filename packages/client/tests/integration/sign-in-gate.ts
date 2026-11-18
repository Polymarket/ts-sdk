/**
 * Test-only sign-in gate for live integration tests.
 *
 * After a login, the API rejects a new sign-in challenge for the same signer
 * and nonce with `409 challenge_consumed` for a short window, whatever the
 * wallet. Live tests reuse one test signer across files, so back-to-back
 * sign-ins would fail. This wraps the global `fetch` to space those challenges
 * out, and resends a challenge that is still rejected. The SDK itself never
 * retries sign-in.
 *
 * Installed through `setupFiles`, below any `fetch` spy or `msw` interceptor a
 * test adds, so those still observe exactly one challenge per sign-in.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** Time to wait after a login before requesting another challenge for the same signer and nonce. */
export const SIGN_IN_COOLDOWN_MS = 2_000;
/** Delay before resending a challenge that is still rejected, unless the API sends `Retry-After`. */
const RETRY_DELAY_MS = 500;
/** How long to keep resending a rejected challenge before letting the error through. */
const MAX_RETRY_WINDOW_MS = 10_000;
// Module state resets per test file, so login times are shared through a file.
const SIGN_INS_FILE = join(tmpdir(), 'polymarket-ts-sdk-live-sign-ins.json');
const INSTALLED = Symbol.for('polymarket.tests.signInGate');

type SignInTimes = Record<string, number>;

const challengeKeys = new Map<string, string>();

if (!(INSTALLED in globalThis.fetch)) {
  const gated = gateSignIns(globalThis.fetch);
  Object.defineProperty(gated, INSTALLED, { value: true });
  globalThis.fetch = gated;
}

function gateSignIns(send: typeof fetch): typeof fetch {
  return async function gatedFetch(input, init) {
    const url = input instanceof Request ? input.url : String(input);
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    if (method !== 'POST') return send(input, init);

    const { pathname } = new URL(url);
    if (pathname.endsWith('/v1/auth/challenge'))
      return sendChallenge(send, new Request(input, init));
    if (pathname.endsWith('/v1/auth/login'))
      return sendLogin(send, new Request(input, init));
    return send(input, init);
  };
}

async function sendChallenge(
  send: typeof fetch,
  request: Request,
): Promise<Response> {
  const body = await readJson(request);
  const signer = typeof body?.signer === 'string' ? body.signer : undefined;
  if (signer === undefined) return send(request);
  // An omitted nonce is nonce 0.
  const nonce = typeof body?.nonce === 'number' ? body.nonce : 0;
  const key = `${signer.toLowerCase()}:${nonce}`;

  await delay(remainingCooldown(key));
  const deadline = Date.now() + MAX_RETRY_WINDOW_MS;
  for (;;) {
    const response = await send(request.clone());
    if (response.ok) {
      const challenge = await readJson(response);
      const id = challenge?.challenge_id ?? challenge?.challengeId;
      if (typeof id === 'string') challengeKeys.set(id, key);
      return response;
    }
    const wait = retryAfter(response) ?? RETRY_DELAY_MS;
    if (
      response.status !== 409 ||
      (await readJson(response))?.code !== 'challenge_consumed' ||
      Date.now() + wait > deadline
    )
      return response;
    await delay(wait);
  }
}

async function sendLogin(
  send: typeof fetch,
  request: Request,
): Promise<Response> {
  const body = await readJson(request);
  const ownership = body?.ownership as Record<string, unknown> | undefined;
  const challengeId = ownership?.challenge_id;
  const response = await send(request);
  const key =
    typeof challengeId === 'string'
      ? challengeKeys.get(challengeId)
      : undefined;
  if (response.ok && key !== undefined) recordSignIn(key);
  return response;
}

function remainingCooldown(key: string): number {
  const last = readSignIns()[key];
  return last === undefined
    ? 0
    : Math.max(0, last + SIGN_IN_COOLDOWN_MS - Date.now());
}

function readSignIns(): SignInTimes {
  try {
    return JSON.parse(readFileSync(SIGN_INS_FILE, 'utf8')) as SignInTimes;
  } catch {
    return {};
  }
}

function recordSignIn(key: string): void {
  const now = Date.now();
  // Keep only entries that can still delay a sign-in.
  const times = Object.fromEntries(
    Object.entries(readSignIns()).filter(
      ([, time]) => now - time < SIGN_IN_COOLDOWN_MS,
    ),
  );
  times[key] = now;
  // Write a private file, then rename it over the shared one, so a crashed run never leaves it half written.
  const pending = `${SIGN_INS_FILE}.${process.pid}.${now}`;
  writeFileSync(pending, JSON.stringify(times));
  renameSync(pending, SIGN_INS_FILE);
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

async function readJson(
  message: Request | Response,
): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await message.clone().json();
    return value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

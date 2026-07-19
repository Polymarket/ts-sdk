# React SDK Direction (`@polymarket/react`)

`@polymarket/react` is the frontend-oriented SDK surface built on top of `@polymarket/client`. It provides React hooks over the same actions, workflows, pagination, and auth model, without introducing a parallel domain model.

## Design Principles

- Hooks are thin bindings over `@polymarket/client` standalone actions. The client package owns all domain logic; the React package owns React state, lifecycle, and wallet-in-the-loop UX.
- Each hook family (plain reads, paginated reads, writes, subscriptions) has its own narrow primitive, composed from small shared building blocks. No single internal hook understands every mode.
- Maximize tree-shaking: the provider holds a base client (no bound action methods), and each hook imports only the standalone action it needs.
- Wallet libraries are optional peer dependencies behind dedicated entry points (`@polymarket/react/viem` first), mirroring the client package convention. Core code paths never import a wallet library.
- Interactive wallet operations build on the client's `prepare*` async-generator workflows. Integrations get a single interception point over every wallet-facing step, so they can add confirmation UI, tweak app state, or cancel mid-flight.
- v1 read hooks have no query cache. Hooks return exactly what the underlying action returns, plus minimal request state and an explicit `refetch`. A caching/invalidation layer (e.g. TanStack Query) can be added later without breaking the hook result shape.
- Hook naming follows the client action it wraps: `useMarket` wraps `fetchMarket`, `useMarkets` wraps `listMarkets`. The `list*`/`fetch*` distinction surfaces as paginated vs plain read hooks.

## Setup

The provider owns client construction and the public/secure auth lifecycle. It takes a `config` prop created with a bespoke `createConfig` (wagmi-style), defined at module scope so its identity is stable, plus an optional `initialSession` for synchronous session restore (see Authentication and Sessions):

```tsx
import { createConfig, PolymarketProvider } from '@polymarket/react';

const config = createConfig(); // defaults to production

function Root() {
  return (
    <PolymarketProvider config={config}>
      <App />
    </PolymarketProvider>
  );
}
```

Configured, for an app doing gasless transactions with a builder key signed by its backend:

```tsx
const config = createConfig({
  environment: production,
  apiKey: remoteBuilderSigning({ url: '/api/builder-sign' }),
});
```

- Config is app-level, connection-independent setup only, mirroring the client package's `PublicClientOptions`: `environment` (defaults to `production`) and `apiKey` (the client's `ApiKeyAuthorization` implementations; `remoteBuilderSigning` is the browser-safe builder-key option).
- Session state does not belong in config; it depends on which account connects. Existing sessions flow through `initialSession` at mount; fresh sessions through `authenticate({ wallet?, nonce? })`.
- `createConfig` applies defaults and validation once, and gives inline-literal-proof identity so the provider never has to diff or rebuild the client on re-render.
- Config deliberately does not accept a `signer`. Wallet interaction always flows through workflow handlers; making a browser-side signer easy to configure statically would undermine that invariant.

Together, `createConfig(options)` (app setup), `authenticate(options)` (fresh session), and `Session` (existing session) cover the same fields as the client package's `createSecureClient(options)`, split at the app/session boundary, with `signer` replaced by the workflow handler.

Internally the provider constructs a base public client (`BasePublicClient`, no decorators) so unused actions are never bundled.

## Hook Result Shape

All read hooks share one result contract:

```ts
type ReadResult<T> = {
  data: T | undefined;
  error: SomeActionError | undefined;
  isLoading: boolean; // first fetch only
  refetch: () => Promise<void>;
};
```

- Errors are the action's public `...Error` union, not a generic `Error`.
- Param changes refetch automatically; in-flight responses for stale params are discarded.
- No cache, no dedupe across components in v1. After a successful write, related reads are refreshed manually via `refetch()`. If this proves painful in real apps, that is the signal to introduce a query layer.
- The field naming (`data`/`error`/`isLoading`) is deliberately TanStack-compatible so a cache layer can be adopted later without a breaking change.

## Read Hooks

Thin wrappers over `fetch*` actions:

```tsx
function MarketHeader({ slug }: { slug: string }) {
  const { data: market, error, isLoading } = useMarket({ slug });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorNotice error={error} />;
  return <h1>{market.question}</h1>;
}
```

Internally, plain read hooks are one line over a small primitive that takes the action function itself:

```ts
export function useMarket(request: FetchMarketRequest): ReadResult<Market> {
  return usePublicClientAction(fetchMarket, request);
}
```

`usePublicClientAction(action, request)` resolves the client from context, runs `action(client, request)`, and manages state/races/unmount for the single-request case. Because the action is a parameter, each hook bundles only its own action.

`usePublicClientAction` is deliberately narrow: it only understands one-shot reads. Other hook families (paginated reads, write workflows, subscriptions) are built from their own primitives that compose smaller pieces (client resolution, request-state tracking, race guarding) rather than growing one internal hook that understands every mode. Favor composition over a single golden path that does everything.

The action primitives are internal for now — the public surface is the dedicated hooks. The single escape hatch is `usePolymarketClient()`, which returns the raw client for direct standalone-action usage (imperative fetches in event handlers, actions without a dedicated hook). Exporting the primitives is a deliberate non-goal until real coverage gaps demand it; consumers asking for missing hooks is the signal we want.

### Conditional / dependent reads

Reads support skipping until inputs are ready, with type narrowing:

```tsx
const { data: book, isPaused } = useOrderBook(tokenId ? { tokenId } : skip);
```

Exact `skip` mechanics (sentinel vs `enabled` option) to be settled during implementation; the requirement is type-safe pausing for wallet-dependent and dependent-data cases.

## Paginated Read Hooks

`list*` actions return `Paginated<T>`; paginated hooks are their own family with their own primitive (`usePublicPaginatedAction`), not a mode of `usePublicClientAction`. The primitive maps `Page<T>` continuation onto infinite-scroll state:

```tsx
function MarketList() {
  const { data: markets, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMarkets({ active: true });

  return (
    <>
      {markets?.map((market) => <MarketRow key={market.id} market={market} />)}
      {hasNextPage && (
        <button onClick={fetchNextPage} disabled={isFetchingNextPage}>
          Load more
        </button>
      )}
    </>
  );
}
```

- `data` is the flattened accumulated items (`T[]`), the shape list UIs actually render. Page boundaries and cursors stay internal.
- `refetch()` resets to the first page.
- Internally: `firstPage()` for the initial load, `from(nextCursor).firstPage()` for continuation, cursors are never exposed.
- `usePublicPaginatedAction(action, request)` shares low-level building blocks with `usePublicClientAction` (client resolution, race guarding) through composition, but owns pagination state itself. Like the plain primitive, it is internal for now.

## Wallet Integration (`@polymarket/react/viem`)

Wallet libraries plug in at the client package's `Signer`/workflow boundary. The first entry point targets viem's `WalletClient`, which wagmi, Privy, Dynamic, and friends can all produce:

```tsx
import { useWorkflowHandler } from '@polymarket/react/viem';
import { useWalletClient } from 'wagmi';

function TradePanel() {
  const { data: walletClient } = useWalletClient();
  const handler = useWorkflowHandler(walletClient);
  // pass `handler` to auth and write hooks
}
```

`useWorkflowHandler` returns a `WorkflowHandler`: a single function that answers the tagged requests yielded by client workflows.

```ts
type WorkflowHandler = (
  request: WorkflowRequest, // { kind: 'signOrder', payload } | { kind: 'signGaslessTypedData', payload } | ...
  controls: { cancel: (reason?: string) => WorkflowCancelled },
) => Promise<WorkflowResponse>; // EvmAddress | EvmSignature | WorkflowCancelled
```

### Signature-only vocabulary (no EOA accounts)

The React SDK supports Deposit Wallet and legacy Safe/Proxy accounts only. EOA trading is allowlist-gated (pre-cutoff traders and select market makers) and is not a web-application scenario, so it is out of scope. This is enforced with a runtime invariant: `authenticate()` rejects EOA account configurations.

Excluding EOAs is what keeps the handler vocabulary small: every `send*Transaction` workflow request in the client is EOA-only, while Deposit/Safe/Proxy flows execute through the gasless relayer. The React `WorkflowRequest` union is therefore signature-only:

```ts
type WorkflowRequest =
  | RequestAddressRequest      // 'requestAddress'
  | SignAuthMessageRequest     // 'signAuthMessage'
  | SignOrderRequest           // 'signOrder'
  | SignGaslessTypedDataRequest // 'signGaslessTypedData'
  | SignGaslessMessageRequest;  // 'signGaslessMessage'
```

Consequences:

- Responses are only `EvmAddress | EvmSignature`. No `TransactionHandle`, no transaction sending, no gas.
- Wallet adapters only need `getAddress`, `signTypedData`, and `signMessage`, so signature-capable embedded wallets work without transaction support.
- Consumers switching on `request.kind` see a short, comprehensible union instead of a dozen EOA-only transaction kinds they can never receive.

Each hook further narrows the union to the kinds its workflow can actually yield (order hooks see only `signOrder`, auth sees only `requestAddress | signAuthMessage`), and the broad handler from `useWorkflowHandler` is assignable to any of them.

Fine control is wrapping the handler. This is the mechanism for integrations that need to confirm, decorate UI state, or bail out per step:

```tsx
const base = useWorkflowHandler(walletClient);

const handler: WorkflowHandler = async (request, { cancel }) => {
  if (request.kind === 'signOrder') {
    const confirmed = await showOrderConfirmationDialog();
    if (!confirmed) return cancel('User declined the order');
  }
  return base(request);
};
```

- Core hooks depend only on the `WorkflowHandler` type; they never import viem.
- Future entry points (`/ethers-v6`, `/privy`, ...) each export their own `useWorkflowHandler` equivalent, as optional peers. viem is the only entry point in the first iteration; the internal `Signer -> WorkflowHandler` bridge stays private, so wallet support arrives exclusively through dedicated adapters.
- The viem adapter reuses `@polymarket/client/viem` internals (signer wrapping, error translation) rather than reimplementing them.
- Reusing a client-package adapter is per-library, not a rule. `@polymarket/client/privy` wraps Privy server wallets (Node-only, `@privy-io/node`) and is the wrong integration for a browser app; a future `@polymarket/react/privy` targets Privy embedded wallets via the Privy React SDK instead and shares nothing with the client adapter. Note that Privy embedded wallets can expose a viem `WalletClient`, so the viem entry point may already cover Privy apps before a dedicated entry ships.

## Authentication and Sessions

The provider owns authentication state. The authenticated state is a first-class serializable `Session`; persistence stays app-owned:

```ts
type Session = {
  credentials: ApiKeyCreds;
  address: EvmAddress; // authenticated signer address
  wallet: EvmAddress;  // account/funder wallet
};
```

### Session is the state; clients are derived

The provider holds the base public client (derived from `config`) and `session: Session | undefined`. The secure client is not React state: it is a memoized derivation of `(config, session)`, constructed once per session because base clients are cheap and effectively stateless. `authenticate()` sets the session, `logout()` and 401-recovery clear it, restore is just initial session state — there is no public/secure client-swap lifecycle to sequence. Derivation is per session (memo), not per action call, so instance-level sharing such as websocket managers keeps working.

Every session flows through the same construction path: `authenticate()` runs the client's authentication workflow only to produce the `Session` (credentials plus account identity), then the memo derives the secure client from it — the same way a restored session is derived. Fresh, silently reused, and restored sessions are therefore guaranteed to produce identical clients.

### Synchronous restore, no logged-out flash

A stored session restores synchronously at mount via `initialSession` — no effect, no await, no flicker of logged-out UI:

```tsx
<PolymarketProvider config={config} initialSession={loadLastSession()}>
  <App />
</PolymarketProvider>
```

- With `initialSession`, the provider constructs the secure client immediately and `status` is `'authenticated'` on first render. Secure reads (L2 HMAC) work right away; no wallet connection is required until the user performs a wallet-interactive action.
- Restore is optimistic: the session is trusted without a validation round-trip, like a web session cookie. If the API rejects it (401: key revoked, logged out elsewhere), the provider transitions to `'unauthenticated'` and the app recovers by calling `authenticate()` again. Accepted trade-off: a revoked session can render authenticated UI for one round-trip before flipping.
- Wallet reconnection (a wagmi concern) stays async but only gates actions, never authenticated state. `session.address` is exposed so apps and wallet-interactive hooks can detect a connected-account mismatch explicitly.

```tsx
// app-owned persistence
const { session } = useAuthentication();
useEffect(() => {
  session ? saveSession(session) : clearSession();
}, [session]);
```

### Establishing a session

`authenticate()` is for the moments where no usable session exists:

1. First-ever connect: full workflow (`requestAddress`, `signAuthMessage` prompt) creating or deriving a key. The only flow that prompts a signature.
2. Recovery after invalidation: the API 401'd a restored session; establish a fresh one.
3. Signer switch: the connected wallet no longer matches `session.address`. Since the account wallet is bound to the signer, switching accounts means switching signers; the app re-authenticates for the new signer.

```tsx
function ConnectButton() {
  const handler = useWorkflowHandler(walletClient);
  const { authenticate, logout, status, session, error } = useAuthentication(handler);

  if (status === 'authenticated') {
    return <button onClick={logout}>Disconnect</button>;
  }

  return (
    <button
      disabled={status === 'authenticating'}
      onClick={() => authenticate()}
    >
      Connect to Polymarket
    </button>
  );
}
```

- The handler is a hook argument, consistent with write hooks. `authenticate(options?)` drives the client's authentication workflow through the same `WorkflowHandler` mechanism. Options are `wallet` and `nonce`, mirroring the corresponding `SecureClientOptions` fields.
- There is deliberately no credentials-promotion option and no runtime restore method. Session material enters exactly one way: as a full `Session` via `initialSession` at mount.
- At page load the connected address is unknown (wallet reconnection is async), so apps persist and load the last active session as a whole — the `Session` embeds its own `address`; nothing about restore depends on the wallet.
- Apps whose session material arrives asynchronously (e.g. fetched from an app backend) gate provider rendering on it.
- Mid-session signer switch is the one place an address-keyed lookup makes sense, because the new address is known there (it arrived from the wallet library's state change). Apps keeping per-address sessions can remount for a prompt-free switch (`<PolymarketProvider key={address} initialSession={loadSession(address)}>`); otherwise `logout()` + `authenticate()`.
- Apps migrating from bare stored `ApiKeyCreds` construct the `Session` themselves (they know the address and wallet they stored credentials for); otherwise one fresh `authenticate()` prompt.
- `authenticate()` enforces the non-EOA invariant: resolving to an EOA account configuration fails with a clear error. This guarantee is what makes the signature-only `WorkflowHandler` type sound.
- The handler argument is optional for status-only consumers: `useAuthentication()` with no argument returns `status`, `session`, and `logout`, with `authenticate` excluded from the result type. Handler-taking hooks assume a non-nullable `WorkflowHandler`.
- Wallet-availability uncertainty is owned by the wallet entry point, not core: `useWorkflowHandler` always returns a stable handler even while wagmi's `useWalletClient` is still `undefined`, and invoking it without a connected wallet fails with a wallet-flavored error (`WalletClientUnavailableError`) that propagates through the driving operation, e.g. `authenticate()`. The code closest to the wallet ecosystem names the failure.
- `logout()` calls `endAuthentication()` (revokes the key), clears the session, and swaps back to the public client. A softer local-only disconnect option is an open question.
- Secure-only read hooks (`useOpenOrders`, `usePositions`, `useBalances`) return the paused state until `status === 'authenticated'`, then fetch automatically.

```tsx
const { data: orders, isPaused } = useOpenOrders(); // paused while unauthenticated
```

## Write Operation Hooks

Write hooks are imperative: an execute function plus progress state. They drive the client's `prepare*` workflows step by step through the provided handler, surfacing each step for UI feedback:

```tsx
function BuyButton({ tokenId }: { tokenId: TokenId }) {
  const handler = useWorkflowHandler(walletClient);
  const [placeOrder, { status, step, data, error, reset }] =
    usePlaceMarketOrder(handler);

  return (
    <>
      <button
        disabled={status === 'pending'}
        onClick={() => placeOrder({ tokenId, side: Side.BUY, amount: 50 })}
      >
        {status === 'pending' ? stepLabel(step) : 'Buy'}
      </button>
      {error && <ErrorNotice error={error} />}
      {data && <OrderConfirmation order={data} />}
    </>
  );
}
```

- `status`: `'idle' | 'pending' | 'success' | 'error'`.
- `step`: the current workflow request kind while pending (`'signOrder'`, `'signGaslessTypedData'`, ...), so UIs can render progress without intercepting anything.
- `error` is the action's public error union plus `CancelledSigningError` when the handler cancels or the wallet rejects, and `UnauthenticatedError` when executed while unauthenticated.
- The execute function returns a promise of the result for event-handler composition; errors also land in state so purely declarative UIs work without try/catch.
- Cancellation mid-workflow (via `controls.cancel`) aborts cleanly: the generator is closed and state settles as a cancelled error, not a success.
- **No automatic allowance recovery.** The client SDK's one-shot placement recovers from allowance rejections by approving and re-posting; the React hooks deliberately do not, because that hides a surprise wallet prompt inside another operation. The rejection surfaces as the typed `InsufficientAllowanceError` and the integrator decides — typically routing the user through `useSetupTradingApprovals`, which is also the account-readiness step for fresh accounts (and requires a gasless-capable `apiKey` in config).

The same pattern covers the whole write surface: `usePlaceLimitOrder`, `useCancelOrder` (no wallet steps, but same imperative shape), `useSetupTradingApprovals` (gasless approval signatures through the same handler), transfers, and split/merge/redeem.

## Realtime Subscription Hooks (later phase)

Websocket subscriptions (async iterables in the client) map onto effect-based hooks:

```tsx
const { data: book, status } = useLiveOrderBook({ tokenId });
```

- Subscribe on mount / params change, dispose on unmount, share the client's websocket managers via the provider.
- `status`: `'connecting' | 'live' | 'reconnecting' | 'closed'`.
- Design detail (snapshot semantics, buffering, user-channel auth) is deferred to the realtime phase.

## Package Layout

- `packages/react`, published as `@polymarket/react`, ESM-only, `sideEffects: false`, same tsup/tsconfig.build conventions as `packages/client`.
- Entry points: `.` (provider, hooks, core types) and `./viem` (wallet adapter). Future wallet entry points follow the client package pattern: new source file + package export + optional peer + root tsconfig path alias.
- Peer dependencies: `react` (>=18), `@polymarket/client` (regular peer so apps share one client install and can use actions directly), `viem` optional via `peerDependenciesMeta`.
- Browser-first (`platform: neutral` build). No Node-only entry points.

## Prerequisites in `@polymarket/client` (landed)

- `createBaseClient(options)` — base client without bound action methods, for standalone-action consumers.
- `createBaseSecureClient(options)` — authenticated client from `{ address, wallet, credentials, signer }` without running an authentication workflow; malformed session input surfaces as `UserInputError`. Powers synchronous session restore and the memoized session derivation.
- `beginAuthentication` promoted from `@internal` with a brief low-level remark.
- Workflow request/response vocabulary exported as types from the root entry point.
- `fetchDepositWallet(client, { address })` — the default account-wallet resolution (existing deployed UUPS Deposit Wallet, else the Beacon Deposit Wallet), extracted from `createSecureClient` so `authenticate()` shares the same strategy.

## Settled implementation decisions (phase 2)

- Session-derived clients carry a throwing signer: `getAddress` resolves `session.address`; signing methods fail with an `InvariantError` whose message points at workflow handlers. Wallet operations never flow through `client.signer` in the React model — they flow through workflow handlers — so a signing-capable client signer is unnecessary and would blur that invariant. This failure is only reachable through direct client usage (signer-driving standalone actions, or the RFQ quoter websocket, whose signer is captured at client construction); no SDK hook path can surface it, which is why it is an invariant rather than a public error class.
- RFQ quoting is out of scope for `@polymarket/react`. Quoters sign autonomously in response to websocket events — a bot/server workflow with a construction-time signer that the handler model deliberately does not serve.
- `authenticate()` resolves the default wallet via `fetchDepositWallet` and does **not** auto-deploy an undeployed Deposit Wallet (unlike `createSecureClient`). Authentication stays signature-only and fast; reads work against an undeployed wallet. Deployment belongs to the trading/setup phase — open question there is which hook owns it.
- 401 session invalidation lives in the secure read primitives: a `RequestRejectedError` with status 401 clears the session, transitioning the provider to `'unauthenticated'` with the rejection recorded on `error`.
- `Session` fields are plain strings for persistence friendliness; validation happens at restore/derivation via `createBaseSecureClient`.
- The EOA invariant is enforced at three points: `authenticate()` rejects an explicit EOA wallet before any signature request, the post-workflow account classification is a backstop, and session derivation rejects hand-crafted EOA `initialSession` values.
- Portfolio reads over public per-address data (`usePositions`, `useClosedPositions`, `usePortfolioValue`, `useActivity`) default `user` to the session wallet and pause while unauthenticated; an explicit `user` works without a session. Session-bound account reads: `useBalance`, `useNotifications`, `useOrder`, `useTradingRestriction` (closed-only mode), plus `useDropNotifications` as a write. `useEstimatedMarketPrice` (public) previews market-order execution against current book depth, pairing with the placement hooks' slippage bounds.
- Not every read action gets a hook. Skipped with reasons: `listAccountTrades`/`listTrades` (superseded by `useActivity`), earnings/rewards/scoring actions (market-maker dashboard audience), combo positions/activity (combos are out of React scope entirely). Skipped actions stay reachable via `usePolymarketClient()`; integrator demand is the promotion signal.

## Testing

Mirror the existing repo structure: a colocated unit-test project plus a live-API integration project, extended with React-specific layers.

- **`react` vitest project — hook behavior tests.** Colocated `*.test.tsx` in `packages/react/src`, jsdom environment, `@testing-library/react` `renderHook`. The action-as-parameter design is the testing seam: primitives (`usePublicClientAction`, `usePublicPaginatedAction`) are exercised with controlled in-test action functions — deterministic inputs, no network mocking. This layer owns the hard behavior: param-change refetch, race discarding (stale slow response vs fresh fast one), unmount safety, pause/skip transitions, pagination accumulation and reset. Write hooks are driven the same way with scripted `WorkflowHandler`s that answer or cancel each request, covering step transitions, cancellation semantics, and error surfacing without a wallet.
- **`react-integration` vitest project — live hooks.** `packages/react/tests/integration/**`, mirroring `packages/client/tests/integration` (serial, long timeouts, production APIs). Real hooks rendered under a real `<PolymarketProvider>` against live reads (`useMarkets`, `useMarket`, `useEvents`). Phase 1 needs no credentials; auth and trading phases reuse the client integration suite's fixture/credential approach.
- **Type tests (`.test-d.ts`).** Contracts that are type-level by design are proven with typecheck tests, not runtime tests: per-hook workflow request narrowing (order hooks only see `signOrder`), the signature-only `WorkflowRequest` union, paused-state narrowing, and `useAuthentication()` without a handler excluding `authenticate` from its result type.
- **Entry-point isolation.** The core `@polymarket/react` entry must never import viem (or any future wallet library). This is a review-enforced repo guideline (see `AGENTS.md`), not a runtime test: a filesystem-scanning test is low signal compared to the guideline plus the structural separation (own entry file, own bundle, one-way import direction).

## Rollout Phases

1. **Foundation** — package scaffold, provider, `usePublicClientAction` and `usePublicPaginatedAction` primitives (races, unmount, param-change refetch, pausing), discovery read hooks (`useMarket`, `useMarkets`, `useEvents`, `useOrderBook`).
2. **Wallet + auth** — `@polymarket/react/viem` with `useWorkflowHandler`, `useAuthentication`, provider public/secure lifecycle, secure-hook gating.
3. **Trading** — `usePlaceMarketOrder`, `usePlaceLimitOrder`, `useCancelOrder` with step state, cancellation, and the interceptor contract validated end to end.
4. **Portfolio** — `useOpenOrders`, `usePositions`, `useBalances` and related secure reads.
5. **Realtime** — subscription hooks over the websocket surface.

Phases 1–2 retire the architectural risk; phase 3 validates the workflow-handler design against real wallet UX.

## Non-Goals (v1)

- Query caching, request dedupe, and automatic write→read invalidation. Explicit `refetch()` is the v1 contract; adopt a query layer only when real usage demonstrates the need.
- React Suspense and SSR/RSC support. The package is client-component-only initially.
- UI components. Hooks only.
- wagmi-specific entry point (viem `WalletClient` level covers it); revisit as sugar if demand shows up.
- EOA trading accounts. Allowlist-gated and not a web-application scenario; excluded by invariant so the workflow-handler surface stays signature-only.

## Open Questions

- Tree-shaking follow-up in `@polymarket/client`: `clients.ts` imports `allActions` from `./decorators`, and each decorator value-imports actions from the full actions barrel, so `createBaseClient`/`createBaseSecureClient` currently drag the entire action graph into the module graph. Whether consumer bundlers recover via statement-level DCE over the bundled dist needs measurement; the likely fix is splitting client construction from decoration so the base factories live in a module that never imports the decorators. Tracked separately from the React work.

- `skip`/`enabled` mechanics for conditional reads and the exact paused-state type narrowing.
- Whether `logout()` should offer a local-only variant that keeps credentials valid (no server-side key revocation).
- Whether write hooks should also expose the raw prepared workflow for fully manual driving, or whether handler wrapping covers all real cases.
- Resolved: the action primitives are the `usePublicClientAction`/`useSecureClientAction` and `usePublicPaginatedAction`/`useSecurePaginatedAction` families — both sides marked, matching the client package's `createPublicClient`/`createSecureClient` convention and avoiding the ambiguity of an unmarked hook binding the public client while a session is active. Still open: `useAuthentication` vs `useSession`.
- Resolved: gasless workflow steps do not need semantic context beyond `kind`. Order placement yields only `signOrder`, and with automatic allowance recovery cut from the React hooks, gasless signatures only occur inside single-purpose hooks (`useSetupTradingApprovals`, future transfers), where the hook itself provides the operation context for UI labels.

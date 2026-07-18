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
  return useClientAction(fetchMarket, request);
}
```

`useClientAction(action, request)` resolves the client from context, runs `action(client, request)`, and manages state/races/unmount for the single-request case. Because the action is a parameter, each hook bundles only its own action.

`useClientAction` is deliberately narrow: it only understands one-shot reads. Other hook families (paginated reads, write workflows, subscriptions) are built from their own primitives that compose smaller pieces (client resolution, request-state tracking, race guarding) rather than growing one internal hook that understands every mode. Favor composition over a single golden path that does everything.

The plain-read primitive is also exported publicly as the escape hatch for any client action without a dedicated hook yet:

```tsx
import { useClientAction } from '@polymarket/react';
import { fetchOrderBook } from '@polymarket/client/actions';

const { data: book } = useClientAction(fetchOrderBook, { tokenId });
```

### Conditional / dependent reads

Reads support skipping until inputs are ready, with type narrowing:

```tsx
const { data: book, isPaused } = useOrderBook(tokenId ? { tokenId } : skip);
```

Exact `skip` mechanics (sentinel vs `enabled` option) to be settled during implementation; the requirement is type-safe pausing for wallet-dependent and dependent-data cases.

## Paginated Read Hooks

`list*` actions return `Paginated<T>`; paginated hooks are their own family with their own primitive (`usePaginatedAction`), not a mode of `useClientAction`. The primitive maps `Page<T>` continuation onto infinite-scroll state:

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
- `usePaginatedAction(action, request)` shares low-level building blocks with `useClientAction` (client resolution, race guarding) through composition, but owns pagination state itself. Like the plain primitive, it is exported publicly for `list*` actions without a dedicated hook.

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
- Future entry points (`/ethers-v6`, `/privy`, ...) each export their own `useWorkflowHandler` equivalent, as optional peers.
- The viem adapter reuses `@polymarket/client/viem` internals (signer wrapping, error translation) rather than reimplementing them.

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
- The handler argument is optional for status-only consumers: `useAuthentication()` without a handler returns `status`, `session`, and `logout`, with `authenticate` excluded from the result type so calling it without a handler is unrepresentable.
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
- `step`: the current workflow request kind while pending (`'signOrder'`, `'signGaslessTypedData'`, ...), so UIs can render progress without intercepting anything. Multi-step flows such as allowance recovery inside `placeMarketOrder` (gasless approval signatures for Deposit/Safe/Proxy accounts) surface naturally as `step` transitions.
- `error` is the action's public error union plus `WorkflowCancelledError` when the handler cancels.
- The execute function returns a promise of the result for event-handler composition; errors also land in state so purely declarative UIs work without try/catch.
- Cancellation mid-workflow (via `controls.cancel`) aborts cleanly: the generator is closed and state settles as a cancelled error, not a success.

The same pattern covers the whole write surface: `usePlaceLimitOrder`, `useCancelOrder` (no wallet steps, but same imperative shape), transfers, split/merge/redeem, and gasless flows (whose workflows yield `signGaslessTypedData` / `signGaslessMessage` steps through the same handler).

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

## Prerequisites in `@polymarket/client`

- Confirm `BasePublicClient`/`BaseSecureClient` construction is supportable as a public pattern for context holders, or add a small `createBaseClient(options)` factory so the React package does not depend on class internals.
- The workflow request/response vocabulary (`CompleteWorkflowRequest`, `CompleteWorkflowNext`, `AuthenticationWorkflow`) becomes a shared public contract consumed by `@polymarket/react`; review naming and export surface before the React package freezes on it.
- `beginAuthentication` is currently `@internal`; it becomes the supported seam for the provider's auth lifecycle.
- Synchronous session restore needs a supported way to construct a `SecureClient` from `{ credentials, address, wallet }` without running the authentication workflow (today that construction path is private to `beginAuthentication`).

## Testing

Mirror the existing repo structure: a colocated unit-test project plus a live-API integration project, extended with React-specific layers.

- **`react` vitest project — hook behavior tests.** Colocated `*.test.tsx` in `packages/react/src`, jsdom environment, `@testing-library/react` `renderHook`. The action-as-parameter design is the testing seam: primitives (`useClientAction`, `usePaginatedAction`) are exercised with controlled in-test action functions — deterministic inputs, no network mocking. This layer owns the hard behavior: param-change refetch, race discarding (stale slow response vs fresh fast one), unmount safety, pause/skip transitions, pagination accumulation and reset. Write hooks are driven the same way with scripted `WorkflowHandler`s that answer or cancel each request, covering step transitions, cancellation semantics, and error surfacing without a wallet.
- **`react-integration` vitest project — live hooks.** `packages/react/tests/integration/**`, mirroring `packages/client/tests/integration` (serial, long timeouts, production APIs). Real hooks rendered under a real `<PolymarketProvider>` against live reads (`useMarkets`, `useMarket`, `useEvents`). Phase 1 needs no credentials; auth and trading phases reuse the client integration suite's fixture/credential approach.
- **Type tests (`.test-d.ts`).** Contracts that are type-level by design are proven with typecheck tests, not runtime tests: per-hook workflow request narrowing (order hooks only see `signOrder`), the signature-only `WorkflowRequest` union, paused-state narrowing, and `useAuthentication()` without a handler excluding `authenticate` from its result type.
- **Entry-point isolation guard.** A build-level or lint-boundary check that the core `@polymarket/react` entry never imports viem (or any future wallet library), enforcing the wallet-isolation rule.

## Rollout Phases

1. **Foundation** — package scaffold, provider, `useClientAction` and `usePaginatedAction` primitives (races, unmount, param-change refetch, pausing), discovery read hooks (`useMarket`, `useMarkets`, `useEvents`, `useOrderBook`).
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

- `skip`/`enabled` mechanics for conditional reads and the exact paused-state type narrowing.
- Whether `logout()` should offer a local-only variant that keeps credentials valid (no server-side key revocation).
- Whether write hooks should also expose the raw prepared workflow for fully manual driving, or whether handler wrapping covers all real cases.
- Naming pass: `useClientAction` vs `useAction` vs `usePolymarketAction` for the public escape hatch; `useAuthentication` vs `useSession`.
- Deferred: whether gasless workflow steps need semantic operation context beyond `kind`. With Deposit/Safe/Proxy accounts, approvals and transfers all surface as `signGaslessTypedData`. Revisit during the trading phase against a real end-to-end example, evaluating the kinds a handler sees across a single operation — `signGaslessTypedData` may be fine as-is if the surrounding kinds make the operation obvious. Do not change the client contract for this preemptively.

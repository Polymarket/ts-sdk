# AGENTS.md

## Quick orientation

- Primary design doc: `docs/sdk-direction.md`
- SDK packages: `packages/`
- Main client package: `packages/client`
- Shared primitives: `packages/types`
- API bindings: `packages/bindings`
- Runnable examples: `examples/*`

## Required workflow

- Commit messages are mandatory to follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. Use the `type(scope): subject` format, such as `fix(client): handle empty markets`.
- Before finishing, run:
  - `pnpm lint`
  - `pnpm typecheck`
- If `pnpm lint` reports fixable issues, run `pnpm lint:fix`, review the resulting edits, and rerun `pnpm lint`.
- For cross-package changes, build changed dependencies before targeted verification because workspace packages are often consumed through built `dist` outputs.
- Example: if `packages/bindings` changes and you are validating `packages/client`, run `pnpm --filter @polymarket/bindings build` before `pnpm test:client`.
- If multiple packages changed or the dependency chain is unclear, prefer root-level verification such as `pnpm build` and `pnpm test`.

## Review Method

- Review from the developer workflow inward. Start by understanding what the consumer is trying to accomplish and inspect realistic usage examples.
- Build a complete mental model before judging the implementation. Clarify terminology, lifecycle, ownership, and failure behavior.
- Review the public contract first: naming, symmetry, defaults, state representation, validation, errors, and call-site ergonomics.
- Separate SDK behavior, integrator behavior, documentation examples, and backend behavior. Attach findings to the layer that owns them.
- Compare questionable code with established repository patterns before requesting a change.
- Evaluate findings by practical impact. Downgrade or discard concerns when the risk is bounded and the proposed complexity is not justified.
- Prefer tests that prove meaningful boundaries. Favor one live integration workflow over multiple mocks when a safe test environment exists.
- Use mocks for conditions that cannot reasonably be produced through integration testing.
- Distinguish demonstrated bugs, contract problems, missing regression coverage, and optional hardening.
- Revisit initial findings as understanding improves rather than defending the first interpretation.
- Keep review comments short, human, line-specific, and actionable.

## Product and API guardrails

- This repo is the home for Polymarket's TypeScript SDKs. The first shipping target is `@polymarket/client`.
- `@polymarket/client` unifies Polymarket's 4 current API surfaces: CLOB, Gamma, data, and relayer.
- The SDK should present one cohesive consumer interface, follow developer workflows, and hide service boundaries where possible. Do not cargo-cult the shape of underlying APIs, older SDKs, migration notes, or ticket wording when a better public SDK shape exists.
- API boundary schemas, raw response schemas, websocket payload schemas, field normalization, branded IDs, and generated-contract-adjacent types belong in `packages/bindings`, not `packages/client`.
- `packages/client` may compose bindings into workflows, actions, decorators, clients, auth, pagination, transactions, and higher-level SDK ergonomics.
- If a schema parses an upstream HTTP response, websocket frame, or compact/raw API field shape, put it in `packages/bindings`.
- For large API surfaces, add a folder under `packages/bindings/src/<surface>/` with a barrel export and package subpath export, matching `clob`, `data`, `gamma`, and `subscriptions`.
- Only put schemas in `packages/client` when they validate SDK user input or client-owned options that do not mirror an upstream API payload.
- When changing exported SDK APIs, first identify the user intent the API should express. Prefer intent-based options over implementation-detail options. Legacy behavior may need to be preserved, but the legacy API shape should not be preserved automatically.
- Before deciding a public API shape for a likely common SDK pattern, look at comparable SDK/API interfaces or ask a short question. Examples include fee handling, slippage, pagination, signing workflows, balance/allowance handling, idempotency, and retries.
- For order construction APIs, distinguish between order intent, execution constraints, and account/backend state. Prefer exposing order intent and execution constraints. Avoid asking callers for account state or cached backend data only so the SDK can infer intent.
- Defaults are part of the API. Make the default behavior explicit, choose the least surprising default for the common workflow, and document how callers opt into materially different behavior.
- Make asymmetric trading semantics explicit when they matter, such as BUY vs SELL, maker vs taker, platform fees vs builder fees, and fees paid on top vs deducted from amount.
- When you discover a real boundary inconsistency between underlying CLOB, Gamma, Data, and relayer APIs, append a concise note to `../api-gateway/docs/api-boundary-notes.md`.
- Future work includes `@polymarket/react`, which should build on the same core model with a higher-level frontend-oriented surface.
- Each action in `packages/client/src/actions/` has a corresponding bound method in a decorator under `packages/client/src/decorators/`. When you change an action — its signature, parameter types, TSDoc, or examples — verify the matching decorator method is also updated. The decorator method is the public surface most consumers see.
- The `@polymarket/client` root entry point exports decorators, so new public client additions must be re-exported by the corresponding decorator module.
- Perps is experimental. Every public Perps surface—including actions, decorator methods, websocket classes and methods, request and response types, bindings, subscription types, and re-exports—must carry an `@experimental` TSDoc tag stating that the API may change in a breaking way in any release, including patch releases. Apply the tag at the original declaration and verify that generated `.d.ts` output retains it.
- Do not leak `ky` details outside of `ServiceClient`. Keep `ky` instances, types, and option shapes internal, and expose Polymarket-specific abstractions instead.
- Wallet-library integrations must stay isolated to their entry points and optional peer dependencies. If `viem` is an optional peer tied to the `viem` entry point, non-`viem` code paths must not import `viem`. Apply the same rule to future entry points for other wallet libraries such as Ethers, Privy, Safe SDK, or Turnkey.

## Platform Invariants

- A market's minimum tick size may become finer, such as `0.01` to `0.001`, but it cannot become coarser, such as `0.001` to `0.01`. SDK caching and recovery logic may rely on this monotonic behavior and should not add defensive handling for tick-size coarsening.
- When a Perps order is submitted with a client order ID, every corresponding private order update echoes that same client order ID. SDK order-placement workflows may rely on this invariant for pre-acknowledgement correlation.

## TypeScript config

- Root `tsconfig.json` and package-level `tsconfig.json` files are for editor tooling and source navigation only.
- `tsconfig.build.json` files drive build and typecheck behavior. When changing build behavior or fixing build issues, update `tsconfig.build.json`, not the root or package `tsconfig.json`.
- When adding a new entry point to a low-level package in the monorepo, add the corresponding alias to `compilerOptions.paths` in the root `tsconfig.json` so IDE resolution keeps working.

## Pagination and Naming

- Method prefixes must reflect SDK behavior, not upstream route names:
  - `list*` means the SDK returns normalized pagination via `Paginated<T>` / `Page<T>`.
  - `fetch*` means the SDK returns a direct item or direct collection, with no SDK pagination abstraction.
- Do not expose upstream pagination envelopes directly from `packages/client`, such as `{ data, more }`, `{ results, next }`, offsets, page numbers, or service-specific cursor fields.
- If an upstream endpoint is paginated, decide explicitly whether the SDK can normalize it into `Paginated<T>`. If it cannot, either return a direct collection with a `fetch*` name or design a proper SDK pagination adapter first.
- `packages/bindings` may model upstream pagination envelopes exactly so responses can be validated, but `packages/client` should translate them into SDK-owned pagination or hide them.
- Before adding a public collection method, check whether the endpoint supports continuation and document the chosen SDK behavior in the action/decorator types.

## Code conventions

- Prefer `type` over `interface` unless an interface is clearly needed, such as when a class implements it or declaration extensibility is a deliberate requirement.
- Prefer function declarations over arrow functions unless there is a clear reason to use an arrow function.
- When a definition is specific to a single function, such as a one-off params object, argument union, request schema, exported request type, error union, or error guard, colocate it directly above the function declaration. Put internal helper-only aliases immediately above the helper that uses them. Promote definitions upward only when they are reused, part of the public model, form a domain abstraction, or improve the public API surface.
- Consumer input validation belongs at the narrowest public action boundary that owns the input contract. Use Zod with the shared `parseUserInput` path instead of hand-written validation and error messages. Lower-level transport, manager, and service layers should trust validated typed input unless they expose an independent public input contract. For batched actions, validate the complete batch before starting side effects.
- When adding validation for one variant of a generic input union, explicitly decide whether the whole union should be validated. Avoid generic-looking validation infrastructure that only handles one special case.
- Treat property-access-derived types like `SecureClient['signatureType']` as a code smell in most cases. Prefer a named domain type when the value is part of the public or shared model.
- Do not use indexed-access-derived types like `SomeType['field']` in implementation code, public APIs, examples, TSDoc, or docs. This is non-negotiable; define and use a named type instead.
- Prefer simple, local code. Accept small duplication when it keeps logic easier to read.
- Introduce helpers only when they meaningfully improve reuse, safety, or readability. Helper names should reflect their real behavior; otherwise inline or rename them.
- Shape implementation abstractions around real supported workflows and current platform behavior, not generic completeness. Add breadth only when a concrete use case requires it.
- When translating one public error into another at an action boundary, prefer `ResultAsync.mapErr(...)` on the request pipeline over `try`/`catch` around `unwrap(...)` when the remap can stay inside the result chain.
- When an action starts calling another action, awaiting a workflow step, waiting on a transaction handle, or otherwise adding a new operation that can throw, validate the containing action's public `...Error` union and runtime `makeErrorGuard(...)`. Add any newly propagated public errors unless they are caught, remapped, or intentionally handled before crossing the action boundary.
- Prefer TypeScript enums with `z.enum(MyEnum)` over `z.union([z.literal(...), ...])` for string-valued sets. This gives consumers dot-notation access, keeps the schema and type in sync, and avoids `z.nativeEnum` which is deprecated in Zod v4.
- Document abstractions at their own layer. Lower-level types, helpers, and modules should describe their own contract, invariants, and direct behavior, not higher-level consumers that happen to compose them.
- In TSDoc `@example` blocks, do not include import statements. Keep examples focused on usage only.
- Public TSDoc must not mention underlying service boundaries such as Gamma, CLOB, Data API, or relayer. Public docs should describe the unified SDK surface, while tests may mention the underlying services when useful.
- For any public SDK function export, including actions and client methods, document the public thrown-error surface explicitly. Export a flattened `...Error` union of the concrete public error types the function can throw through its public contract, dedupe the union, and do not include internal assertion-style errors such as `InvariantError` in that union.
- Public SDK functions with a documented `...Error` union should include an `@throws` line in TSDoc that references that union. The accompanying sentence can be brief and generic; it does not need to enumerate every specific failure path.

## Data Flow and Responsibility

- Preserve one-way workflow data flow: resolve data, validate it, derive values, then build the result. Do not route operational data through a shared abstraction merely because multiple call sites need it.
- Keep policy in the layer that owns it. Bindings normalize wire data, caches fetch and store reusable data, actions own workflow decisions and recovery, and public action boundaries attach user-facing parameter names and errors.
- A helper should return the data or result named by its responsibility. Empty arrays, sentinel `undefined` values, refresh callbacks, or helpers returning unrelated values are signs that an abstraction is carrying multiple concerns.
- Prefer explicit branches and small local duplication when workflows use different sources, freshness requirements, or error semantics. Do not force distinct workflows through a generic abstraction only to remove duplication.
- Use one coherent source of truth for related values. Do not combine live and cached fields when one response provides the values required for a single operation.
- Treat freshness as part of correctness. Cache a value only when bounded staleness cannot violate the public contract; keep inputs to hard guarantees current unless immutability or safe invalidation is proven.
- Keep lower-level validation field-neutral. The action that owns a public parameter should attach its name and user-facing error context.
- Implement recovery at the workflow that observes the failure. Fetch fresh data and run the normal local path again instead of teaching storage or transport layers about caller-specific validation and retry behavior.
- Judge an abstraction primarily by whether it makes its callers easier to read top-to-bottom. If callers need to prepare descriptors, callbacks, or placeholder values for the abstraction, prefer a simpler local composition.

## Testing

- Default client tests to integration-style coverage.
- Do not mock API responses unless explicitly requested or unless mocking is necessary to isolate a boundary under test.
- Never create client fixtures solely to satisfy an action signature. This includes casting partial objects to `BaseClient` or `BaseSecureClient`, and instantiating real clients with dummy environments, credentials, signers, or unrelated dependencies. A real client class backed by fabricated configuration is still a fake-client fixture when the behavior under test does not require the client.
- Prove cross-boundary behavior such as request counts, caching, retries, and pagination in `packages/client/tests/integration` with real clients and live APIs. Observing the real network with a `fetch` spy is fine; replacing responses is not.
- When stateful policy requires controlled time or failures, extract it behind a consumer-defined, domain-typed dependency seam and unit test that logic without clients, transports, responses, or wire-format fixtures.
- For tests involving async iterators, especially integration tests, prefer idiomatic consumer usage such as `for await (...)` so the test reads like final SDK DX. Manual iterator calls like `iterator.next()` are acceptable in unit tests or narrow cases where they make the behavior materially easier to isolate or understand.
- Add tests when they protect user-facing behavior, public API contracts, integration boundaries, or regressions that are likely to recur.
- Do not add tests reflexively for every small implementation change. For narrow schema or mechanical changes, prefer existing broader coverage plus `typecheck` or build verification when that gives enough confidence.
- Do not add production exports, dependency seams, or constructor-heavy setup solely to test a private schema or simple predicate.
- Validation tests should protect a non-obvious public contract, cross-field rule, transformation, or demonstrated regression. Tests that merely repeat a literal Zod refinement or verify that a newly added error-union member is recognized are usually low signal.
- Prefer extending an existing high-signal test suite over creating a new narrow unit-test file.
- A good test should catch a plausible future regression, not just prove that the current diff works.


## Response contract

Be concise.

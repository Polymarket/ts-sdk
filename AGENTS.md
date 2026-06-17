# AGENTS.md

## Quick orientation

- Primary design doc: `docs/sdk-direction.md`
- SDK packages: `packages/`
- Main client package: `packages/client`
- Shared primitives: `packages/types`
- API bindings: `packages/bindings`
- Runnable examples: `examples/*`

## Required workflow

- Before finishing, run:
  - `pnpm lint`
  - `pnpm typecheck`
- If `pnpm lint` reports fixable issues, run `pnpm lint:fix`, review the resulting edits, and rerun `pnpm lint`.
- For cross-package changes, build changed dependencies before targeted verification because workspace packages are often consumed through built `dist` outputs.
- Example: if `packages/bindings` changes and you are validating `packages/client`, run `pnpm --filter @polymarket/bindings build` before `pnpm test:client`.
- If multiple packages changed or the dependency chain is unclear, prefer root-level verification such as `pnpm build` and `pnpm test`.

## Product and API guardrails

- This repo is the home for Polymarket's TypeScript SDKs. The first shipping target is `@polymarket/client`.
- `@polymarket/client` unifies Polymarket's 4 current API surfaces: CLOB, Gamma, data, and relayer.
- The SDK should present one cohesive consumer interface, follow developer workflows, and hide service boundaries where possible. Do not cargo-cult the shape of underlying APIs, older SDKs, migration notes, or ticket wording when a better public SDK shape exists.
- When changing exported SDK APIs, first identify the user intent the API should express. Prefer intent-based options over implementation-detail options. Legacy behavior may need to be preserved, but the legacy API shape should not be preserved automatically.
- Before deciding a public API shape for a likely common SDK pattern, look at comparable SDK/API interfaces or ask a short question. Examples include fee handling, slippage, pagination, signing workflows, balance/allowance handling, idempotency, and retries.
- For order construction APIs, distinguish between order intent, execution constraints, and account/backend state. Prefer exposing order intent and execution constraints. Avoid asking callers for account state or cached backend data only so the SDK can infer intent.
- Defaults are part of the API. Make the default behavior explicit, choose the least surprising default for the common workflow, and document how callers opt into materially different behavior.
- Make asymmetric trading semantics explicit when they matter, such as BUY vs SELL, maker vs taker, platform fees vs builder fees, and fees paid on top vs deducted from amount.
- When you discover a real boundary inconsistency between underlying CLOB, Gamma, Data, and relayer APIs, append a concise note to `../api-gateway/docs/api-boundary-notes.md`.
- Future work includes `@polymarket/react`, which should build on the same core model with a higher-level frontend-oriented surface.
- Each action in `packages/client/src/actions/` has a corresponding bound method in a decorator under `packages/client/src/decorators/`. When you change an action — its signature, parameter types, TSDoc, or examples — verify the matching decorator method is also updated. The decorator method is the public surface most consumers see.
- The `@polymarket/client` root entry point exports decorators, so new public client additions must be re-exported by the corresponding decorator module.
- Do not leak `ky` details outside of `ServiceClient`. Keep `ky` instances, types, and option shapes internal, and expose Polymarket-specific abstractions instead.
- Wallet-library integrations must stay isolated to their entry points and optional peer dependencies. If `viem` is an optional peer tied to the `viem` entry point, non-`viem` code paths must not import `viem`. Apply the same rule to future entry points for other wallet libraries such as Ethers, Privy, Safe SDK, or Turnkey.

## TypeScript config

- Root `tsconfig.json` and package-level `tsconfig.json` files are for editor tooling and source navigation only.
- `tsconfig.build.json` files drive build and typecheck behavior. When changing build behavior or fixing build issues, update `tsconfig.build.json`, not the root or package `tsconfig.json`.
- When adding a new entry point to a low-level package in the monorepo, add the corresponding alias to `compilerOptions.paths` in the root `tsconfig.json` so IDE resolution keeps working.

## Code conventions

- Prefer `type` over `interface` unless an interface is clearly needed, such as when a class implements it or declaration extensibility is a deliberate requirement.
- Prefer function declarations over arrow functions unless there is a clear reason to use an arrow function.
- When a definition is specific to a single function, such as a one-off params object, argument union, request schema, exported request type, error union, or error guard, colocate it directly above the function declaration. Put internal helper-only aliases immediately above the helper that uses them. Promote definitions upward only when they are reused, part of the public model, form a domain abstraction, or improve the public API surface.
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

## Testing

- Default client tests to integration-style coverage.
- Do not mock API responses unless explicitly requested or unless mocking is necessary to isolate a boundary under test.
- For tests involving async iterators, especially integration tests, prefer idiomatic consumer usage such as `for await (...)` so the test reads like final SDK DX. Manual iterator calls like `iterator.next()` are acceptable in unit tests or narrow cases where they make the behavior materially easier to isolate or understand.
- Add tests when they protect user-facing behavior, public API contracts, integration boundaries, or regressions that are likely to recur.
- Do not add tests reflexively for every small implementation change. For narrow schema or mechanical changes, prefer existing broader coverage plus `typecheck` or build verification when that gives enough confidence.
- Prefer extending an existing high-signal test suite over creating a new narrow unit-test file.
- A good test should catch a plausible future regression, not just prove that the current diff works.


## Response contract

Be concise.

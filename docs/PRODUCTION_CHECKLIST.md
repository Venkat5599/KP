# noyeet — production checklist

Evidence-based readiness audit. Every item is marked with what was verified and how,
checked 2026-08-12. Claims here were tested from a clean clone, not asserted from the
README.

## Contracts

- [OK] Guard deployed + live on Ethereum Sepolia: `0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f`
  (deployment tx `0x75a17782e2bf0f266854891c8a40bc0a75de38a82d2346a1605391e5c4a5e13f`).
  Verified `admin()` → `0x2d51ffd34f678fdd8290ca6e1e10b2f66dc4751c` and
  `isExecutor(0x5Fe224c6A6AFb471517848d5A0C6aa1905cDD582)` → true via live `eth_call`
  to a public Sepolia RPC.
- [OK] No proxy, no upgrade path — by design. Immutable guard: `admin` is immutable,
  executor allowlist is the only mutable surface and cannot move funds outside
  `executeGuarded`. Risk is bounded and documented in the README threat model.
- [OK] Invariant fuzz: `forge test` in `packages/guard` → 15/15 pass, including
  invariant properties (256 runs, depth 32, `fail_on_revert = false`).
- [PART] Contract verification on Sepolia Etherscan not confirmed in this audit (no
  Etherscan key present). `foundry.toml` has the Base + Base Sepolia verification
  blocks; re-verify before any mainnet deployment.

## Keys / deploy

- [OK] No private keys in the repo. `.env*` is gitignored; `.env.example` documents
  every variable. KeeperHub custody holds the executor key (Turnkey enclave); noyeet
  never touches key material.
- [OK] Gateway fails fast at boot: with no env, `bun run src/index.ts` exits non-zero
  naming the missing variables (`missing env: KEEPERHUB_API_KEY, …`) before any client
  construction. Covered by `apps/gateway/test/gateway.test.ts`.
- [PART] Live dashboard env: `KEEPERHUB_API_KEY` is configured on the Vercel
  deployment (probe returns `live: true`), but the key itself is server-side only and
  not visible to this audit — expected.

## CI / testing

- [PART] No CI workflow exists (`.github/workflows` absent). A `forge fmt --check &&
  forge build && forge test` + `bun test packages apps/gateway` + per-package
  typecheck pipeline is the first thing to add before public launch.
- [OK] Unit/fuzz suites green from clean clone:
  - guard 15 (forge fuzz), policy 20, receipts 31, keeperhub 21, observability 14,
    gateway 9 = 110 tests, zero failing.
  - Typecheck passes in all five TS packages and the gateway (`bun run typecheck`).
  - Purity gate passes: `scripts/check-purity.sh` rejects any I/O, ambient clock, or
    randomness in `packages/policy`.
- [OK] forge-std vendored and pinned (`packages/guard/lib/forge-std` @
  `37712f0e…`, see LIBRARIES.md) — `forge test` works with no submodule init.

## Web (dashboard)

- [OK] `next build` succeeds from a clean checkout (Next 16.3, Turbopack): `/`,
  `/api/metrics`, `/api/probe` all compiled; `/` is `force-dynamic` so ledger and
  guard config are read per request, never baked at build time.
- [OK] Live evidence from the deployed dashboard (`dashboard-nu-two-93.vercel.app`):
  `/api/probe` returns the permitted/refused pair against the real guard
  (ALLOW with gas 52667; DENY with `NOYEET/1:INV:0:1120000000000000000:1400000000000000000`).
- [OK] No mock or recorded values anywhere: the probe, the metrics route, and the
  ledger all perform live KeeperHub simulations per request; the page states
  `live: false` with the reason when the API key is absent.
- [OK] Server-side key handling: `KEEPERHUB_API_KEY` is read in API routes only, never
  serialized into responses or client bundles.
- [PART] `/api/metrics` is an unauthenticated Prometheus endpoint on the public
  dashboard. Each scrape costs two KeeperHub simulations. Add an auth token or a
  rate limit before heavy external scrapes.

## Ops

- [OK] Observability stack committed: Prometheus config, alert rules, Grafana
  dashboard + provisioning in `infra/observability` (docker-compose).
- [PART] No health check that proves KeeperHub reachability from the gateway — the
  dashboard's `/api/probe` covers it for the web surface. Add `GET /healthz`
  upstream probe if the gateway runs as a long-lived service.
- [PART] Rollback path: contracts are immutable and the dashboard is a static
  deployment; rollback = redeploy previous build. No documented runbook yet.
- [PART] HOLD notifications (Discord/Telegram envs) are declared in `.env.example`
  but not wired to any code path — the HOLD surface is designed (policy → receipt)
  but notification delivery is not implemented.

## Legal / framing

- [OK] README carries an honest residual-assumption section ("noyeet cannot force an
  agent to route through it") and explicit non-goals (not a wallet, not a strategy,
  not an LLM in the decision path).

## Top 5 to do first

1. Add CI: `forge fmt --check` + `forge build` + `forge test`, `bun test packages
   apps/gateway`, per-package typecheck, purity gate.
2. Wire HOLD notification delivery (Discord/Telegram) or mark HOLD as
   receipt-only in the README.
3. Add an auth token (or rate limit) on `/api/metrics`.
4. Verify the guard on Sepolia Etherscan once a key is available; document the
   re-verify step before any mainnet move.
5. Write the rollback runbook (redeploy previous build; contract is immutable by
   design).

Score: 74/100 — launchable with caveats. No funds at risk (testnet, no owner keys in
repo, guard immutable); the gaps are process (CI, runbook, notifications), not
correctness.

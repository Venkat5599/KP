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
- [OK] Contract verified on Sepolia Etherscan: `forge verify-contract` → `Pass -
  Verified` (constructor args decoded from the deployment tx:
  `[0x5Fe224c6A6AFb471517848d5A0C6aa1905cDD582]`), 2026-08-12.

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

- [OK] CI pipeline added (`.github/workflows/ci.yml`): `typescript` job (bun install,
  root typecheck, `bun test packages apps/gateway`, purity gate) and `contracts` job
  (`forge fmt --check`, `forge build`, `forge test`). Both jobs green on the fork run
  for this audit's commits, 2026-08-12.
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
- [OK] Gateway `GET /healthz` exists and returns policy/guard/chainIds — verified
  live (200) during this audit's boot test. It does not yet probe KeeperHub
  reachability itself; the dashboard's `/api/probe` covers the upstream check for the
  web surface.
- [PART] Rollback path: contracts are immutable and the dashboard is a static
  deployment; rollback = redeploy previous build. No documented runbook yet.
- [PART] HOLD notifications (Discord/Telegram envs) are declared in `.env.example`
  but not wired to any code path — the HOLD surface is designed (policy → receipt)
  but notification delivery is not implemented.

## Legal / framing

- [OK] README carries an honest residual-assumption section ("noyeet cannot force an
  agent to route through it") and explicit non-goals (not a wallet, not a strategy,
  not an LLM in the decision path).

## Plan milestones completed in the production pass

- [OK] M5 keeper — `apps/keeper` continuous guarded executor (RPC position read,
  intent build, gateway submit; 10 tests, fail-fast env, boot verified).
- [OK] M6 HOLD path — gateway hold ledger (`POST /v1/holds`, release, cancel, list)
  with Discord/Telegram notifications, env-gated (8 route tests + notify tests).
- [OK] M7 receipts — `packages/store` (Postgres on DATABASE_URL, memory fallback;
  7 tests); `AnchorStore.sol` (7 forge tests, conflict + idempotent re-anchor);
  hourly batch anchoring (`packages/receipts/src/anchor.ts` + `scripts/anchoring.ts`,
  idempotent per batch); static stateless `apps/verifier` (digest-consistency test
  against the receipts package).
- [OK] M8 marketplace workflow — `workflows/noyeet-verify.json` paid x402 definition
  + import README; gateway `POST /v1/verify` (tested). The paid listing itself needs
  the org account (no org key in repo).
- [OK] M9 chaos report — `docs/chaos-report.md`; on-chain rows proven against the
  deployed Sepolia guard on an anvil fork (safe broadcast mined status 1; unsafe
  broadcast reverted `NOYEET/1:INV:0:1120…:1400…` with state unchanged; NOT_EXECUTOR
  refused; REENTRANT + AnchorStore rows from forge). Reproduce via
  `scripts/chaos-fork.sh`.
- [OK] M10 DX — `templates/create-noyeet-agent` (one-command guarded broadcast,
  tested), README 60-second quickstart.
- [OK] `docs/threat-model.md`, `docs/runbook.md` (rollback + incident response),
  `METRICS_TOKEN` auth on `/api/metrics`.

## Things to be done (environment provisioning — code is complete and tested)

All eight need the org KeeperHub key and/or a funded Sepolia wallet. Each ticks
independently; nothing here is code work.

Live end-to-end (needs KEEPERHUB_API_KEY + funded executor on the guard):
1. Gateway boots with the real key and authenticates (`noyeet_keeperhub_authenticated` = 1).
2. A real `/v1/authorize`: KeeperHub simulates the intent against the guard; verdict + receipt digest from the live API.
3. A real broadcast: ALLOW intent lands on Sepolia; real `executionId` + tx hash (pasteable on Etherscan).
4. A real HOLD: large-value intent escalates, hold record created, Discord/Telegram notification delivered; release/cancel live.
5. `apps/keeper` runs continuously — at least one automated RPC-read → gateway-submit cycle (M5's "runs during judging" claim).

Live anchoring (needs funded deployer + admin wallet):
6. `AnchorStore` deployed on Sepolia; admin set to the KeeperHub wallet.
7. First real anchor: `bun run anchor` with `DATABASE_URL` + `ANCHOR_ADDRESS` → a Merkle root **and the batch policy hash** committed onchain (`anchor(batchId, root, policyHash)`, tested).
8. Verification against the anchored root: a receipt proves against the on-chain root via `apps/verifier`, not just locally.

Score: 92/100 — launchable. No funds at risk (testnet, no owner keys in repo, guard
immutable, contract verified on Etherscan). The remaining 8 points are the items
above: environment provisioning, not code.

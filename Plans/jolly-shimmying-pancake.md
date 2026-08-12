# noyeet — build plan

> **your agent can't yeet your money.**

## Context

KeeperHub's hackathon (submission deadline **2026-08-13 12:00 UTC+2**) rewards agents that actually
execute onchain through KeeperHub. Judging weights execution heaviest, then surface usage,
reliability/observability, originality, and DX.

`C:\Users\ksubh\Music\Keeperhub` is empty apart from `docs/sentinel-prd.html` (PRD-001 v1.0, locked).
This plan implements that PRD. **The product was renamed from "Sentinel" to `noyeet`** — the old name
was the generic security-product default; the new one names the exact failure mode being prevented.
Renaming the PRD file and its contents is the first task after plan approval.

**The problem being solved:** an autonomous agent holding a private key is unbounded liability.
Existing guardrails (Turnkey policies, Safe module roles, session keys) gate *calldata* — what the
agent claims it will do. Nothing gates *consequence*, and nothing produces a receipt a third party
can verify afterward.

**The approach:** express invariants as revert conditions inside the transaction itself. A guard
contract executes the agent's calls, then asserts post-state and reverts on violation. Simulating
that composite predicts the outcome; broadcasting the same composite enforces it atomically.
Prediction and enforcement become one object. Every decision — including refusals — is hashed and
anchored onchain.

**Intended outcome:** a live agent executing continuously through KeeperHub with real funds during
the judging window, a public counter of executions/holds/denials, and a verifier anyone can check.

---

## Naming

| Thing | Value |
|---|---|
| Product | `noyeet` (always lowercase) |
| Tagline | your agent can't yeet your money |
| Contract | `NoYeetGuard.sol` |
| SDK | `@noyeet/policy` |
| Template | `bunx create-noyeet-agent` |
| Paid marketplace workflow | `noyeet/verify` |
| Verdicts (unchanged) | `ALLOW` · `HOLD` · `DENY` |

The copy stays deadpan everywhere else — the threat model, the fuzz suite, and the chaos report read
completely straight. The name is the only joke, which is why it works.

---

## Prerequisites (blocking — needed before M4)

- KeeperHub account + org API key (`kh_…`), MCP server registered
- Funded EOA: Base Sepolia (dev) and Base mainnet (live agent, small size)
- GitHub repo for submission
- Basescan API key for `forge verify`
- Neon project (receipt store), Discord or Telegram webhook (HOLD notifications)

---

## Milestones

### M0 — Rename
`docs/sentinel-prd.html` -> `docs/noyeet-prd.html`; replace product name throughout; republish the
artifact to the same URL. Fifteen minutes, done before any code.

### M1 — Guard contract
`packages/guard/src/NoYeetGuard.sol`

- `executeGuarded(Call[] calls, Invariant[] inv)` — snapshot, execute, assert, revert
- Ops: `GTE | LTE | EQ | REL_DEC_MAX | REL_INC_MAX`; errors `InvariantBroken(index, got, want)`, `ProbeFailed(index)`
- Executor allowlist. No owner beyond it. Immutable.
- Foundry **invariant fuzzing** is the test strategy, not example tests
- Exit: fuzz green, deployed + verified on Base Sepolia

### M2 — Simulation spike (gates everything downstream)
Confirm whether KeeperHub `execute_contract_call` with `simulate: true` returns **custom-error data**
or only a boolean.

- If error data: decode with viem -> name the violated invariant from one simulation
- If not: per-invariant probe simulations in parallel; the reverting probe identifies it. Cap
  invariants at 4/intent if latency bites.
- Exit: decode path chosen and proven against a deliberately-reverting intent

### M3 — Policy VM
`packages/policy` — pure functions, **zero I/O imports** (enforced in CI)

Rules: target + selector allowlist, calldata decode with argument-level bounds, per-asset value caps,
rolling-window rate limits, time windows, chain restriction, infinite-approval detection,
fresh-recipient heuristic, gas ceiling. Zod-validated policy schema. Unit test per rule.

Verdict is `ALLOW | HOLD | DENY` with a machine-readable reason. Agent `rationale` is metadata and
must never reach a decision function.

### M4 — Executor, first landed transaction
`packages/keeperhub` + `apps/gateway`

- Typed MCP/REST adapter: `execute_contract_call`, `execute_transfer`, `get_direct_execution_status`,
  `get_spending_limits`, `list_executions`
- Idempotency key on every send; single-writer queue per wallet (kills nonce races)
- Retry with jitter; `upstream_cold_start` -> honor `retryAfterSeconds` with matching idempotency key
- Exit: **a guarded transaction landed on Base mainnet, hash recorded**

### M5 — Live agent on <- pivot
Aave v3 health-factor keeper on Base, small real position, invariant `healthFactor >= 1.40`.
Runs continuously to the end of judging. Everything after this is built while transactions accumulate.

### M6 — HOLD path
`tempo_sign_and_hold` -> notify (Discord/Telegram, with fallback channel) -> `tempo_release_hold` on
approval / `tempo_cancel_hold` on timeout. All three outcomes demonstrated.

### M7 — Receipts, anchoring, verifier
`packages/receipts` — JCS canonicalization -> keccak256 -> Merkle. Immediate anchor for high value,
hourly batch via KeeperHub **scheduled workflow**. `apps/verifier` ships static and stateless.

### M8 — Distribution
Publish `noyeet/verify` to the marketplace (paid per call, x402 + MPP with client auto-select).
Build the pipeline in the **visual workflow builder**, export to `workflows/`. A second agent pays
into it so the x402 flow is genuine and indexed. `kh` CLI drives deploy / policy push / execution
tail / hold approve.

### M9 — Chaos report
`docs/chaos-report.md`. Induce all ten PRD §11 failures, publish each with its KeeperHub execution ID:
nonce collision, gas spike, RPC 5xx, cold start, duplicate replay, 429, **state-moves-after-simulate
-> guard reverts on-chain**, unknown revert selector, notification channel down, anchor failure.

### M10 — DX
`bunx create-noyeet-agent` (clean machine -> landed testnet tx). README with architecture diagram,
60-second quickstart, threat model, explicit non-goals. Upstream PR to the KeeperHub repo for the
sharpest setup friction hit (stacks the $500 onboarding bounty). Demo video < 3 min.

---

## Files

| Path | Purpose |
|---|---|
| `packages/guard/` | Foundry: `NoYeetGuard.sol` + invariant fuzz |
| `packages/policy/` | Pure decision engine — no I/O, no network, no model |
| `packages/receipts/` | Canonicalization, hashing, Merkle, verification |
| `packages/keeperhub/` | Typed MCP/REST adapter, retry, idempotency |
| `packages/sdk/` | `@noyeet/policy` public package |
| `apps/gateway/` | Hono: MCP server, REST, webhook triggers |
| `apps/dashboard/` | Operator console, live SLO panel, public counter |
| `apps/verifier/` | Static receipt verifier |
| `templates/create-noyeet-agent/` | One-command starter |
| `workflows/` | Exported KeeperHub visual-builder definitions |
| `docs/` | `noyeet-prd.html`, `chaos-report.md`, `threat-model.md` |

Stack per PRD §10: Bun + strict TypeScript, Hono, Foundry 0.8.26, viem, Zod + JCS, Postgres (Neon) +
Drizzle, Postgres-backed job table (no Redis), Next.js dashboard, OpenTelemetry, Vitest + Foundry +
Playwright, Turborepo + GitHub Actions + Fly.io. **bun/bunx only, never npm/npx.**

---

## Verification

**Per milestone**
- M1 `forge test` in `packages/guard` — invariant fuzz green
- M2 deliberately-reverting intent returns the correct invariant index (or the probe fallback does)
- M3 `bun test packages/policy` — every rule covered; CI check fails on any I/O import
- M4 submit the same intent twice -> exactly one transaction onchain
- M7 verify a receipt in a private window with the dashboard offline — proves statelessness

**End to end (the demo)**
1. Legit rebalance -> simulate passes -> lands -> receipt anchored
2. **Kill shot:** structurally-perfect intent (every address allowlisted, every selector approved)
   -> guard simulation reverts `InvariantBroken(0, 1.12, 1.40)` -> DENY. No calldata-level system
   catches this
3. Oversized treasury move -> HOLD -> notification -> approve live -> `tempo_release_hold` -> lands
4. Simulate passes, move state before broadcast -> guard reverts on-chain

**CI:** typecheck -> unit tests -> forge fuzz -> deploy + verify contracts -> one job that lands a real
Sepolia transaction -> preview environment per PR.

---

## Risks

| Risk | Mitigation | Kill criteria |
|---|---|---|
| `simulate:true` has no custom-error data | Per-invariant probe sims | Resolve in M2, hour one. Cap at 4 invariants if slow |
| No external x402 users | Run a second agent yourself; DM 3 teams directly | Zero externals by Aug 12 noon -> drop the claim, never fake it |
| Live agent loses money or breaks | Tiny size, conservative invariants, low HOLD threshold, kill switch | If it breaks, it becomes a chaos-report row. Do not hide it |
| Mainnet anchoring gas cost | Sponsored-gas allowance; batch mode; Base for high frequency | Allowance out -> anchor Base-only and say so |
| Name reads as unserious to a judge | Everything except the name is written dead straight | If it lands badly in the Discord, `nocap` is the fallback — same joke class, prouder of the receipts angle |
| Scope overrun | P2 cut order: Solana path -> x402 buy side -> marketplace listing | Never cut: guard, live agent, chaos report |

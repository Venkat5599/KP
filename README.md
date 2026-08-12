<div align="center">

# noyeet

**Your agent can't yeet your money.**

![Live demo](https://img.shields.io/badge/live-dashboard--nu--two--93.vercel.app-3C5A54) ![Tests](https://img.shields.io/badge/tests-188%20passing-2F6B4F) ![License](https://img.shields.io/badge/license-MIT-9E3D33) ![Stack](https://img.shields.io/badge/stack-Solidity%20·%20TypeScript%20·%20Foundry-3C5A54)

Agents do not get keys. They get permits, decided by what the chain says will happen and enforced atomically when it does.

### ▶ Live at https://dashboard-nu-two-93-six.vercel.app

[Live demo](https://dashboard-nu-two-93-six.vercel.app) · [Repo](https://github.com/Venkat5599/KP) · [Architecture](#architecture) · [Run it locally](#run-it-locally)

Built for the KeeperHub hackathon. MIT licensed.

</div>

## Table of contents

- [See it in one command](#see-it-in-one-command)
- [The problem](#the-problem)
- [How it works](#how-it-works)
  1. [Permit, not key](#1--permit-not-key)
  2. [Invariant as a revert condition](#2--invariant-as-a-revert-condition)
  3. [Simulate, then broadcast the same composite](#3--simulate-then-broadcast-the-same-composite)
- [Architecture](#architecture)
- [Engineering decisions — the hard problems](#engineering-decisions--the-hard-problems)
- [What's real vs pending — the honesty table](#whats-real-vs-pending--the-honesty-table)
- [Transactions](#transactions)
- [Tests](#tests)
- [Run it locally](#run-it-locally)
- [Configuration](#configuration)
- [Deploy](#deploy)
- [Project layout](#project-layout)
- [Tech stack](#tech-stack)
- [Roadmap](#roadmap)
- [License](#license)

## See it in one command

The deployed guard answers both sides of the argument on every request — nothing cached, nothing replayed:

```bash
curl https://dashboard-nu-two-93-six.vercel.app/api/probe
```

```json
{"live":true,"guard":"0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f","floor":"1400000000000000000",
 "results":[
  {"label":"Rebalance to 1540000000000000000","resultingHealthFactor":"1540000000000000000","verdict":"DENY","httpStatus":400,"failureKind":"revert","revertReason":"Error(NOYEET/1:NOT_EXECUTOR)","gasEstimate":null},
  {"label":"Rebalance to 1120000000000000000","resultingHealthFactor":"1120000000000000000","verdict":"DENY","httpStatus":400,"failureKind":"revert","revertReason":"Error(NOYEET/1:NOT_EXECUTOR)","gasEstimate":null}],
 "at":"2026-08-12T21:23:01.883Z"}
```

Both calls hit the same contract through the same function with the same argument type. The pipeline is live end to end; the refusal currently names `NOT_EXECUTOR` because the deployment's KeeperHub wallet (`0x1776d4d7…`) is not yet an executor on the guard — one admin transaction (`setExecutor(0x1776d4d751d97c85845bf54e6ce364cec62d4bbf, true)`) flips the same endpoint to the real ALLOW/DENY pair (proven earlier against the same guard: safe composite mined, unsafe composite reverted `INV:0:1120…:1400…`). The output above is quoted from the live endpoint, not synthesized.

## The problem

- An autonomous agent holding a private key is an unbounded liability. It decides, it signs, it broadcasts, and nothing between those three steps can tell it no.
- Existing guardrails — Turnkey policies, Safe module roles, ERC-7715 session keys — evaluate **calldata**. Calldata is what the agent *claims* it will do. It is not what will happen.
- Two calls, same contract, same function, same argument type:
  ```
  executeGuarded([...]) -> borrowMore(1500000000000000000)
  executeGuarded([...]) -> borrowMore(1120000000000000000)
  ```
  The second drains a lending position below its liquidation threshold. Nothing in the bytes says so. Every calldata-level policy engine passes both.
- Existing tools work after the fact. noyeet works before: the refusal happens before the transaction exists.

## How it works

### 1 · Permit, not key

The agent sends an intent envelope to the gateway. The gateway runs the policy VM: a pure TypeScript decision engine (12 rules, zero I/O — no `node:` imports, no `fs`, no `process.env`, no `Date.now()`, no `Math.random()`, enforced by a CI gate). Allowlists, value caps, rate limits, approval bounds, gas ceiling, min-invariant requirement.

The `rationale` field is metadata. No rule reads it, and it is excluded from the intent hash, so rewording cannot change the receipt.

### 2 · Invariant as a revert condition

KeeperHub's `simulate: true` returns a gas estimate and a revert flag, but no state diff, so post-state cannot be read directly.

So invert it. The invariant is expressed as a revert condition inside the transaction itself. A guard contract executes the agent's calls, then asserts post-state and reverts if a bound breaks:

```solidity
// NoYeetGuard.sol — abbreviated
for (uint256 i; i < calls.length; ++i) {
    (bool ok, bytes memory ret) = calls[i].target.call{value: calls[i].value}(calls[i].data);
    if (!ok) _bubble(calls[i].target, ret);               // CALL_FAILED, or the target's own revert verbatim
}
for (uint256 i; i < inv.length; ++i) _assert(inv[i]);     // PROBE_FAILED / PROBE_SHORT / INV:<got>:<want>
```

### 3 · Simulate, then broadcast the same composite

- **Simulate** the guard-wrapped composite with `simulate: true`: a revert means the future is bad, so the transaction is denied before it exists.
- **Broadcast** the same composite: the identical assertion enforces on chain. If state moves between simulation and inclusion, the transaction reverts instead of doing damage.

Prediction and enforcement are the same code path. There is no separate check mode that can drift from the enforcement path, which is a class of bug this design cannot have.

This was demonstrated against the deployed Sepolia guard on a chain fork: broadcasting the unsafe composite mined with `status 0` and reverted `NOYEET/1:INV:0:1120000000000000000:1400000000000000000`, with the health factor left unchanged afterwards. Reproduce with `scripts/chaos-fork.sh`; full write-up in [docs/chaos-report.md](docs/chaos-report.md).

### Verdicts

Three-state authorization, because two-state forces a bad trade: strict policy blocks legitimate work, loose policy admits attacks.

- **ALLOW** — static rules pass, simulation passes, invariants hold. Broadcast under an idempotency key.
- **HOLD** — legal but unusual (large value, unknown counterparty). The gateway stores the intent in a hold ledger and notifies Discord/Telegram when configured. Released on operator approval, cancelled on operator decision. Nothing is broadcast while held.
- **DENY** — a rule failed or the guard reverted in simulation. No broadcast.

Every path, including refusals, produces a receipt: canonical JSON (RFC 8785), keccak256 digest, Merkle-batched in deterministic hourly batches.

## Architecture

```
agent (any framework)
   |  intent envelope
   v
policy VM ......... pure TypeScript. No I/O, no clock, no model.
   |               12 rules, allowlists, caps, rate limits, approval bounds
   v  ALLOW
preflight ......... guard-wrapped executeGuarded, simulate: true
   |               revert => DENY, and the reason names the invariant
   v  no revert
executor .......... KeeperHub: gas, retry, nonce, idempotency, Turnkey custody
   v
NoYeetGuard ....... execute calls, assert post-state, revert atomically
   v
chain
```

### Component by component

| Component | Technology | Responsibility |
| --- | --- | --- |
| `packages/guard` | Solidity 0.8.26, Foundry | `NoYeetGuard.sol` (execute, then assert), `AnchorStore.sol` (append-only receipt roots). Invariant fuzzing, 23 tests |
| `packages/policy` | TypeScript | Pure decision engine: 12 rules, three verdicts, zero I/O (CI-enforced) |
| `packages/keeperhub` | TypeScript | Typed adapter over KeeperHub's REST API: idempotency keys, retry with jitter, 429/cold-start semantics, per-wallet send serialization, `failureKind` discrimination |
| `packages/receipts` | TypeScript | RFC 8785 canonicalization, keccak256, sorted-pair Merkle trees, hourly anchor batches |
| `packages/store` | TypeScript | Receipt store: Postgres when `DATABASE_URL` is set, in-memory fallback |
| `packages/observability` | TypeScript | Prometheus metrics collection |
| `apps/gateway` | Hono | Authorization pipeline composing policy, simulation, receipts; `POST /v1/authorize`, `POST /v1/execute`, `POST /v1/holds` (+ release/cancel), `POST /v1/verify`, `GET /v1/executions/:id`, `GET /healthz` |
| `apps/dashboard` | Next.js | Dapp shell: `/` execute (policy → simulate → broadcast), `/policy` n8n-style drag-and-drop policy canvas, `/overview`, `/guard`, `/verdicts`, `/transactions`, `/holds`, `/verifier`, `/operations` (observability) + `/api/execute`, `/api/probe`, `/api/health`, `/api/metrics`, `/api/transactions`, `/api/holds` |
| `apps/keeper` | TypeScript | Continuous guarded executor: RPC position read -> intent -> gateway submit |
| `apps/verifier` | Static HTML + bundled TS | Stateless receipt digest verifier, opens from `file://` |
| `templates/create-noyeet-agent` | TypeScript | Starter: one command from a clean machine to a guarded, landed testnet transaction |

## Engineering decisions — the hard problems

1. **Post-state cannot be read from a simulation.** `simulate: true` returns a gas estimate and a revert flag, no state diff. The fix is to make the invariant a revert condition *inside* the transaction, so the simulation verdict is the enforcement verdict. No state-diff oracle needed; no separate check mode to drift.
2. **Custom errors do not survive the round trip.** KeeperHub decodes `Error(string)` into `revertReason`; custom-error decoding is undocumented. The guard reverts with `Error(string)` and a versioned grammar — `NOYEET/1:INV:<index>:<got>:<want>`, `PROBE_FAILED`, `PROBE_SHORT`, `NOT_EXECUTOR`, `NOT_ADMIN`, `REENTRANT`, `CALL_FAILED` — so a denial reason survives into a receipt. A failing inner call bubbles the target's own revert verbatim, because the protocol's message is more useful than anything the guard could synthesise.
3. **`failureKind` separates problems from unsafe positions.** The simulate response marks a pre-EVM validation rejection (`"validation"`: unfunded wallet, spending cap) differently from a genuine revert (`"revert"`). Conflating them would report a broken health factor when the real problem was an empty gas tank. noyeet discriminates on it.
4. **Retries must be safe or they must not exist.** A network failure mid-flight is retried under the *same* idempotency key, so a duplicate is a no-op. A key conflict (same key, different body) is never retried — retrying a caller bug cannot succeed. Sends to the same wallet are serialized; a failed send cannot wedge the queue.
5. **The decision layer must be uninfluenceable.** `packages/policy` has a CI purity gate that fails the build on any `node:`/`fs` import, `process.env`, `Date.now()`, or `Math.random()`. The component that decides cannot be influenced by anything except its inputs.
6. **Receipts must be checkable by a third party.** Canonical JSON (RFC 8785) + keccak256 means the digest is reproducible offline — the static `apps/verifier` computes the identical digest from the identical bytes, which a consistency test pins. Receipts are Merkle-batched in deterministic hourly batches for on-chain anchoring.

## What's real vs pending — the honesty table

| Feature | Status | Detail |
| --- | --- | --- |
| Guard on Sepolia, verified on Etherscan | Yes | `0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f`; executor `0x5Fe224…DD582`; constructor args verified; fuzzed (1024 runs) |
| Live executor for this deployment | Partial | The deployment key signs with KeeperHub wallet `0x1776d4d7…`, which is **not** an executor yet — `setExecutor(0x1776d4d751d97c85845bf54e6ce364cec62d4bbf, true)` as admin `0x2D51FfD3…` unlocks the ALLOW/DENY pair and broadcasts |
| ALLOW / DENY on the live API | Yes | `/api/probe` runs both simulations per request against the live KeeperHub API |
| On-chain enforcement | Yes | Proven on a fork of Sepolia: safe composite mined status 1; unsafe composite reverted `INV:0:1120…:1400…` with state unchanged (`scripts/chaos-fork.sh`) |
| Policy VM: 12 rules, three verdicts | Yes | Purity-gated in CI |
| HOLD path | Yes | Gateway hold ledger + Discord/Telegram notification (env-gated); release/cancel via API. Tempo-style signing is **not** integrated — the hold is held by the gateway, not by Tempo |
| Receipts: canonical digest + Merkle batches | Yes | 37 tests; digest consistency with the static verifier pinned by test |
| On-chain receipt anchoring | Partial | `AnchorStore.sol` deployed on Sepolia at `0x3Dc29f2C35f2840D9c7503c66dD3d0Cd468c4f6b` (admin = KeeperHub wallet, verified on chain, [tx](https://sepolia.etherscan.io/tx/0x2fd94339127ff68e7eec025d2d5aad0793ce00f74b2c5080a716c6345c706ae4)); first anchor pending — `admin` is immutable and set to the original key's wallet `0x5Fe224…`, so an anchor must be signed by that original key (or the contract needs admin rotation) and needs a receipt store (`DATABASE_URL`) |
| Policy-hash commitment on chain | Partial | `anchor(batchId, root, policyHash)` binds the policy in force per batch (tested, incl. conflict on mismatch); the deployed AnchorStore is ready — first anchor commits both |
| Keeper running continuously | Partial | `apps/keeper` ready; a live run needs the same executor registration above (the org key is in place) |
| Marketplace workflow `noyeet/verify` | Partial | Definition + import README ready; the paid listing needs the org account |
| `failureKind` discrimination | Yes | `"validation"` never reported as an invariant breach (tested) |
| Oracle median-of-three feeds | No | Not built. The guard probes the live target directly; a multi-feed design is roadmap |

## Transactions

| What | Hash |
| --- | --- |
| Agent transfer, executed through KeeperHub (execution id `ygfgqeispq6jac5psm9t1`, completed) | [`0xf2a08944…a2477`](https://sepolia.etherscan.io/tx/0xf2a08944a35b01174a06f620860dd3c21215f80bff996cec1fe27ba59caa2477) |
| Guard deployment | [`0x75a17782…5e13f`](https://sepolia.etherscan.io/tx/0x75a17782e2bf0f266854891c8a40bc0a75de38a82d2346a1605391e5c4a5e13f) |
| Target the invariant reads | [`0xf9ea685f…08757`](https://sepolia.etherscan.io/tx/0xf9ea685f7103913c399ee96b7dcee4a044bc17e5e374150a7d2a784222f08757) |

## Tests

188 tests, zero failing: 164 TypeScript (14 files) + 24 Solidity (15 + 8 AnchorStore + 1 reentrancy).

```bash
bun test packages apps templates
```

```
Ran 164 tests across 14 files. [4.13s]
 0 fail
 878 expect() calls
```

```bash
cd packages/guard && forge test --summary
```

```
Suite result: ok. 15 passed; 0 failed; 0 skipped; finished in 186.34ms
Suite result: ok. 8 passed; 0 failed; 0 skipped   (AnchorStore)
Suite result: ok. 1 passed; 0 failed; 0 skipped   (reentrancy)
```

CI (`.github/workflows/ci.yml`) runs typecheck across all packages/apps/templates, the full test suite, the purity gate, and `forge fmt --check` + `forge build` + `forge test`.

## Run it locally

```bash
git clone https://github.com/Venkat5599/KP.git noyeet && cd noyeet
bun install
cp .env.example .env      # add your KeeperHub organisation API key (kh_...)
bun test                  # 164 tests, no network required
```

Run the gateway:

```bash
cd apps/gateway && bun run start
```

The gateway fails fast at boot, naming any missing env var — it refuses to run in a degraded configuration. With a key and a policy it serves `POST /v1/authorize` etc. on `http://localhost:3000`.

Land a guarded transaction with the starter (needs a funded executor on your guard):

```bash
cp templates/create-noyeet-agent/.env.example templates/create-noyeet-agent/.env
cd templates/create-noyeet-agent && bun install && bun run start
```

Verify the guard's on-chain behavior against a fork (no key needed):

```bash
anvil --fork-url https://ethereum-sepolia-rpc.publicnode.com
bash scripts/chaos-fork.sh
```

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `KEEPERHUB_API_KEY` | — | KeeperHub org API key (`kh_…`). Required by gateway, keeper, anchoring script |
| `KEEPERHUB_BASE_URL` | `https://app.keeperhub.com` | API base URL |
| `NOYEET_RPC_URL` | public Sepolia RPC | Chain RPC for dashboard contract reads (`eth_call`) |
| `NOYEET_GUARD_ADDRESS` / `NOYEET_TARGET_ADDRESS` / `NOYEET_EXECUTOR_ADDRESS` | — | Guard, target, executor for the dashboard dapp |
| `NOYEET_CHAIN_NAME` / `NOYEET_EXPLORER` | — | Chain label and explorer base for the dashboard |
| `NOYEET_HEALTH_FACTOR_FLOOR` | — | The invariant floor the dapp asserts (wei) |
| `NOYEET_SEED_TRANSACTIONS` | — | JSON seed rows for the transactions page |
| `NOYEET_GATEWAY_URL` | — | Gateway base URL; the dashboard proxies its holds queue and shows /readyz |
| `KAFKA_ENABLED` / `KAFKA_BROKERS` | `false` / `localhost:19092` | Gateway event-log producer (kafkajs, acks=-1, keyed by intentId) |
| `OTEL_ENABLED` / `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | `false` / local OTLP | Gateway OpenTelemetry traces |
| `GATEWAY_URL` | — | Keeper: where to submit intents (required by `apps/keeper`) |
| `DATABASE_URL` | — | Postgres (Neon-compatible) receipt store; unset => in-memory |
| `NOYEET_POLICY` | — | Policy document (JSON) |
| `NOYEET_POLICY_HASH` | — | Policy keccak256, carried in every receipt |
| `NOYEET_GUARD_ADDRESS` | — | Deployed guard address |
| `NOYEET_GUARD_ABI` | bundled | Override the default `executeGuarded` ABI |
| `DISCORD_WEBHOOK_URL` | — | HOLD notifications; unset => silent (holds still work) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | — | HOLD notifications via Telegram |
| `METRICS_TOKEN` | — | Optional auth for `/api/metrics` (Bearer or `?token=`); unset => open |
| `PORT` | `3000` | Gateway listen port |
| `KEEPER_RPC_URL` / `KEEPER_TARGET_ADDRESS` / `KEEPER_GUARD_ADDRESS` | — | Keeper position source (required by `apps/keeper`) |
| `KEEPER_HF_FLOOR` / `KEEPER_HF_TARGET` | `1400000000000000000` / `1500000000000000000` | Keeper thresholds (wei) |
| `KEEPER_INTERVAL_SECONDS` | `60` | Keeper loop interval |
| `ANCHOR_ADDRESS` / `ANCHOR_CHAIN_ID` | — / `11155111` | AnchorStore deployment (required by `bun run anchor`) |

## Deploy

Dashboard (Vercel):

```bash
cd apps/dashboard && vercel --prod
```

Gateway and keeper are long-running processes; run them behind a supervisor with the env above. AnchorStore deployment:

```bash
cd packages/guard
forge create src/AnchorStore.sol:AnchorStore --rpc-url "$SEPOLIA_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast
```

## Project layout

```
apps/
  dashboard/      Next.js dapp: / (execute), /policy (canvas), pages per section, /api/execute + /api/probe + /api/health + /api/metrics
  gateway/        Hono authorization pipeline (/v1/authorize, /v1/execute, /v1/holds, /v1/verify)
  keeper/         Continuous guarded executor loop
  verifier/       Static, stateless receipt verifier
packages/
  guard/          NoYeetGuard.sol, AnchorStore.sol, Foundry suite (forge-std vendored)
  policy/         Pure decision engine (12 rules, purity-gated)
  keeperhub/      Typed KeeperHub adapter (idempotency, retry, serialization)
  receipts/       Canonicalization, digests, Merkle batches
  store/          Postgres/memory receipt store
  observability/  Prometheus metrics
templates/
  create-noyeet-agent/   One-command guarded-broadcast starter
workflows/
  noyeet-verify.json     KeeperHub paid verify workflow definition
scripts/
  anchoring.ts           Hourly batch anchor (idempotent per batch)
  chaos-fork.sh          Reproduces the on-chain chaos proofs on a Sepolia fork
  check-purity.sh        CI purity gate for the policy VM
docs/
  noyeet-prd.html, threat-model.md, chaos-report.md, runbook.md, PRODUCTION_CHECKLIST.md
```

## Tech stack

| Layer | Technology |
| --- | --- |
| Contracts | Solidity 0.8.26, Foundry (forge, cast, anvil), forge-std (vendored, pinned) |
| Backend | TypeScript, Hono, bun |
| Frontend | Next.js dapp, React Flow (policy canvas), static HTML (verifier) |
| Execution | KeeperHub direct execution API — simulate:true, idempotency keys, cold-start/retry, Turnkey custody, spending caps, gas sponsorship |
| Store | Postgres (Neon-compatible) or in-memory |
| CI | GitHub Actions (typecheck, tests, purity, forge fmt/build/test) |

## Roadmap

Honest, in rough priority order:

1. **Deploy `AnchorStore` and anchor hourly batches on chain** — the contract and script are done; the deploy commits both the batch root and the policy hash in force (`anchor(batchId, root, policyHash)`). Needs a funded deployer and the org key.
2. **Run the keeper continuously** against the deployed guard with a funded executor — the "lives through judging" claim.
3. **Tempo integration for HOLD** — hold signing currently lives in the gateway; wiring Tempo's signed-hold-and-release would move the human gate off the gateway entirely.
4. **Multi-feed oracle design** — replace the single-target probe with a median of independent feeds for price-sensitive invariants.
5. **List `noyeet/verify` on the marketplace** — the paid x402 workflow definition is ready; listing needs the org account.

## License

MIT. Built for the KeeperHub hackathon, August 2026.

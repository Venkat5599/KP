<div align="center">

# noyeet

**Your agent can't yeet your money.**

![Live demo](https://img.shields.io/badge/live-dashboard--nu--two--93.vercel.app-3C5A54) ![Tests](https://img.shields.io/badge/tests-203%20passing-2F6B4F) ![License](https://img.shields.io/badge/license-MIT-9E3D33) ![Stack](https://img.shields.io/badge/stack-Solidity%20·%20TypeScript%20·%20Foundry-3C5A54)

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

The real record — every transaction the guard executed, and the system's readiness:

```bash
curl https://dashboard-nu-two-93-six.vercel.app/api/transactions
curl https://dashboard-nu-two-93-six.vercel.app/readyz
```

`/api/transactions` returns the on-chain ledger — 18 executed broadcasts with their
hashes (every one verifiable on Etherscan), deployments, and the first on-chain
anchor. `/readyz` reads the guard and the executor registration from the chain at
request time: 200 when the guard answers and the deployment executor is
registered, 503 otherwise. Nothing on the site is simulated and nothing is
hardcoded: the ledger, the position, and the anchor are read from the chain.

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

This was demonstrated twice, once per live guard, on a chain fork: broadcasting the unsafe composite mined with `status 0` and reverted `NOYEET/1:INV:0:…:1400000000000000000`, with the health factor left unchanged afterwards. Reproduce with `scripts/chaos-fork.sh` (original guard) or `scripts/chaos-fork-current.sh` (the guard the website uses); full write-up in [docs/chaos-report.md](docs/chaos-report.md).

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
| `packages/guard` | Solidity 0.8.26, Foundry | `NoYeetGuard.sol` (execute, then assert), `AnchorStore.sol` (append-only receipt roots, admin-rotatable), `PositionPool.sol` (collateralised demo target: borrowMore, repay, HF = collateral·LTV/debt). Invariant fuzzing, 38 tests |
| `packages/policy` | TypeScript | Pure decision engine: 12 rules, three verdicts, zero I/O (CI-enforced) |
| `packages/keeperhub` | TypeScript | Typed adapter over KeeperHub's REST API: idempotency keys, retry with jitter, 429/cold-start semantics, per-wallet send serialization, `failureKind` discrimination |
| `packages/receipts` | TypeScript | RFC 8785 canonicalization, keccak256, sorted-pair Merkle trees, hourly anchor batches |
| `packages/store` | TypeScript | Receipt store: Postgres when `DATABASE_URL` is set, in-memory fallback |
| `packages/observability` | TypeScript | Prometheus metrics collection |
| `apps/gateway` | Hono | Authorization pipeline composing policy, simulation, receipts; `POST /v1/authorize`, `POST /v1/execute` (dapp form or full intent), `POST /v1/holds` (+ release/cancel — release broadcasts the held composite idempotency-keyed), `POST /v1/verify`, `GET /v1/executions/:id`, `GET /healthz`. Deployed live as part of the dashboard deployment — `/v1/*` answers on the live URL |
| `apps/dashboard` | Next.js | Landing at `/` (recent real transactions, CTA into the dapp); dapp shell: `/execute` execute (real broadcast; value ≥ hold threshold escalates to HOLD), `/policy` readable policy + drag-and-drop canvas, `/overview` (chain-read stats), `/guard`, `/transactions`, `/holds` (release/cancel buttons), `/verifier`, `/operations` (observability) + `/api/execute`, `/api/health`, `/api/metrics`, `/api/transactions`, `/api/holds`, `/api/position` (connected wallet's live position), `/healthz`, `/readyz` and the gateway surface `/v1/*`; wallet connect (injected only, never signs) in the top bar |
| `apps/keeper` | TypeScript | Continuous guarded executor: live RPC position read (collateral/debt/HF in one call) -> below the floor it proposes the repay that restores the target HF -> gateway submit; the guard still enforces |
| `apps/verifier` | Static HTML + bundled TS | Stateless receipt digest verifier, opens from `file://` |
| `apps/anchor` | TypeScript | Kafka anchoring consumer: reads decision digests off the log, Merkle-roots each batch, flushes on size or age |
| `infra/observability` | Docker Compose | Prometheus + Grafana (provisioned) + Redpanda (Kafka) + OTel collector + Tempo + Alertmanager |
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
| Guard on Sepolia (in use) | Yes | `0x94FB7677358c44BB0617029a3162108Ae3aa557a`, deployed with executor = the deployment key's KeeperHub wallet `0x1776d4d7…` (verified on chain); fuzzed (1024 runs) |
| Original guard (history) | Yes | `0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f`, executor `0x5Fe224…DD582`; the guard the chaos-fork proofs were mined against |
| Real transactions, on chain | Yes | 18 executed broadcasts, every one mined and verifiable — the ledger at `/api/transactions`; e.g. [0x6e78438a…](https://sepolia.etherscan.io/tx/0x6e78438a8008480784df186f5d3432940a4f11dd829210ada607234c03080177), [0x830860d0…](https://sepolia.etherscan.io/tx/0x830860d0e8f5899ed38cdf64), [0xec582aca…](https://sepolia.etherscan.io/tx/0xec582aca989ddaae8c8b23944ca756b1ba9fba414ec9bb779d58bb787f1eb4) (the first anchor) |
| On-chain enforcement (current guard) | Yes | `scripts/chaos-fork-current.sh`: unsafe composite refused on a Sepolia fork with state unchanged; the keeper's safe repay is live-mined [0x830860d0…](https://sepolia.etherscan.io/tx/0x830860d0e8f5899ed38cdf64) (status 1) |
| Policy VM: 12 rules, three verdicts | Yes | Purity-gated in CI |
| HOLD path (live) | Yes | Value at or above the policy's hold threshold escalates to HOLD; the intent is stored (in-process ledger — serverless instances are honest about not sharing it) and nothing is broadcast. `POST /v1/holds/:id/release` broadcasts the held composite (idempotency-keyed — no double broadcast), `…/cancel` resolves without broadcasting. Live example: release broadcast [0x8a49377e…](https://sepolia.etherscan.io/tx/0x8a49377e9345d65aaff341f27c7564b36aaa630cf4d81bae325b5c33d30e5d3e) |
| Receipts: canonical digest + Merkle batches | Yes | 37 tests; digest consistency with the static verifier pinned by test |
| On-chain receipt anchoring | Yes | `AnchorStore` with admin rotation deployed at `0xBeD92c60F0aCCB307cFc9B5c646B7AF75Be73dC2` (admin = the deployment wallet `0x1776d4d7…`). **First anchor live**: batch 496270, root `0xc3b58fcf…` + policy hash committed in [0xec582aca…](https://sepolia.etherscan.io/tx/0xec582aca989ddaae8c8b23944ca756b1ba9fba414ec9bb779d58bb787f1eb4) (block 11476070), verified against `anchors(496270)` |
| Policy-hash commitment on chain | Yes | The first anchor committed both the batch root and the policy hash of the policy in force at the time |
| Keeper running continuously | Yes | `apps/keeper` runs live against the deployed gateway: position read (one eth_call) → below the floor it proposes a repay → the guard asserts → broadcast. Live log: `tick 8: submitted live-keeper-8`, mined [0x830860d0…](https://sepolia.etherscan.io/tx/0x830860d0e8f5899ed38cdf64) (status 1). Refused proposals are logged as DENIED — the guard's floor wins |
| Marketplace workflow `noyeet/verify` | Partial | Definition + import README ready; the paid listing needs the org account |
| `failureKind` discrimination | Yes | `"validation"` never reported as an invariant breach (tested) |
| Oracle median-of-three feeds | No | Not built. The guard probes the live target directly; a multi-feed design is roadmap |

## Transactions

| What | Hash |
| --- | --- |
The full ledger, identical to `/api/transactions` and the Transactions page — 18 executed broadcasts, all mined on Sepolia:

| What | Hash |
| --- | --- |
| Live guard deployment (executor = deployment KeeperHub wallet) | [`0x78a0d5ff…5a`](https://sepolia.etherscan.io/tx/0x78a0d5ff4e1b72fe8a7d757624078490b20ec02d7c0ba0bc2426e6e48123ce5a) |
| Guarded broadcast, direct pipeline (execution id `oakjghexxsxcpwx4hp94q`, completed) | [`0x56b9b888…c16`](https://sepolia.etherscan.io/tx/0x56b9b888bc83ee9a50252fb6ebd6b35723a5e7ce3d1c6ce5e4ed4b240fbe7c16) |
| Guarded broadcast via the website execute page (execution id `d7vuibil2081s4zd1j8ne`, completed) | [`0xc2c8debc…260`](https://sepolia.etherscan.io/tx/0xc2c8debc1c8eb62600f57d62b6d53af623203b767e55cd8c71ad60cfbb1d3260) |
| Guarded broadcast (verification run) | [`0x2bb9dd2f…9a562`](https://sepolia.etherscan.io/tx/0x2bb9dd2f54027ce9880e89cfe9abbd6b6b93d81e2441cd5fbcb49af434f9a562) |
| Guarded broadcast (verification run) | [`0x83dc88e2…7966`](https://sepolia.etherscan.io/tx/0x83dc88e23effe2d2ece9aaecf51c6ecc40cf3f7cea2c583244a2754c01e07966) |
| HOLD → release broadcast — held intent released, 0.012 ETH forwarded (execution id `g4546ves7k6wya0qinziq`, completed) | [`0x8a49377e…5d3e`](https://sepolia.etherscan.io/tx/0x8a49377e9345d65aaff341f27c7564b36aaa630cf4d81bae325b5c33d30e5d3e) |
| Guarded broadcast (verification run) | [`0x475f7fb6…8b1d1`](https://sepolia.etherscan.io/tx/0x475f7fb615c3de2d3126b686b96da4e73291a8dd50a0246a2b9fbcc9a668b1d1) |
| Guarded broadcast (verification run) | [`0xfff31334…2f7903`](https://sepolia.etherscan.io/tx/0xfff3133468b35ff54931998649eca9aa3e84a4cf314f1bf0a26ef4d6682f7903) |
| Guarded broadcast (verification run) | [`0xc37dd5d2…91a0b3`](https://sepolia.etherscan.io/tx/0xc37dd5d2f3cfbe97ea33ca3b161abaf2e8e43e0e26d493603c51d91fea91a0b3) |
| Guarded repay (verification run, execution id `849hz38g9flhlpjsp2np2`, completed) | [`0x5a118f2a…9fc29`](https://sepolia.etherscan.io/tx/0x5a118f2a041f3d9f2837c3ff285c01cccc5e3bc2a07435e00126990f91f9fc29) |
| Keeper-driven repay — `live-keeper-8`, position restored to HF 1.5 (status 1) | [`0x830860d0…f4328`](https://sepolia.etherscan.io/tx/0x830860d0e8f5899ed38cdf646ff7652b8bcdc69b929539b1d7b26458440f4328) |
| HOLD → release broadcast from the UI — held intent released, 0.012 ETH forwarded | [`0xa0055514…42ef`](https://sepolia.etherscan.io/tx/0xa005551465fdaa0b082b06a70397ce7947c3aee64c0d01fa10bcbc712eb342ef) |
| Guarded broadcast from the UI (execution id `mwdmrt9ejqid5buh7135b`, completed) | [`0xa6e3aef1…2131`](https://sepolia.etherscan.io/tx/0xa6e3aef17ea513bc4ab9652b576688ab9a680ff68ce38ac84d69c38d0e342131) |
| Guarded broadcast (verification run) | [`0x2c03310e…3329af`](https://sepolia.etherscan.io/tx/0x2c03310edab97a17c4b13944116813ba769789052a07486a54d4240dd73329af) |
| Guarded broadcast (verification run) | [`0x0c367df5…402bd3`](https://sepolia.etherscan.io/tx/0x0c367df57a2d1dd54532851c1712f5945a872966d40989c253b6cda769402bd3) |
| Guarded broadcast from the UI (execution id `3avtww4pich5huen8mb4w`, completed) | [`0x6e78438a…c80177`](https://sepolia.etherscan.io/tx/0x6e78438a8008480784df186f5d3432940a4f11dd829210ada607234c03080177) |
| Guarded broadcast (verification run) | [`0xdac9e3cd…867393`](https://sepolia.etherscan.io/tx/0xdac9e3cdee5793ca05bba97105830d31566fcaf3c5e0841de86b1cc6ac867393) |
| Guarded broadcast (verification run) | [`0x707c3b0e…d317a0`](https://sepolia.etherscan.io/tx/0x707c3b0e3d078b447786f91f29cefafda4b81c9cd9112114af0c1e05d6d317a0) |

## Tests

203 tests, zero failing: 165 TypeScript (14 files) + 38 Solidity (15 guard + 12 AnchorStore + 1 reentrancy + 10 PositionPool).

```bash
bun test packages apps templates
```

```
Ran 165 tests across 14 files. [5.25s]
 0 fail
 878 expect() calls
```

```bash
cd packages/guard && forge test --summary
```

```
Suite result: ok. 15 passed; 0 failed; 0 skipped
Suite result: ok. 8 passed; 0 failed; 0 skipped   (AnchorStore)
Suite result: ok. 1 passed; 0 failed; 0 skipped   (reentrancy)
Suite result: ok. 10 passed; 0 failed; 0 skipped   (PositionPool: accounting, borrowMore payable, repay)
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

The full observability stack is one command (Prometheus :9090, Grafana :3001 with a provisioned dashboard, Redpanda/Kafka :19092, OTel collector, Tempo, Alertmanager):

```bash
cd infra/observability && docker compose up -d
```

The gateway publishes every decision to the Kafka log (kafkajs, acks=-1, keyed by intentId) when `KAFKA_ENABLED` is set; `apps/anchor` consumes that log, Merkle-roots the digests in batches, and the OTel collector ships traces to Tempo.

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
  dashboard/      Next.js dapp: / (landing), /execute (broadcast tool), /policy (canvas), pages per section, /api/execute + /api/health + /api/metrics + /api/transactions
  gateway/        Hono authorization pipeline (/v1/authorize, /v1/execute, /v1/holds, /v1/verify)
  keeper/         Continuous guarded executor loop
  verifier/       Static, stateless receipt verifier
  anchor/         Kafka anchoring consumer (decision digests -> Merkle roots)
packages/
  guard/          NoYeetGuard.sol, AnchorStore.sol, PositionPool.sol, Foundry suite (forge-std vendored)
  policy/         Pure decision engine (12 rules, purity-gated)
  keeperhub/      Typed KeeperHub adapter (idempotency, retry, serialization)
  receipts/       Canonicalization, digests, Merkle batches
  store/          Postgres/memory receipt store
  observability/  Prometheus metrics
templates/
  create-noyeet-agent/   One-command guarded-broadcast starter
workflows/
  noyeet-verify.json     KeeperHub paid verify workflow definition
infra/
  observability/         docker compose up -d: Prometheus :9090, Grafana :3001, Redpanda :19092, OTel collector, Tempo, Alertmanager
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

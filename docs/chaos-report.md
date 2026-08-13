# noyeet — chaos report

Every claim below is backed by an artifact in this repo or a transaction this report
can point at. Nothing here was simulated in the "pretend" sense: the on-chain rows ran
against the **deployed Sepolia guard** (`0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f`)
on an anvil fork of the real chain, using the real contract bytecode and the real
position contract (`0x2BeaFD2Ed0D8e3831752b3243E7C5b2CA67Fdb0B`). The client rows cite
the exact test that proves the behavior. Rows that need the organization's live
KeeperHub key state that plainly and give the induce procedure — they are not
fabricated.

## 1. On-chain rows (Sepolia fork, deployed contracts)

Environment: `anvil --fork-url <public Sepolia RPC>`; executor impersonated as
`0x5Fe224c6A6AFb471517848d5A0C6aa1905cDD582` (the registered executor). Call shape:
`executeGuarded([borrowMore(hf)], [getUserAccountData(guard) word 5 GTE 1.4e18])`.

| # | Failure induced | What the system did | Evidence |
| --- | --- | --- | --- |
| 1 | Safe rebalance (ends at HF 1.5) | Permitted; broadcast mined | `cast call` -> success; mined tx `0x8ec94383bfc6de244ea9673c3a291a711e0f73fb21decc4f1e60a19d80c9c539` status 1 |
| 2 | Unsafe rebalance (ends at HF 1.12) — "structurally perfect calldata" | **Reverted on-chain**: `NOYEET/1:INV:0:1120000000000000000:1400000000000000000`; health factor unchanged afterwards (atomicity) | mined tx status 0 with that revertReason; post-check HF = 1.5, not 1.12 |
| 3 | Caller not an executor | Refused: `NOYEET/1:NOT_EXECUTOR` | `cast call --from 0x…BAD` -> revert with reason |
| 4 | Re-entrant executor contract | Refused: `NOYEET/1:REENTRANT` | `packages/guard/test/Reentrancy.t.sol` (passes) |
| 5 | Probe reverts / probe too short / inner call dies silent | `PROBE_FAILED:<i>` / `PROBE_SHORT:<i>:<len>:<need>` / `CALL_FAILED` grammar, asserted verbatim | `packages/guard/test/NoYeetGuard.t.sol` + `Mocks.sol` (boom, single-word getter, failSilent) |
| 6 | Anchor same batch, different root | `NOYEET/1:ANCHOR_CONFLICT`; same-root re-anchor is a no-op | `packages/guard/test/AnchorStore.t.sol` (7 tests) |

**The headline row is #2.** No calldata-level policy engine rejects `borrowMore(1.12e18)`
— the selector and arguments are identical to row #1's. The guard rejects the
*consequence*. And because prediction and enforcement are the same code path, a
broadcast of a composite whose post-state is bad **reverts atomically on-chain**:
that is the "state moves between simulate and inclusion" mitigation, demonstrated
against the live bytecode.

## 1b. On-chain rows — the guard the website uses

Environment: same fork procedure; guard `0x94FB7677358c44BB0617029a3162108Ae3aa557a`,
position `0xE1Ee5dB5Cf1f07ef9e1E361A09d5d9A6BEBe8FeE` (collateralised: HF =
collateral·LTV/debt), executor `0x1776d4d751d97c85845bf54e6ce364cec62d4bbf` — the
deployment's KeeperHub wallet. Reproduce with `scripts/chaos-fork-current.sh`.

| # | Failure induced | What the system did | Evidence |
| --- | --- | --- | --- |
| 1b.1 | Safe rebalance (repay 4.35 ETH, HF 1.38 → 1.5) | Permitted; broadcast mined | live mainnet tx `0x830860d0e8f5899ed38cdf64` status 1 (block 11476467) — this is the keeper's own `live-keeper-8` submit; `cast call` on the fork returns success shape |
| 1b.2 | Unsafe borrow 50 ETH (HF → 0.719) | **Refused atomically**; position untouched afterwards | fork: mined tx status 0; post-check `getUserAccountData` → collateral 100e18, debt 50e18, HF 1.5 unchanged; live probe of the same shape: `NOYEET/1:INV:0:1153846153846153846:1400000000000000000` |
| 1b.3 | Caller not an executor | Refused: `NOYEET/1:NOT_EXECUTOR` | `cast call --from 0x…BAD` -> revert with reason |
| 1b.4 | Keeper proposes a borrow below the floor | Refused; the guard's floor wins over the keeper's proposal | live keeper log: `tick N: … DENIED by the guard` (pre-repay run); the repay proposal was the one permitted |

The headline: the keeper that is *supposed* to rebalance cannot override the guard.
Borrow-only "rebalance" proposals were denied every tick (they would lower the HF
further); the repay-based proposal was allowed and mined. The guard, not the keeper,
is the last word.

## 2. Client rows (proven by test, KeeperHub adapter)

| # | Failure induced | Behavior | Test |
| --- | --- | --- | --- |
| 7 | HTTP 429 with `Retry-After` | Retried; server delay honored over computed backoff | `keeperhub` "429 honours Retry-After over computed backoff" |
| 8 | Cold start (5xx, `upstream_cold_start`) | Retried under the **same idempotency key**; body `retryAfterSeconds` honored | "cold start honours retryAfterSeconds from the body", "the key is sent and preserved across retries" |
| 9 | Mid-flight network death | Retried; safe only because idempotency makes a duplicate a no-op | "network failure retries under the same key" |
| 10 | Idempotency conflict (key reused, different body) | **Never** retried — a caller bug, retry cannot succeed | "key conflict is never retried" |
| 11 | Idempotency in-progress (409) | Retried, server returns the same result | "in-progress conflict is retried" |
| 12 | Nonce race (concurrent sends) | Per-wallet send serialization; a failed send cannot wedge the queue | "sends to the same target run one at a time", "a failed send does not wedge the queue" |
| 13 | Spending-cap breach (403) | Never retried; surfaced as operational, not as an unsafe position | "spending cap breach is a 403 and is never retried" |
| 14 | Wallet unfunded (validation) vs invariant revert | `failureKind: "validation"` is reported as preflight rejection, never as a broken invariant | "a validation failure is not reported as an invariant breach" |
| 15 | Unknown revert selector / foreign reason string | Parser rejects it; receipt falls back to verbatim reason | "reason parser tolerates wrapping and rejects foreign strings" |
| 16 | Retries unbounded / jitter missing | Bounded attempts, full-jitter backoff | "retries are bounded", "backoff is bounded and honours a server delay" |

## 3. Rows requiring the live organization key (not fabricated)

These need `KEEPERHUB_API_KEY` + a funded wallet; the code paths are proven in §2 and
the dashboard performs the same calls live. Induce procedure included.

| # | Failure | Induce | Where the result appears |
| --- | --- | --- | --- |
| 17 | Real 429 / real cold start against the API | Drive the keeper at high frequency; watch `noyeet_upstream_failures_total{kind="timeout"/"network"}` and `noyeet_simulation_duration_seconds` | `/api/metrics` on the live dashboard |
| 18 | Live execution ID for a guarded broadcast | `bun run keeper` (apps/keeper) with a position below the floor; the gateway returns `executionId`; the tx lands on Etherscan | dashboard "Transactions" row; `GET /v1/executions/:id` |
| 19 | HOLD -> human release/cancel with notification | Policy with `holdAbove.nativeValue` set; `DISCORD_WEBHOOK_URL`/`TELEGRAM_*` configured | `POST /v1/holds`, `POST /v1/holds/:id/release\|cancel` (tests: `gateway` hold lifecycle suite) |
| 20 | Marketplace x402 payment flow | Import `workflows/noyeet-verify.json`, wire the payment gate, publish | workflows/README.md |

## Reproduction

```bash
# §1 rows (needs foundry; fork of public Sepolia)
anvil --fork-url https://ethereum-sepolia-rpc.publicnode.com
# then the cast call/send commands in scripts/chaos-fork.sh

# §2 rows
bun test packages/keeperhub apps/gateway packages/guard  # guard is forge test

# §4 rows (needs org key)
bun run keeper && bun run anchor
```

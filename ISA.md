---
project: noyeet
task: Reliability and observability — event backbone, gateway service, tracing, breaker, SLOs
effort: E3
phase: complete
progress: 38/38
mode: build
started: 2026-08-13
updated: 2026-08-13
---

## Problem

noyeet can decide correctly and prove it cryptographically, but it cannot **run**.

Three concrete gaps, all verified by reading the tree:

1. **No service exists.** `apps/gateway/package.json` declares `start: bun run src/index.ts` and
   depends on `hono`, but `src/index.ts` does not exist and `hono` is not installed. `authorize.ts`
   is a library function nothing calls. There is no process to send an intent to.
2. **No durable event path.** A receipt is computed in memory and dropped. The Merkle anchoring the
   README describes has nowhere to read from, because nothing persists a decision between the moment
   it is made and the moment a batch is anchored. Receipts are the product; they currently evaporate.
3. **Reliability is retry-only.** `KeeperHubClient` retries with full jitter, which is correct for a
   blip and wrong for an outage: five attempts against a dead upstream burns ~20s per intent and
   multiplies load on a service already failing. There is no breaker, no DLQ, no trace, and the five
   existing alert rules are threshold alerts with no SLO or error budget behind them, and no
   Alertmanager to route them.

The observability that exists (`packages/observability`, `/api/metrics`, Prometheus + Grafana in
`infra/`) is real and stays. This work is what sits underneath it.

## Vision

An operator runs `docker compose up -d`, then `bun run --cwd apps/gateway start`, POSTs an intent,
and watches it become: a span tree in Tempo, a record on a Redpanda topic, a counter in Prometheus,
and a row in the anchor consumer's batch — with a `/readyz` that goes red the instant any dependency
it actually needs is gone, and a breaker that opens after five consecutive KeeperHub failures so the
sixth intent is refused in 1ms instead of 20 seconds.

The euphoric surprise: **the breaker is a safety feature, not just a latency feature.** When the
breaker opens, the gateway must return DENY, never ALLOW. An unavailable simulator means the future
cannot be predicted, and an unpredictable future is exactly the thing this system exists to refuse.
Every other circuit breaker in the world fails open to preserve availability; this one fails closed
to preserve the invariant, and that inversion falls straight out of noyeet's own thesis.

## Out of Scope

No managed cloud services — no Confluent, no Upstash, no hosted Tempo. The whole stack runs from one
docker-compose file on any machine, because a demo that needs four signups is not reproducible.

No change to the policy VM. `packages/policy` stays pure; tracing, events and breaker logic all live
outside it, and `scripts/check-purity.sh` must still pass unmodified.

No change to the Vercel dashboard's deploy shape. The dashboard remains a serverless Next.js app that
does not hold a Kafka connection.

No Kafka Streams, ksqlDB, schema registry, or Avro. JSON events with a version field and a hand-written
validator are sufficient at this size and carry no operational weight.

No replacement of the existing Prometheus registry with `prom-client`. The hand-rolled registry exists
because it must run on Vercel serverless; that constraint has not changed.

## Principles

**Fail closed, not open.** Every reliability mechanism added here must default to refusal. A breaker
that opens, a topic that is unreachable, a simulation that times out — each resolves to DENY. The
system's value is its refusals; degrading into permissiveness under load destroys the only property
it sells.

**One code path for predict and enforce.** The guard's core property. Nothing added here may introduce
a second path that can drift from the first — no "check mode", no cached verdict, no event-sourced
replay that could disagree with a live simulation.

**Observability describes reality or says nothing.** The existing code renders absence rather than a
stale constant. Traces, metrics and events inherit that: no synthetic spans, no placeholder series, no
event emitted for something that did not happen.

**The event log is the receipt store, not a side channel.** Receipts are already content-addressed and
Merkle-batched. A log of immutable, hash-identified records IS what Kafka is for. This is not
"add messaging"; it is giving the receipt pipeline the substrate it was designed for.

## Constraints

- Bun runtime, TypeScript, no Python. `bun`/`bunx` only, never npm/npx.
- Redpanda, not Apache Kafka — Kafka wire protocol, single binary, no ZooKeeper/KRaft ceremony.
- `packages/policy` must remain free of I/O, ambient clock, and randomness; `bun run purity` gates it.
- All new containers join the existing `infra/observability/docker-compose.yml`, one stack.
- Existing 5 alert rules and the Grafana dashboard JSON must keep working unchanged.
- Gateway must expose `/metrics` in the same exposition format the dashboard already uses, so one
  Prometheus scrape config shape covers both targets.
- No secret may appear in a span attribute, an event payload, or a log line.

## Goal

Ship a running `apps/gateway` HTTP service that authorizes intents end to end, emits every decision as
a versioned event to a Redpanda topic consumed by an anchoring service that Merkle-batches receipts,
traced with OpenTelemetry into Tempo, protected by a fail-closed circuit breaker with a dead-letter
topic, and observed through SLO recording rules with burn-rate alerts routed by Alertmanager — all
started from one `docker compose up -d` plus one `bun` process, with the policy purity gate and every
existing test still passing.

## Criteria

- [x] ISC-1: `packages/events/src/schema.ts` exists and exports `DecisionEvent` with a `v` version field
- [x] ISC-2: `packages/events/src/topics.ts` names every topic as a const, including the DLQ
- [x] ISC-3: `packages/events/src/producer.ts` exports a producer that serializes events to JSON bytes
- [x] ISC-4: Producer keys each message by `intentId` so one intent's events stay ordered in a partition
- [x] ISC-5: `packages/events/src/consumer.ts` exports a consumer with an explicit commit strategy
- [x] ISC-6: Consumer routes a message that fails N times to the DLQ topic rather than blocking the partition
- [x] ISC-7: `packages/events/src/validate.ts` rejects an event whose `v` is unknown
- [x] ISC-8: `bun test packages/events` passes
- [x] ISC-9: `packages/resilience/src/breaker.ts` exports a `CircuitBreaker` with closed/open/half-open states
- [x] ISC-10: Breaker opens after a configurable consecutive-failure threshold
- [x] ISC-11: Breaker transitions open -> half-open after a cooldown, using an injected clock
- [x] ISC-12: A single failure in half-open returns the breaker to open
- [x] ISC-13: A configurable number of successes in half-open closes the breaker
- [x] ISC-14: Breaker exposes state as a number for a Prometheus gauge
- [x] ISC-15: `bun test packages/resilience` passes
- [x] ISC-16: `KeeperHubClient` accepts an optional breaker and consults it before each request
- [x] ISC-17: Anti: an open breaker must never produce an ALLOW verdict — the gateway returns DENY
- [x] ISC-18: Existing `bun test packages/keeperhub` still passes after the breaker wiring
- [x] ISC-19: `packages/telemetry/src/tracing.ts` initializes an OTel NodeSDK with an OTLP HTTP exporter
- [x] ISC-20: Telemetry exports a `withSpan` helper that records exceptions and sets error status
- [x] ISC-21: Service name and version are set as resource attributes
- [x] ISC-22: Anti: no span attribute contains the KeeperHub API key or any `kh_`-prefixed string
- [x] ISC-23: `apps/gateway/src/index.ts` exists and starts a Hono server on a configurable port
- [x] ISC-24: `POST /authorize` accepts an intent, runs the pipeline, returns verdict + digest
- [x] ISC-25: `GET /healthz` returns 200 whenever the process is alive
- [x] ISC-26: `GET /readyz` returns 503 when a required dependency is unavailable
- [x] ISC-27: `GET /metrics` returns Prometheus exposition text
- [x] ISC-28: Gateway emits a `DecisionEvent` for every verdict including DENY
- [x] ISC-29: Gateway config reads from env with explicit validation and fails fast on a missing key
- [x] ISC-30: `apps/anchor/src/index.ts` consumes the decisions topic and builds a Merkle tree per batch
- [x] ISC-31: Anchor service logs the batch root and leaf count on flush
- [x] ISC-32: `docker compose config` validates the extended compose file
- [x] ISC-33: Compose defines a `redpanda` service with both internal and host-reachable listeners
- [x] ISC-34: Compose defines `redpanda-console`, `alertmanager`, `tempo`, and an OTel collector
- [x] ISC-35: `infra/observability/rules/slo.yml` defines recording rules for availability and latency
- [x] ISC-36: Burn-rate alerts exist for both a fast and a slow window
- [x] ISC-37: `infra/observability/alertmanager.yml` routes critical and warning severities differently
- [x] ISC-38: Anti: `bun run purity` still reports the policy VM pure after all changes

## Test Strategy

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| 1-7 | file | symbol present in source | exact match | Grep |
| 8 | unit | events test suite green | 0 failures | Bash `bun test` |
| 9-14 | file+unit | breaker state machine behavior | 0 failures | Bash `bun test` |
| 15 | unit | resilience suite green | 0 failures | Bash `bun test` |
| 16-18 | integration | keeperhub suite green post-wiring | 0 failures | Bash `bun test` |
| 19-22 | file | OTel symbols present, no secret in attrs | 0 hits for `kh_` | Grep |
| 23-29 | http | live curl against started gateway | expected status+body | Bash `curl -i` |
| 30-31 | file+run | consumer builds tree, logs root | root is 0x + 64 hex | Read + Bash |
| 32-34 | config | compose parses and names services | exit 0 | Bash `docker compose config` |
| 35-37 | config | promtool check rules | exit 0 | Bash `promtool`/`docker run` |
| 38 | gate | purity script exit code | exit 0 | Bash `bun run purity` |

## Features

| name | satisfies | depends_on | parallelizable |
|------|-----------|------------|----------------|
| events package | ISC-1..8 | — | yes |
| resilience package | ISC-9..15 | — | yes |
| telemetry package | ISC-19..22 | — | yes |
| keeperhub breaker wiring | ISC-16..18 | resilience package | no |
| gateway service | ISC-23..29 | events, telemetry, resilience | no |
| anchor consumer | ISC-30..31 | events package | no |
| compose + SLO + alertmanager | ISC-32..37 | — | yes |
| purity regression gate | ISC-38 | all | no |

## Decisions

**2026-08-13 — Redpanda over Apache Kafka.** Kafka wire protocol compatible, single binary, no
separate coordination service. One container instead of two, and `kafkajs` cannot tell the difference.

**2026-08-13 — Breaker fails closed.** Standard breaker doctrine sheds load by failing fast, and the
usual pairing is a permissive fallback. Here the fallback must be DENY. Rationale recorded because it
inverts the pattern most reviewers will expect: an unreachable simulator means the post-state is
unknown, and noyeet's entire thesis is that an unknown post-state is not authorizable.

**2026-08-13 — Events keyed by `intentId`.** Partition-level ordering per intent is the only ordering
guarantee needed; global ordering would force a single partition and cap throughput for no benefit.

**2026-08-13 — the fail-closed breaker is a hostage condition, and that is accepted deliberately.**
Raised by the advisor at the VERIFY boundary and worth recording rather than hiding: because the
breaker denies while open, anyone able to induce sustained transport faults against KeeperHub gets a
cheap targeted denial of service, and denial is not a neutral outcome — a missed liquidation or an
un-topped margin position costs real money. The trade is still correct for this system, because
authorizing an unpredictable transaction is the one failure it exists to prevent, but the cost is
real. Two mitigations are deliberately NOT built here and are named as follow-up work: a break-glass
path with human authority audited into the same Merkle log, and bulkheading the breaker per chain or
per simulator instead of one global instance. Today a single degraded upstream halts every chain.

**2026-08-13 — advisor findings triaged, three adopted and the rest scoped out.**
Adopted: DLQ rate as a fraction of ingress rather than depth (`DeadLetterRateHigh`), an inverse
alert for a breaker that never opens despite sustained faults (`BreakerNotTrippingDespiteFailures`),
and a scrape deadman (`GatewayScrapeMissing`). Checked and already correct: an empty invariant set
fails closed via the `minInvariants` rule, verified live returning `TOO_FEW_INVARIANTS`; span
attributes carry no address, amount or key. Scoped out as belonging to noyeet's existing semantic
design rather than to this reliability work: signer-side verification, invariant-set integrity
gating, decision TTL and reorg handling, and log tamper-evidence via signed checkpoints.

**2026-08-13 — show your math, delegation floor not met (0 vs E3 soft floor of 2).** The E3 delegation
floor is soft and is being deliberately skipped. A Forge or Anvil pass would have independently drafted
the breaker state machine and the compose topology. Skipped because the harness rule in force this
session is "do not call the Agent tool unless the user requested it", and the user did not. The
substituted control is the Advisor call at VERIFY plus the full test-and-probe matrix in Test Strategy,
which checks the same surfaces empirically rather than by second opinion.

## Verification

ISC-1..7: Grep — `packages/events/src/` holds topics.ts, schema.ts (`EVENT_VERSION = 1`), validate.ts, producer.ts, consumer.ts.
ISC-4: live probe — `rpk topic consume` printed `itn_e2e_1 -> {...}`, key equals intentId.
ISC-8: `bun test packages/events` — 10 pass, 0 fail, 20 expect() calls.
ISC-9..15: `bun test packages/resilience` — 14 pass, 0 fail, 35 expect() calls, closed/open/half-open all exercised on an injected clock.
ISC-16..18: `bun test packages/keeperhub` — 28 pass, 0 fail (21 pre-existing + 7 new). A 400 carrying `wouldRevert` leaves the breaker closed after 5 attempts; three 503s open it.
ISC-17: live — an intent passing every static rule, with `KEEPERHUB_BASE_URL=http://127.0.0.1:9`, returned `502 DENY`, `502 DENY`, then `503 {"verdict":"DENY","reason":"SIMULATOR_UNAVAILABLE"}` with `retry-after: 60`. Never ALLOW.
ISC-19..21: live — `withSpan` returned traceparent `00-d9445e5b0fdc7ebf68e9759cfaf297dc-9691bb414ac36813-01`, matching the W3C shape; the error path recorded and rethrew.
ISC-22: Grep — span attributes are only `noyeet.intent_id`, `noyeet.chain_id`, `noyeet.verdict`, `noyeet.digest`. No key, address, or amount. Zero `kh_` literals outside tests.
ISC-23..27: live curl — `/healthz` 200, `/readyz` 200 then 503 once the circuit opened while `/healthz` stayed 200, `/metrics` 200 with `content-type: text/plain; version=0.0.4`, 0 malformed sample lines.
ISC-24: `POST /authorize` returned 403 with digest `0x79bc33b4...d084` (32 bytes) and `simulation: null`, confirming the static DENY short-circuits before preflight.
ISC-28: live — three intents produced three records on `noyeet.decisions.v1`, each carrying verdict, digest, policyHash and reasons.
ISC-29: live — booting without `KEEPERHUB_API_KEY` exited 78 (EX_CONFIG) naming every missing key at once.
ISC-30..31: live — anchor consumer logged `batch sealed root=0xdac7d41a...d2e9 leaves=3`; the root was independently recomputed from the three leaves with `buildTree` and matched.
ISC-6: live — a `v:99` record and a malformed-JSON record both landed on `noyeet.dead-letter.v1` with `payloadBase64` intact; the very next intent was consumed normally, so the partition never wedged.
ISC-32..34: `docker compose config -q` exit 0; services redpanda, redpanda-console, otel-collector, tempo, alertmanager present; Redpanda healthcheck reached `healthy`.
ISC-35..36: `promtool check rules` — 19 rules found in rules/slo.yml, 5 in alerts.yml. `promtool check config` — valid, 2 rule files.
ISC-37: `amtool check-config` — SUCCESS, 1 inhibit rule, 3 receivers.
ISC-38: `bun run purity` — "OK: policy VM is pure".
Regression: `bun test packages apps/gateway` — 117 pass, 0 fail, 787 expect() calls. `tsc --noEmit` clean in all five new packages.

## Changelog

**2026-08-13 — the observability package's own API is inconsistent, and it cost a bug.**
- conjectured: metric call sites would be caught by the type checker, so writing them from memory was safe.
- refuted_by: `/metrics` rendered `noyeet_breaker_state [object Object]` on the first live probe. `Counter.inc(labels, amount)` takes labels first, but `Gauge.set(value, labels)` and `Histogram.observe(value, labels)` take the value first. Seven call sites were written with the wrong order, and typecheck had not been run yet.
- learned: an inconsistent argument order inside one package is a latent defect generator. The live `/metrics` probe caught it in one request; no unit test would have, because the tests assert on the registry rather than on rendered exposition text.
- criterion_now: ISC-27 is verified by grepping the rendered output for `[object`, `NaN` and `undefined`, not merely by a 200 status.

**2026-08-13 — a tracing outage was one line from becoming a service outage.**
- conjectured: the OTel exporter degrades silently when no collector is listening.
- refuted_by: `shutdownTelemetry()` under Bun crashed the process from inside `node:_http_client` during the final flush with nothing on :4318.
- learned: an exporter's shutdown path is not covered by its runtime resilience. Flush-on-exit is a distinct failure surface.
- criterion_now: `shutdownTelemetry` takes an `onError` callback, swallows the flush rejection, and is probe-verified to leave the process alive.

**2026-08-13 — capping retries on an idempotent producer silently voids exactly-once.**
- conjectured: `retry: { retries: 3 }` alongside `idempotent: true` was a reasonable bound.
- refuted_by: kafkajs logged "Limiting retries for the idempotent producer may invalidate EoS guarantees" on connect.
- learned: for an idempotent producer the retry budget must be unbounded in count and bounded in time; `maxRetryTime` is the correct knob and `retries` is not.
- criterion_now: the producer sets `maxRetryTime` only, with the reasoning recorded at the call site.

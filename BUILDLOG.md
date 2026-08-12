# noyeet: what has been built

A record of the system as it stands, why each piece exists, and what is still unproven.
Written to be read by someone who did not build it.

## The idea in one paragraph

An agent holding a private key is an unbounded liability: it decides, it signs, it
broadcasts, and nothing in between can tell it no. Existing guardrails evaluate calldata,
which is what the agent *claims* it will do. noyeet evaluates what will actually happen. A
guard contract executes the agent's calls, then asserts post-state and reverts if a bound
breaks. Simulating that composite predicts the outcome; broadcasting the identical
composite enforces it. Prediction and enforcement are the same code path, so they cannot
drift.

## Layout

```
packages/
  guard           NoYeetGuard.sol: execute the calls, then assert. Foundry fuzzing.
  policy          The decision VM. Pure: no I/O, no clock, no randomness.
  receipts        RFC 8785 canonical JSON, keccak256, sorted-pair Merkle trees.
  keeperhub       Typed adapter: idempotency, retry, per-wallet send serialization.
  store           Receipt persistence. Postgres when DATABASE_URL is set, memory otherwise.
  events          Versioned decision events over the Kafka protocol, with a dead-letter path.
  resilience      A circuit breaker that fails closed.
  telemetry       OpenTelemetry spans, and the traceparent linking a record to its trace.
  observability   A dependency-free Prometheus registry that runs on serverless.

apps/
  gateway         The authorization HTTP surface. Policy, simulation, holds, receipts.
  anchor          Consumes decisions, Merkle-batches them, publishes roots.
  dashboard       Landing page, policy canvas, and the live dashboard route.
  keeper          The example agent that drives the whole thing.
  verifier        A static receipt verifier, pinned by test to agree with the library.

infra/observability   One compose stack: Prometheus, Grafana, Redpanda, Tempo, an OTel
                      collector, Alertmanager, and the Redpanda console.
```

## The guard

`executeGuarded(Call[], Invariant[])` snapshots the readings an invariant needs, runs the
calls, then asserts. Five operators: `GTE`, `LTE`, `EQ`, `REL_DEC_MAX`, `REL_INC_MAX`.

It reverts with `Error(string)` rather than a custom error. KeeperHub documents decoding
`Error(string)` into `revertReason`; custom-error decoding is not documented, and a denial
reason has to survive the round trip into a receipt. Guaranteed decodability beats nicer
Solidity, and it costs gas only on paths that already revert. The grammar is version
pinned so a parser can reject shapes it does not understand:

```
NOYEET/1:INV:<index>:<got>:<want>
NOYEET/1:PROBE_FAILED:<index>
NOYEET/1:NOT_EXECUTOR
```

A failing inner call bubbles the target's own revert data verbatim, because the protocol's
message is more useful than anything the guard could synthesise.

The admin can only rotate executors. It cannot move funds or bypass an invariant.

## The policy VM

Twelve rules, three verdicts, evaluated in a fixed order so receipts are reproducible.
DENY dominates HOLD; HOLD dominates ALLOW. Every reason is returned, not just the first,
so an operator sees every problem at once.

Two-state authorization forces a bad trade: strict policy blocks legitimate work, loose
policy admits attacks. HOLD is the third state that makes the system deployable. The agent
keeps moving on everything routine, and anything unusual reaches a human with the
consequence already computed.

`scripts/check-purity.sh` fails the build on any `node:` or `fs` import, `process.env`,
`Date.now()`, or `Math.random()` inside `packages/policy`. That is both the testability
argument and the security argument: the component that decides cannot be influenced by
anything except its inputs. The clock and history are injected.

The agent's `rationale` field is carried for the audit trail and is deliberately
unreachable from any decision function. Prompt injection has nothing to reach.

## Reliability

### The circuit breaker fails closed

Every circuit breaker in general use fails *open*: when a dependency is sick, stop calling
it and serve a degraded but permissive fallback, because availability is the thing being
protected. That trade is wrong here.

The dependency noyeet protects is the simulator, and the simulator is what says whether a
transaction would break an invariant. If it cannot be reached, the post-state is unknown,
and an unknown post-state is precisely what this system exists to refuse. So the fallback
is DENY. Load shedding and the safety property turn out to be the same action.

What counts as a failure is equally load bearing. Only transport faults trip it: timeouts,
socket death, 5xx, rate limiting. A simulated revert is a *successful prediction*, and
counting it would hand an attacker a denial of service: submit unsafe intents until the
breaker opens.

The clock is injected, so the cooldown transition is tested without sleeping.

### The event log

Decisions are published to Redpanda, keyed by `intentId` so every event about one intent
stays ordered within its partition. `acks: -1`, because a receipt absent from an anchored
root is indistinguishable from one that never existed; durability beats latency when the
record *is* the product.

The consumer has an explicit poison-message policy. The default behaviour of every Kafka
client is to retry a failing message forever, which blocks the partition: one malformed
record halts every good record behind it, and the outage looks like a stall rather than an
error. Instead, bounded retries, then the record goes to the dead-letter topic with its
original bytes preserved as base64, and the offset is committed so the partition moves on.
Nothing is auto-replayed out of the DLQ, because a poison message replayed on a timer is
just a slower infinite loop.

### Health and readiness answer different questions

`/healthz` says whether to restart the process. `/readyz` says whether to route traffic to
it, and reports the breaker as a dependency: while it is open the gateway cannot produce an
ALLOW for anyone. Wiring liveness to a dependency is how a dependency blip becomes a
restart loop.

Config is validated at boot. The process exits 78 naming every missing variable at once,
rather than failing on the first request that happens to need one.

## Observability

The Prometheus registry is hand written rather than `prom-client`, because it has to run on
Vercel's serverless runtime with no native build step, and the exposition format is a few
hundred lines of well-specified text.

`infra/observability/alerts.yml` holds threshold alerts, which answer "is something broken
right now". `rules/slo.yml` adds recording rules and multi-window burn-rate alerts, which
answer "are we spending the reliability budget faster than we can afford". Two SLOs, both
stated against what an agent actually experiences:

- **Availability, 99.5%** of requests return a verdict. A DENY is a verdict. Counting a
  refusal against availability would measure the wrong thing entirely: the system worked.
- **Latency, 99%** within 2.5s, above which an agent's own timeout fires and a slow verdict
  becomes indistinguishable from no verdict.

Alertmanager routes critical separately from warning, and inhibits latency warnings while
the guard is not enforcing at all, so the page is unambiguous.

## The frontend

### The policy canvas

The signature of the site. Drag blocks onto a surface and the two artifacts they compile to
appear beside them: a policy document for the gateway and the invariant tuples that go into
`executeGuarded`. It is not an illustration of a builder. It is the builder, it works on
first paint, and the payloads it renders are real. The compiler was checked against the
live probe path and emits byte-identical calldata.

`lib/canvas/compile.ts` is pure, like the policy VM it feeds, so it is testable on its own
and the canvas stays a thin rendering layer over it.

Three decisions worth naming:

- **Dragging is not the only way to place a block.** Every palette entry is also a real
  button. A drag-only builder is unusable for a meaningful share of people, and it costs
  one `onClick` to avoid.
- **Policy blocks and invariant blocks look different**, by shape as well as colour, because
  they are enforced by different machinery at different moments. An operator who cannot tell
  them apart will eventually believe a bound is enforced on chain when it only ever lived in
  a config file.
- **Motion owns the drag transform**, so position is never React state during the gesture.

### What was removed, and why

The landing page arrived as a SaaS template. Several sections were not merely generic, they
were untrue, and a security product that invents its own social proof is a strange thing:

- **Testimonials** carried quotes attributed to "The guard" and "The suite" at "Sepolia" and
  "Foundry". Those are not customers.
- **Pricing** listed three tiers at $0 for an MIT library, with the middle one marked
  "popular".
- **A logo wall** of plain text wordmarks presented as customer proof.
- **A headline that faded in on scroll**, which renders an empty hero whenever the reveal
  does not fire.
- **A sun-and-moon toggle**, replaced by three labelled options, which can also express the
  system default that a two-state switch cannot.
- **Fake nav**: "Products" and "Resources" dropdowns describing pages that do not exist, and
  a header CTA duplicating the hero's.

The live probe below the hero is stronger evidence than any of it: it runs two real
simulations against the deployed guard on every request and shows what the chain said.

## Defects found by looking, not by testing

Recorded because the pattern matters more than the individual bugs. Every one of these
passed the type checker and the test suite.

| Found | Defect |
| --- | --- |
| First `/metrics` scrape | `Gauge.set` and `Histogram.observe` take value first while `Counter.inc` takes labels first. Seven call sites rendered `[object Object]`. |
| Process exit with no collector | The OTLP exporter's final flush crashed the process from inside `node:_http_client`. A tracing outage was one line from being a service outage. |
| kafkajs boot log | Capping retries on an idempotent producer silently voids exactly-once. `maxRetryTime` is the correct knob. |
| Browser screenshot | The theme control was clipped by the fixed 10px frame, rendering as "ght Dark Auto". |
| Browser screenshot | The fixed header sat over the hero headline and shaved the caps off the first line. |
| Browser screenshot | Canvas blocks overlapped, because seed positions assumed a uniform block height that in fact grows with field count. |
| Reading my own edit | A colour token applied to the wrong surface twice: `--card-primary` is lime in both themes so its ink must not flip, while `bg-background` does flip so its ink must. |
| Reading the plan against reality | The footer was assumed broken and was already correct. Checking first avoided breaking working contrast. |

## Verified

- 164 tests pass, 0 fail. The policy purity gate reports the VM pure.
- `docker compose config`, `promtool check rules` (19 rules), `promtool check config`, and
  `amtool check-config` all pass.
- **Fail-closed, proven live.** An intent passing every static rule, against an unreachable
  simulator, returned `502 DENY`, `502 DENY`, then `503 SIMULATOR_UNAVAILABLE` with a
  `Retry-After` header. Never ALLOW.
- **End to end, proven live.** Three intents produced three records on
  `noyeet.decisions.v1`; the anchor consumer sealed root `0xdac7d41a...d2e9`; that root was
  independently recomputed from its leaves and matched.
- **Dead-letter, proven live.** A `v:99` record and a malformed-JSON record both landed on
  the DLQ with their bytes intact, and the next intent processed normally. The partition
  never wedged.
- The canvas renders server-side, so its content is never gated behind an animation.
- Zero emojis in the codebase.

## Not yet verified, and known gaps

Stated plainly so nobody mistakes this for finished work.

- **The theme control has not been confirmed working in a browser.** The code is correct and
  the next-themes config matches the CSS selector, but two attempts to click it in a live
  page did not visibly switch the theme, and the browser connection dropped before the
  question could be settled. Most likely the clicks missed a small target across a viewport
  resize. Confirm before shipping.
- **Light mode is unproven.** The theme-lock work was reasoned from the tokens, not observed.
- **Mobile widths are unproven.** No screenshot below the desktop breakpoint.
- **The canvas has not been driven end to end by a real pointer**: drag, edit, delete,
  keyboard traversal.
- **The breaker is global, not bulkheaded.** One degraded upstream halts every chain.
- **There is no break-glass path.** Fail-closed is a hostage condition: anyone who can induce
  sustained transport faults gets a cheap targeted denial of service, and denial is not a
  neutral outcome for a margin position. A human override, audited into the same Merkle log,
  is the mitigation and it is not built.
- **Anchoring is deployed but not exercised.** `AnchorStore` is on Sepolia; the first anchor
  needs the org key and a populated receipt store.
- **The residual assumption:** noyeet cannot force an agent to route through it. It replaces
  key custody with permit issuance, so an agent that never held a key has no path around the
  guard. That is the whole security argument.

## Running it

```bash
cd infra/observability
docker compose up -d
docker exec noyeet-redpanda rpk topic create \
  noyeet.decisions.v1 noyeet.anchors.v1 noyeet.dead-letter.v1 -p 3

cp .env.example .env        # add KEEPERHUB_API_KEY
bun install
bun test                    # 164
bun run purity

bun run --cwd apps/gateway start
bun run --cwd apps/anchor start
bun run --cwd apps/dashboard dev
```

`infra/observability/README.md` has the full runbook, including how to reproduce the
fail-closed behaviour deliberately.

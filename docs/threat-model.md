# noyeet — threat model

The adversary this system exists to contain is the agent itself: a model that can
reason, hold context, and act through a key. Everything else — a hostile data source,
an MEV bot, an operator error — is a variant of the same question: can something that
is not the owner move the owner's assets?

The answer this system commits to: **no**. An agent never holds a key; it holds a
permit, and the permit is only valid while the chain says the resulting state is safe.

## Trust boundaries

```
 agent (untrusted)            gateway (trusted-ish)           chain (trusted)
 ────────────────             ────────────────────           ────────────────
 intent + rationale   ->      policy VM (pure)        ->      simulate
                              │ ALLOW / HOLD / DENY          guard-wrapped call
                              │ (rationale never read)       at inclusion, the
                              ▼                              guard asserts again
                            broadcast (ALLOW only)
```

- **The model is untrusted input.** The `rationale` field is metadata: no rule reads
  it, and it is excluded from the intent hash (authorize.ts) so rewording cannot
  change the receipt.
- **The gateway is a trusted compute boundary** (it holds the API key), but it cannot
  fabricate a pass: an ALLOW requires the guard's simulation to say so, and the
  broadcast is the same composite that was simulated.
- **The chain is the final judge.** Prediction (simulation) and enforcement
  (broadcast) are the same code path, so state moving between the two makes the
  transaction revert rather than execute unsafely.

## Adversaries and mitigations

| Adversary | Attack | Mitigation |
| --- | --- | --- |
| Compromised agent | Signs anything the policy allows | Target/selector allowlist, value caps, rate limits, gas ceiling, min-invariant requirement (policy rules) |
| Prompt injection via a data source | Produces calldata that *looks* safe | Recipient allowlist AND post-state invariants asserted by the guard; the invariant is measured, not claimed |
| Oracle manipulation | Feeds a fake price so a bad call simulates clean | Guard asserts post-state at inclusion against the live contract state, not against the agent's claim |
| MEV between simulate and inclusion | Front-runs the rebalance so the post-state is bad | The guard runs the same assertion on-chain; a broken bound reverts the whole transaction |
| Rogue executor key | Uses the key outside the guard | The executor can only move assets through `executeGuarded` (contract design); invariants still assert |
| Operator rewrites policy after the fact | Changes rules and pretends they were in force | `policyHash` is committed onchain before the run and carried in every receipt |
| Operator falsifies logs | Claims a denial that never happened | Receipt digests are canonical (RFC 8785 + keccak256) and batch-anchored to AnchorStore; a receipt absent from the committed root did not exist |
| Replay / double-execution | Re-sends the same intent | KeeperHub idempotency keys; the gateway derives them from the intent id; AnchorStore re-anchor with the same root is a no-op |

## What noyeet deliberately does not protect against

- **An agent that does not route through noyeet.** The residual assumption, stated in
  the README: this replaces key custody with permit issuance; it cannot force a caller
  to use it.
- **A policy that is wrong.** The guard enforces the declared invariants; if the
  operator sets a floor of 0, the floor is 0. Policy review is a human job.
- **A compromised operator gateway.** The gateway holds the API key and could refuse
  to route an intent (availability), but it cannot make an unsafe intent simulate
  clean — the guard is on-chain and the simulation is the real chain call.
- **Social engineering of the human gate.** HOLD exists so a human decides unusual
  actions; noyeet does not evaluate the human's decision.

## Fail-closed behavior

- Missing env at gateway boot -> process exits naming the variables (no degraded mode).
- No API key on the dashboard -> probe and ledger say `live: false` with the reason;
  recorded values are never served dressed as live ones.
- Probe reverts -> DENY with the invariant named; a preflight rejection
  (`failureKind: "validation"`) is reported as an operational problem, never as a
  broken invariant.
- Store write fails -> the decision is still returned, with `persisted: false`, so a
  lost receipt is never mistaken for a stored one.

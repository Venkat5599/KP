# noyeet — operations runbook

## Rollback

- **Contracts are immutable by design** (no proxy). There is nothing to roll back
  on-chain: a bug in the guard requires a new deployment plus a fund migration from
  the old guard to the new one. The old guard's `admin` can remove executors, which
  freezes the old contract while migration happens.
  - Freeze: `setExecutor(<executor>, false)` as admin on the old guard.
  - Migrate: move assets to the new guard, set its executors, update
    `NOYEET_GUARD_ADDRESS` / dashboard `GUARD_ADDRESS` in the same release.
- **Dashboard / gateway** are stateless deployments. Rollback = redeploy the previous
  build (Vercel: previous deployment; gateway: previous image/process). The gateway
  keeps no state that a restart loses — receipts live in the store (Postgres), holds
  in memory (a restart clears the waiting queue; pending intents re-submit with the
  same idempotency keys and are deduplicated by KeeperHub).

## Incident response

1. **KeeperHub upstream failing** — check `noyeet_keeperhub_authenticated` (0 = bad
   key, alert fires as a misconfiguration, not a scrape failure) and
   `noyeet_upstream_failures_total` by kind. A `validation` failureKind means an
   unfunded wallet or a spending cap, not an unsafe position.
2. **Guard refusing everything** — `noyeet_guard_healthy` asserts both directions
   (safe intent permitted AND unsafe intent refused); 0 with both probes failing
   means the guard or its target is unreachable, not that the position collapsed.
3. **Hold queue backing up** — `GET /v1/holds` on the gateway; each held intent has
   its receipt and digest. Release or cancel per the operator's judgment; the guard
   still asserts at inclusion, so a mistaken release cannot breach the bounds.
4. **Anchor backlog** — run `bun run anchor`; it is idempotent per batch and
   re-running after a failure anchors only unanchored receipts.

## Recovery drills

- Boot the gateway with no env → it must exit non-zero naming the missing variables.
- Restart the gateway with a live Postgres store → receipts survive; holds do not
  (by design); re-submitted intents deduplicate.
- Verify a receipt offline in the static verifier app with the dashboard down —
  proves verification is not server-dependent.

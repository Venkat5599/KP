# create-noyeet-agent

The one-command starter: from a clean machine to a guarded, landed testnet
transaction. The agent never holds a key — it asks the gateway for a permit, and the
permit is only granted when the guard's simulation of the actual consequence passes.

## One command (after one setup)

```bash
bun install
cp .env.example .env   # fill GATEWAY_URL (+ KEEPERHUB_API_KEY for the broadcast step)
bun run start
```

What it does, in order:

1. Builds a guard-wrapped intent (a health-factor rebalance) for the addresses in `.env`.
2. `POST /v1/authorize` — the gateway runs the policy VM, then a **real guard
   simulation** through KeeperHub. Prints verdict + receipt digest.
3. If ALLOW and `KEEPERHUB_API_KEY` is set: `POST /v1/execute` broadcasts the same
   composite under an idempotency key. Prints the execution id and tx.

If the verdict is HOLD or DENY, nothing is broadcast — the receipt is the output.

## What "guarded, landed" means

The gateway's policy must permit the intent (target/selector allowlist, caps, rate
limits), and the guard's on-chain assertion must hold after the simulated execution
(`healthFactor >= floor`). Both must pass for an ALLOW. Broadcasting the same
composite enforces the identical assertion at inclusion, so state moving between the
two reverts the transaction instead of doing damage.

## Honest prerequisites

- A running noyeet gateway (`bun run start` in `apps/gateway`, or a deployed one).
- A KeeperHub org API key with a funded wallet **registered as an executor on your
  guard** — this template uses the repo's deployed Sepolia guard by default; point
  the env at your own deployment for anything beyond the demo.
- The broadcast is a real testnet transaction. It costs testnet gas only.

## Test

```bash
bun test
```

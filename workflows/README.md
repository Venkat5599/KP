# noyeet/verify — marketplace workflow

A paid, callable KeeperHub workflow that verifies a noyeet receipt for another agent
and returns a verdict. The caller pays per call (x402 + MPP with client auto-select);
noyeet does not hold keys for it, so there is nothing to compromise.

## What it does

1. Receives a receipt document (and optionally a claimed digest) from the calling agent.
2. Calls the noyeet gateway's `POST /v1/verify`, which recomputes the RFC 8785
   canonical form + keccak256 digest — the same computation as the receipts package,
   the dashboard verifier, and the static verifier app.
3. Returns `{ digest, matches }`, where `matches` is `null` when no claim was given
   and `true`/`false` when one was.

The response is the digest plus the comparison — never the receipt's verdict, because
the receipt is already evidence; the job of verify is only to confirm the receipt is
genuine.

## Files

| Path | Purpose |
| --- | --- |
| `noyeet-verify.json` | Workflow definition, exported in the KeeperHub visual-builder format. Import it in the builder, then wire the payment gate. |
| `policies/demo-policy.json` | The demo policy used by `create-noyeet-agent`. |

## Importing (one-time, needs the org API key)

1. KeeperHub app → Workflows → Import → `noyeet-verify.json`.
2. Set the workflow env `NOYEET_VERIFY_ENDPOINT` to the deployed gateway's URL
   (e.g. `https://gateway.example.com`); the workflow calls
   `POST {NOYEET_VERIFY_ENDPOINT}/v1/verify`.
3. Enable the payment gate on the workflow (paid per call, x402 + MPP). This is a
   builder setting, not part of the JSON export.
4. Publish to the marketplace.

This definition was authored from the documented workflow schema and validated against
the gateway's real `/v1/verify` route (tested in `apps/gateway`). The paid listing
itself requires the org account, which this repo does not contain — the definition is
the deliverable; the click-through is the operator's.

## Testing the compute step without the builder

```bash
bunx --bun tsc -p apps/gateway/tsconfig.json --noEmit && cd apps/gateway && bun test
# or, against a running gateway:
curl -s -X POST http://localhost:3000/v1/verify \
  -H 'content-type: application/json' \
  -d '{"receipt":{...},"claimedDigest":"0x…"}'
```

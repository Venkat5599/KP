# noyeet

**Your agent can't yeet your money.**

Agents don't get keys. They get permits, decided by what the chain says will happen and
enforced atomically when it does.

Live: <https://dashboard-nu-two-93.vercel.app>
Guard: [`0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f`](https://sepolia.etherscan.io/address/0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f)

---

## The problem

An autonomous agent holding a private key is an unbounded liability. It decides, it signs,
it broadcasts, and nothing between those three steps can tell it no.

Existing guardrails — Turnkey policies, Safe module roles, ERC-7715 session keys — all
evaluate **calldata**. Calldata is what the agent *claims* it will do. It is not what will
happen.

Here are two calls. Same contract, same function, same argument type. Every calldata-level
policy engine passes both:

```
executeGuarded([...]) -> borrowMore(1500000000000000000)
executeGuarded([...]) -> borrowMore(1120000000000000000)
```

The second drains a lending position below its liquidation threshold. Nothing in the bytes
says so.

## The mechanism

KeeperHub's `simulate: true` returns a gas estimate and a revert flag, but no state diff, so
post-state cannot be read directly.

So invert it. **Express every invariant as a revert condition inside the transaction
itself.** A guard contract executes the agent's calls, then asserts post-state and reverts
if a bound breaks.

- **Simulate** that composite: a revert means the future is bad, so the transaction is
  denied before it exists.
- **Broadcast** the same composite: the identical assertion enforces on chain. If state
  moves between simulation and inclusion, the transaction reverts instead of doing damage.

Prediction and enforcement are the same code path. There is no separate check mode that can
drift from the enforcement path, which is a class of bug this design cannot have.

## It works, and here is the proof

Both responses came from the live KeeperHub API against the deployed guard:

| Intent | Response |
| --- | --- |
| `borrowMore(1.5e18)` | `200`, `wouldRevert: false`, gas `52667` |
| `borrowMore(1.12e18)` | `400`, `failureKind: "revert"`, `Error(NOYEET/1:INV:0:1120000000000000000:1400000000000000000)` |

The denial names the violated invariant by index, with the observed and required values.

Run it yourself:

```bash
curl https://dashboard-nu-two-93.vercel.app/api/probe
```

That endpoint runs both simulations on every request. Nothing is cached or replayed.

## Transactions

| What | Hash |
| --- | --- |
| Agent transfer, executed through KeeperHub | [`0xf2a08944...a2477`](https://sepolia.etherscan.io/tx/0xf2a08944a35b01174a06f620860dd3c21215f80bff996cec1fe27ba59caa2477) |
| Guard deployment | [`0x75a17782...5e13f`](https://sepolia.etherscan.io/tx/0x75a17782e2bf0f266854891c8a40bc0a75de38a82d2346a1605391e5c4a5e13f) |
| Target the invariant reads | [`0xf9ea685f...08757`](https://sepolia.etherscan.io/tx/0xf9ea685f7103913c399ee96b7dcee4a044bc17e5e374150a7d2a784222f08757) |

The first was simulated clean, then broadcast under an idempotency key. Execution id
`ygfgqeispq6jac5psm9t1`, status `completed`.

## Architecture

```
agent (any framework)
   |  intent envelope
   v
policy VM ......... pure TypeScript. No I/O, no clock, no model.
   |               allowlists, value caps, rate limits, approval bounds
   v  ALLOW
preflight ......... guard-wrapped executeGuarded, simulate: true
   |               revert => DENY, and the reason names the invariant
   v  no revert
executor .......... KeeperHub: gas, retry, nonce, Turnkey custody
   v
NoYeetGuard ....... execute calls, assert post-state, revert atomically
   v
chain
```

Every path, including refusals, produces a receipt: canonical JSON, keccak256 digest,
Merkle-batched and anchored on chain. A blocked attack becomes permanent evidence.

### Verdicts

Two-state authorization forces a bad trade: strict policy blocks legitimate work, loose
policy admits attacks. There are three.

- **ALLOW** — static rules pass, simulation passes, invariants hold.
- **HOLD** — legal but unusual. Signed and held via Tempo, owner notified with the simulated
  outcome attached, released on approval or cancelled on timeout.
- **DENY** — a rule failed or the guard reverted in simulation. No broadcast.

HOLD is what makes the system deployable. The agent keeps moving on everything routine;
anything unusual reaches a human with the consequence already computed.

## Packages

| Package | What it does |
| --- | --- |
| `packages/guard` | `NoYeetGuard.sol`: execute, then assert. Foundry invariant fuzzing. |
| `packages/policy` | Pure decision engine. 11 rules, three verdicts, zero I/O. |
| `packages/receipts` | RFC 8785 canonicalization, keccak256, sorted-pair Merkle trees. |
| `packages/keeperhub` | Typed adapter: idempotency, retry, per-wallet send serialization. |
| `apps/dashboard` | Landing page, live guard panel, in-browser receipt verifier. |
| `apps/gateway` | Authorization pipeline composing policy, simulation, and receipts. |

## Tests

```bash
bun test                          # 72 across policy, receipts, keeperhub
cd packages/guard && forge test   # 15, including 1024 fuzz runs
bun run purity                    # CI gate: the policy VM must stay pure
```

87 tests, zero failing.

The purity gate is not decorative. It fails the build on any `node:` or `fs` import,
`process.env`, `Date.now()`, or `Math.random()` inside `packages/policy`. That is both the
testability argument and the security argument: the component that decides cannot be
influenced by anything except its inputs.

## Quickstart

```bash
git clone https://github.com/Venkat5599/KP.git noyeet && cd noyeet
bun install
cp .env.example .env      # add your KeeperHub organisation API key (kh_...)
bun test
```

Deploy your own guard:

```bash
cd packages/guard
forge create src/NoYeetGuard.sol:NoYeetGuard \
  --rpc-url "$SEPOLIA_RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast \
  --constructor-args "[<your KeeperHub wallet address>]"
```

The deployer becomes admin and can **only** rotate executors. It cannot move funds or bypass
an invariant. Your KeeperHub wallet becomes the executor and can only move value through
`executeGuarded`.

## The revert grammar

The guard reverts with `Error(string)` rather than a custom error. KeeperHub documents
decoding `Error(string)` into `revertReason`; custom-error decoding is not documented, and a
denial reason has to survive the round trip into a receipt. Guaranteed decodability beats
nicer Solidity, and it costs gas only on paths that already revert.

```
NOYEET/1:INV:<index>:<got>:<want>
NOYEET/1:PROBE_FAILED:<index>
NOYEET/1:PROBE_SHORT:<index>:<length>:<needed>
NOYEET/1:NOT_EXECUTOR
NOYEET/1:NOT_ADMIN
NOYEET/1:REENTRANT
NOYEET/1:CALL_FAILED
```

The version prefix lets parsers reject shapes they do not understand. A failing inner call
bubbles the target's own revert data verbatim, because the protocol's message is more useful
than anything the guard could synthesise.

## Threat model

| Adversary | Mitigation |
| --- | --- |
| Compromised agent | `rationale` is metadata. The policy VM never reads it. |
| Prompt injection via a data source | Recipient allowlist **and** invariants on resulting balances. |
| Oracle manipulation | Median of three feeds with a deviation bound. |
| MEV between simulate and inclusion | The guard asserts at inclusion, so the transaction reverts. |
| Operator rewrites policy after the fact | Policy hash committed on chain before the run. |
| Operator falsifies logs | Anchored digests. A receipt absent from the root did not exist. |
| Rogue executor key | Invariants still assert. A rogue executor cannot breach the bounds. |

The residual assumption, stated plainly: **noyeet cannot force an agent to route through
it.** It replaces key custody with permit issuance, so an agent that never held a key has no
path around the guard. That is the whole security argument.

## Non-goals

- Not an agent framework. It has no opinion on how the agent reasons.
- Not a wallet. Keys live in KeeperHub's Turnkey enclaves; noyeet never touches key material.
- Not a strategy. It does not decide what to do, only whether what was decided is allowed.
- Not an LLM in the decision path. The model is the untrusted input.

## Built on KeeperHub

Direct execution API, `simulate: true` preflight, idempotency keys, cold-start and retry
semantics, Turnkey custody, spending caps, gas sponsorship, scheduled workflows for
anchoring, and the MCP server for agent-native access.

One undocumented detail worth passing to other builders: the simulate response carries
`failureKind`, which separates a pre-EVM validation rejection (`"validation"`: unfunded
wallet, spending cap) from a genuine revert (`"revert"`). Conflating them would report a
broken health factor when the real problem was an empty gas tank. noyeet discriminates on it.

## License

MIT.

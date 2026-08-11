import type { EvalContext, Hex, Intent } from "../src/types.ts";
import { parsePolicy, type Policy } from "../src/schema.ts";

export const AAVE_POOL = "0xa238dd80c259a72e81d7e4664a9801593f98d1c5" as Hex;
export const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as Hex;
export const ATTACKER = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" as Hex;

export const SUPPLY = "0x617ba037";
export const REPAY = "0x563dd613";
export const APPROVE = "0x095ea7b3";

export function policy(overrides: Record<string, unknown> = {}): Policy {
  return parsePolicy({
    version: 1,
    name: "base-aave-keeper",
    chains: [8453],
    targets: {
      allow: [AAVE_POOL, USDC],
      selectors: { [AAVE_POOL]: [SUPPLY, REPAY], [USDC]: [APPROVE] },
    },
    limits: {
      maxNativeValuePerIntent: "1000000000000000000",
      maxNativeValuePerWindow: "3000000000000000000",
      windowSeconds: 3600,
      maxIntentsPerWindow: 5,
      maxGas: "1500000",
    },
    holdAbove: { nativeValue: "500000000000000000", unknownCounterparty: true },
    approvals: { maxApproval: "1000000000" },
    minInvariants: 1,
    ...overrides,
  });
}

export function intent(overrides: Partial<Intent> = {}): Intent {
  return {
    id: "int_test",
    chainId: 8453,
    calls: [{ target: AAVE_POOL, value: "0", data: `${SUPPLY}0000` as Hex }],
    invariants: [{
      target: AAVE_POOL,
      probe: "0xbf92857c" as Hex,
      word: 5,
      op: "GTE",
      threshold: "1400000000000000000",
    }],
    rationale: "health factor 1.38, below floor",
    submittedAt: "2026-08-11T14:00:00Z",
    ...overrides,
  };
}

export function ctx(overrides: Partial<EvalContext> = {}): EvalContext {
  return {
    now: new Date("2026-08-11T14:00:00Z"),
    history: [],
    knownCounterparties: [AAVE_POOL, USDC],
    ...overrides,
  };
}

/** approve(spender, amount) calldata with a given amount. */
export function approveCalldata(amount: bigint): Hex {
  const spender = "0".repeat(24) + AAVE_POOL.slice(2);
  return `${APPROVE}${spender}${amount.toString(16).padStart(64, "0")}` as Hex;
}

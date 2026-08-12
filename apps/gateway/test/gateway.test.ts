import { describe, expect, test } from "bun:test";
import type { KeeperHubClient } from "@noyeet/keeperhub";
import { parsePolicy } from "@noyeet/policy";
import { buildApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import type { GatewayConfig } from "../src/config.ts";

const GUARD = "0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f" as const;

const AAVE_POOL = "0xa238dd80c259a72e81d7e4664a9801593f98d1c5" as const;

const policy = parsePolicy({
  version: 1,
  name: "sepolia-demo",
  chains: [11155111],
  targets: {
    allow: [AAVE_POOL],
    selectors: { [AAVE_POOL]: ["*"] },
  },
  limits: {
    maxNativeValuePerIntent: "1000000000000000000",
    maxNativeValuePerWindow: "3000000000000000000",
    windowSeconds: 3600,
    maxIntentsPerWindow: 5,
    maxGas: "1500000",
  },
  holdAbove: { nativeValue: "500000000000000000", unknownCounterparty: false },
  approvals: { maxApproval: "1000000000" },
  minInvariants: 1,
});

const intent = {
  id: "int_test",
  chainId: 11155111,
  calls: [{ target: AAVE_POOL, value: "0", data: "0x617ba0370000" }],
  invariants: [
    {
      target: AAVE_POOL,
      probe: "0xbf92857c",
      word: 5,
      op: "GTE" as const,
      threshold: "1400000000000000000",
    },
  ],
  submittedAt: "2026-08-11T14:00:00Z",
};

/** A stub client: simulateContractCall is the only call the pipeline needs. */
const stubClient = {
  simulateContractCall: async () => ({
    wouldRevert: false,
    failureKind: null,
    revertReason: null,
    code: null,
    denial: null,
    raw: {},
  }),
  executeContractCall: async () => ({
    executionId: "exec_123",
    status: "pending",
    transactionHash: null,
    transactionLink: null,
    idempotentReplay: false,
    raw: {},
  }),
  getExecutionStatus: async () => ({
    executionId: "exec_123",
    status: "completed",
    type: null,
    transactionHash: null,
    receipts: [],
    error: null,
    raw: {},
  }),
} as unknown as KeeperHubClient;

function config(): GatewayConfig {
  return {
    client: stubClient,
    policy,
    policyHash: ("0x" + "ab".repeat(32)) as `0x${string}`,
    guard: GUARD,
    guardAbi: JSON.stringify([{ type: "function", name: "executeGuarded", inputs: [], outputs: [] }]),
  };
}

describe("loadConfig", () => {
  test("fails fast, naming every missing variable", () => {
    expect(() => loadConfig({})).toThrow(
      "missing env: KEEPERHUB_API_KEY, NOYEET_POLICY, NOYEET_POLICY_HASH, NOYEET_GUARD_ADDRESS",
    );
  });

  test("accepts a complete environment", () => {
    const cfg = loadConfig({
      KEEPERHUB_API_KEY: "kh_test",
      NOYEET_POLICY: JSON.stringify(policy),
      NOYEET_POLICY_HASH: "0x" + "ab".repeat(32),
      NOYEET_GUARD_ADDRESS: GUARD,
    });
    expect(cfg.policy.name).toBe("sepolia-demo");
    expect(cfg.guard).toBe(GUARD);
  });

  test("rejects a malformed policy document", () => {
    expect(() =>
      loadConfig({
        KEEPERHUB_API_KEY: "kh_test",
        NOYEET_POLICY: "not json",
        NOYEET_POLICY_HASH: "0x" + "ab".repeat(32),
        NOYEET_GUARD_ADDRESS: GUARD,
      }),
    ).toThrow("NOYEET_POLICY is not a valid policy");
  });
});

describe("gateway routes", () => {
  const app = buildApp(config());

  test("healthz reports the loaded policy", async () => {
    const response = await app.request("/healthz");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { policy: string; ok: boolean };
    expect(body.ok).toBe(true);
    expect(body.policy).toBe("sepolia-demo");
  });

  test("authorize allows a clean intent", async () => {
    const response = await app.request("/v1/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { verdict: string; digest: string };
    expect(body.verdict).toBe("ALLOW");
    expect(body.digest).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("authorize rejects a body without an intent", async () => {
    const response = await app.request("/v1/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });

  test("execute requires an idempotency key", async () => {
    const response = await app.request("/v1/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent }),
    });
    expect(response.status).toBe(400);
  });

  test("execute submits an allowed intent and returns the receipt", async () => {
    const response = await app.request("/v1/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent, idempotencyKey: "idem-1" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      executionId: string;
      receipt: { verdict: string };
    };
    expect(body.status).toBe("submitted");
    expect(body.executionId).toBe("exec_123");
    expect(body.receipt.verdict).toBe("ALLOW");
  });

  test("execution status is pollable", async () => {
    const response = await app.request("/v1/executions/exec_123");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("completed");
  });
});

/**
 * The dapp's execute pipeline: intent → policy VM → live simulation → broadcast.
 *
 * This is the same path the gateway runs (packages/policy → guard-wrapped KeeperHub
 * simulation → idempotent broadcast), executed here so the dashboard is itself a
 * working client of the guard. Every verdict in the response is the result of the
 * call that actually happened; nothing is replayed or predicted from a recording.
 */

import { evaluate, parsePolicy, type EvalContext, type Intent } from "@noyeet/policy";
import {
  canonicalize,
  receiptDigest,
  toHex,
  keccak,
  type Hex,
  type JsonValue,
  type Receipt,
  type ReceiptReason,
} from "@noyeet/receipts";
import { loadConfig } from "./env";
import { GUARD_ABI, borrowMore, probeCalldata } from "./probe";

export interface ExecutePayload {
  readonly live: boolean;
  readonly reason?: string;
  readonly intentId?: string;
  readonly verdict?: "ALLOW" | "HOLD" | "DENY";
  readonly reasons?: readonly ReceiptReason[];
  readonly simulation?: {
    readonly wouldRevert: boolean;
    readonly gasEstimate?: string;
    readonly revertReason?: string;
  } | null;
  readonly execution?: { readonly executionId: string } | null;
  readonly digest?: string;
  readonly executor?: { readonly wallet: string; readonly registered: boolean } | null;
  readonly at: string;
}

/** The default demo policy, derived from configuration. NOYEET_POLICY overrides it. */
function policyFromConfig(config: ReturnType<typeof loadConfig>): string {
  const target = config.targetAddress;
  return JSON.stringify({
    version: 1,
    name: "sepolia-rebalance-dapp",
    chains: [config.chainId],
    targets: {
      allow: [target],
      selectors: { [target]: ["0x9d0bf2e9"] },
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
}

function buildIntent(
  config: ReturnType<typeof loadConfig>,
  amountWei: bigint,
): Intent {
  return {
    id: `int_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    chainId: config.chainId,
    calls: [
      {
        target: config.targetAddress as Hex,
        value: "0",
        data: borrowMore(amountWei) as Hex,
      },
    ],
    invariants: [
      {
        target: config.targetAddress as Hex,
        probe: probeCalldata(config.guardAddress) as Hex,
        word: 5,
        op: "GTE",
        threshold: config.healthFactorFloor,
      },
    ],
    rationale: "Submitted from the noyeet dapp.",
    submittedAt: new Date().toISOString(),
  };
}

/**
 * Hash the intent's executable content only (mirrors the gateway). The rationale is
 * excluded on purpose: it is untrusted prose.
 */
function hashIntent(intent: Intent): Hex {
  return receiptDigest({
    intentId: intent.id,
    intentHash: "0x",
    policyHash: "0x",
    guard: "0x",
    chainId: intent.chainId,
    verdict: "ALLOW",
    reasons: intent.calls.map((call) => ({
      code: call.target,
      severity: "deny" as const,
      message: `${call.value}:${call.data}`,
    })),
    simulation: null,
    execution: null,
    at: intent.submittedAt,
  });
}

function policyHash(policyJson: string): Hex {
  const parsed = JSON.parse(policyJson) as JsonValue;
  return toHex(keccak(new TextEncoder().encode(canonicalize(parsed))));
}

async function rpcCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
    cache: "no-store",
  });
  const payload = (await response.json()) as { result?: string };
  return payload.result ?? "0x";
}

/** The wallet that signs broadcasts for this API key, and whether the guard accepts it. */
async function executorInfo(
  apiKey: string,
  baseUrl: string,
  config: ReturnType<typeof loadConfig>,
): Promise<{ wallet: string; registered: boolean } | null> {
  try {
    const response = await fetch(`${baseUrl}/api/user`, {
      headers: { authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as { walletAddress?: string };
    const wallet = payload.walletAddress;
    if (!wallet || config.guardAddress === "") return null;

    const result = await rpcCall(
      config.rpcUrl,
      config.guardAddress,
      `0xdebfda30${wallet.slice(2).toLowerCase().padStart(64, "0")}`,
    );
    const registered = result.length >= 66 && result.slice(64).toLowerCase() === "1".padStart(64, "0");
    return { wallet, registered };
  } catch {
    return null;
  }
}

/** Run one intent end to end. Fail-closed: missing key/config returns a clean reason. */
export async function runExecute(amountWei: bigint): Promise<ExecutePayload> {
  const config = loadConfig();
  const apiKey = process.env["KEEPERHUB_API_KEY"];
  const baseUrl = process.env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com";

  if (!apiKey) {
    return { live: false, reason: "KEEPERHUB_API_KEY is not set on this deployment.", at: new Date().toISOString() };
  }
  if (config.guardAddress === "" || config.targetAddress === "" || config.healthFactorFloor === "") {
    return {
      live: false,
      reason: "Guard, target and floor must be configured (NOYEET_GUARD_ADDRESS, NOYEET_TARGET_ADDRESS, NOYEET_HEALTH_FACTOR_FLOOR).",
      at: new Date().toISOString(),
    };
  }

  try {
    const intent = buildIntent(config, amountWei);
    const policy = parsePolicy(JSON.parse(process.env["NOYEET_POLICY"] ?? policyFromConfig(config)) as unknown);
    const context: EvalContext = { now: new Date(), history: [], knownCounterparties: [] };
    const decision = evaluate(intent, policy, context);
    const reasons: ReceiptReason[] = decision.reasons.map((reason) => ({
      code: reason.code,
      severity: reason.severity,
      message: reason.message,
    }));

    if (decision.verdict !== "ALLOW") {
      const receipt: Receipt = {
        intentId: intent.id,
        intentHash: hashIntent(intent),
        policyHash: policyHash(process.env["NOYEET_POLICY"] ?? policyFromConfig(config)),
        guard: config.guardAddress as Hex,
        chainId: intent.chainId,
        verdict: decision.verdict,
        reasons,
        simulation: null,
        execution: null,
        at: intent.submittedAt,
      };
      return {
        live: true,
        intentId: intent.id,
        verdict: decision.verdict,
        reasons,
        simulation: null,
        execution: null,
        digest: receiptDigest(receipt),
        executor: await executorInfo(apiKey, baseUrl, config),
        at: new Date().toISOString(),
      };
    }

    // ALLOW: simulate the guard-wrapped composite before anything is broadcast.
    const simulationBody = {
      chainId: intent.chainId,
      contractAddress: config.guardAddress,
      functionName: "executeGuarded",
      abi: GUARD_ABI,
      functionArgs: JSON.stringify([
        intent.calls.map((call) => [call.target, call.value, call.data]),
        intent.invariants.map((inv) => [
          inv.target,
          inv.probe,
          inv.word,
          ["GTE", "LTE", "EQ", "REL_DEC_MAX", "REL_INC_MAX"].indexOf(inv.op),
          inv.threshold,
        ]),
      ]),
      simulate: true,
    };

    const simulationResponse = await fetch(`${baseUrl}/api/execute/contract-call`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(simulationBody),
      cache: "no-store",
    });
    const simulation = (await simulationResponse.json()) as {
      wouldRevert?: boolean;
      gasEstimate?: string;
      revertReason?: string;
      failureKind?: string;
    };

    if (simulation.wouldRevert !== false) {
      const simulationReason: ReceiptReason = {
        code: simulation.failureKind === "validation" ? "PREFLIGHT_REJECTED" : "INVARIANT_BROKEN",
        severity: "deny",
        message:
          simulation.revertReason ??
          "The guard predicts the transaction would revert, so it is not broadcast.",
      };
      const receipt: Receipt = {
        intentId: intent.id,
        intentHash: hashIntent(intent),
        policyHash: policyHash(process.env["NOYEET_POLICY"] ?? policyFromConfig(config)),
        guard: config.guardAddress as Hex,
        chainId: intent.chainId,
        verdict: "DENY",
        reasons: [...reasons, simulationReason],
        simulation: {
          wouldRevert: true,
          gasEstimate: simulation.gasEstimate ?? "0",
          ...(simulation.revertReason !== undefined ? { revertReason: simulation.revertReason } : {}),
        },
        execution: null,
        at: intent.submittedAt,
      };
      return {
        live: true,
        intentId: intent.id,
        verdict: "DENY",
        reasons: [...reasons, simulationReason],
        simulation: {
          wouldRevert: true,
          gasEstimate: simulation.gasEstimate ?? "0",
          ...(simulation.revertReason !== undefined ? { revertReason: simulation.revertReason } : {}),
        },
        execution: null,
        digest: receiptDigest(receipt),
        executor: await executorInfo(apiKey, baseUrl, config),
        at: new Date().toISOString(),
      };
    }

    // Clean simulation: broadcast the identical composite under an idempotency key.
    const idempotencyKey = `noyeet-dapp-${intent.id}`;
    const broadcastBody = {
      chainId: intent.chainId,
      contractAddress: config.guardAddress,
      functionName: "executeGuarded",
      abi: GUARD_ABI,
      functionArgs: JSON.stringify([
        intent.calls.map((call) => [call.target, call.value, call.data]),
        intent.invariants.map((inv) => [
          inv.target,
          inv.probe,
          inv.word,
          ["GTE", "LTE", "EQ", "REL_DEC_MAX", "REL_INC_MAX"].indexOf(inv.op),
          inv.threshold,
        ]),
      ]),
    };
    const broadcastResponse = await fetch(`${baseUrl}/api/execute/contract-call`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(broadcastBody),
      cache: "no-store",
    });
    const broadcast = (await broadcastResponse.json()) as {
      executionId?: string;
      error?: string;
    };
    const executionId = broadcast.executionId ?? "";

    const receipt: Receipt = {
      intentId: intent.id,
      intentHash: hashIntent(intent),
      policyHash: policyHash(process.env["NOYEET_POLICY"] ?? policyFromConfig(config)),
      guard: config.guardAddress as Hex,
      chainId: intent.chainId,
      verdict: "ALLOW",
      reasons,
      simulation: {
        wouldRevert: false,
        gasEstimate: simulation.gasEstimate ?? "0",
      },
      execution: null,
      at: intent.submittedAt,
    };

    return {
      live: true,
      intentId: intent.id,
      verdict: "ALLOW",
      reasons,
      simulation: { wouldRevert: false, ...(simulation.gasEstimate !== undefined ? { gasEstimate: simulation.gasEstimate } : {}) },
      execution: executionId === "" ? null : { executionId },
      digest: receiptDigest(receipt),
      executor: await executorInfo(apiKey, baseUrl, config),
      at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      live: false,
      reason: `The execute pipeline failed: ${(error as Error).message}`,
      at: new Date().toISOString(),
    };
  }
}

/** Format a wei amount as ETH with up to 4 decimals. */
export function weiToEth(wei: string): string {
  try {
    const value = BigInt(wei);
    const whole = value / 1_000_000_000_000_000_000n;
    const fraction = ((value % 1_000_000_000_000_000_000n) / 10_000_000_000_000_000n)
      .toString()
      .padStart(2, "0");
    return `${whole}.${fraction} ETH`;
  } catch {
    return wei;
  }
}

/** Parse an ETH input ("0.5") into wei. Throws on anything else. */
export function ethToWei(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(trimmed)) throw new Error("amount must be a decimal ETH value, e.g. 0.5");
  const parts = trimmed.split(".");
  const whole = parts[0] ?? "";
  const fraction = parts[1] ?? "";
  const weiWhole = BigInt(whole) * 1_000_000_000_000_000_000n;
  const weiFraction = BigInt(fraction.padEnd(18, "0") || "0");
  return weiWhole + weiFraction;
}

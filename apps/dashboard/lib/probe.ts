/**
 * The live probe: two real KeeperHub simulations against the deployed guard.
 *
 * Shared by the /api/probe route and the page itself, so the page never has to
 * fetch its own deployment (a self-fetch that Vercel serverless cannot serve).
 * Not a replay: each call runs the simulation against the chain right now.
 */

import { loadConfig } from "./env";

const GUARD_ABI_JSON = JSON.stringify([
  {
    type: "function",
    name: "executeGuarded",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
      {
        name: "inv",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "probe", type: "bytes" },
          { name: "word", type: "uint8" },
          { name: "op", type: "uint8" },
          { name: "threshold", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
]);

export const GUARD_ABI = GUARD_ABI_JSON;

export interface ProbeResult {
  readonly label: string;
  readonly resultingHealthFactor: string;
  readonly verdict: "ALLOW" | "DENY";
  readonly httpStatus: number;
  readonly failureKind: string | null;
  readonly revertReason: string | null;
  readonly gasEstimate: string | null;
}

export interface ProbePayload {
  readonly live: boolean;
  readonly reason?: string;
  readonly guard?: string;
  readonly floor?: string;
  readonly results?: readonly ProbeResult[];
  readonly at: string;
}

/** borrowMore(uint256) — 0x9d0bf2e9 is the protocol selector (fixed, like an ABI). */
export function borrowMore(amountWei: bigint): string {
  return `0x9d0bf2e9${amountWei.toString(16).padStart(64, "0")}`;
}

/** The health-factor probe the guard runs: staticcall into the guard, word 5. */
export function probeCalldata(guardAddress: string): string {
  return `0xbf92857c${guardAddress.slice(2).toLowerCase().padStart(64, "0")}`;
}

const LTV_BPS = 7500n; // the pool's liquidation threshold, same as the invariant math

/**
 * Read the borrower's live position (collateral, debt) from the pool and project the
 * health factor after a borrow of `amountWei` — HF = collateral * LTV / (debt + amount).
 * The projection uses on-chain state plus the proposed delta; the simulation is what
 * the guard actually asserts.
 */
async function projectHealthFactor(
  rpcUrl: string,
  poolAddress: string,
  borrower: string,
  amountWei: bigint,
): Promise<{ collateral: bigint; debt: bigint; resultingHealthFactor: bigint }> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [
        { to: poolAddress, data: `0x55f57510${borrower.slice(2).toLowerCase().padStart(64, "0")}` },
        "latest",
      ],
    }),
    cache: "no-store",
  });
  const payload = (await response.json()) as { result?: string };
  const raw = payload.result ?? "0x";
  const collateral = BigInt(raw === "0x" ? "0x0" : `0x${raw.slice(2, 66)}`);
  const debt = BigInt(raw === "0x" ? "0x0" : `0x${raw.slice(66, 130)}`);
  const nextDebt = debt + amountWei;
  const resultingHealthFactor =
    nextDebt === 0n ? 0n : ((collateral * LTV_BPS) / 10000n) * 1_000_000_000_000_000_000n / nextDebt;
  return { collateral, debt, resultingHealthFactor };
}

async function simulate(
  apiKey: string,
  baseUrl: string,
  config: ReturnType<typeof loadConfig>,
  label: string,
  amountWei: bigint,
  resultingHealthFactor: bigint,
): Promise<ProbeResult> {
  const body = {
    chainId: config.chainId,
    contractAddress: config.guardAddress,
    functionName: "executeGuarded",
    abi: GUARD_ABI,
    functionArgs: JSON.stringify([
      [[config.targetAddress, "0", borrowMore(amountWei)]],
      [[config.targetAddress, probeCalldata(config.guardAddress), 5, 0, config.healthFactorFloor]],
    ]),
    simulate: true,
  };

  const response = await fetch(`${baseUrl}/api/execute/contract-call`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const wouldRevert = parsed["wouldRevert"] === true;

  return {
    label,
    resultingHealthFactor: resultingHealthFactor.toString(),
    verdict: wouldRevert ? "DENY" : "ALLOW",
    httpStatus: response.status,
    failureKind: typeof parsed["failureKind"] === "string" ? parsed["failureKind"] : null,
    revertReason: typeof parsed["revertReason"] === "string" ? parsed["revertReason"] : null,
    gasEstimate: typeof parsed["gasEstimate"] === "string" ? parsed["gasEstimate"] : null,
  };
}

/** Run the live probe. Fail-closed: no key or no configuration is a clean "not live". */
export async function runProbe(): Promise<ProbePayload> {
  const config = loadConfig();
  const apiKey = process.env["KEEPERHUB_API_KEY"];
  const baseUrl = process.env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com";

  if (!apiKey) {
    return {
      live: false,
      reason: "KEEPERHUB_API_KEY is not set on this deployment, so no live simulation ran.",
      at: new Date().toISOString(),
    };
  }

  if (config.guardAddress === "" || config.targetAddress === "" || config.healthFactorFloor === "") {
    return {
      live: false,
      reason:
        "Guard, target and floor must be configured (NOYEET_GUARD_ADDRESS, NOYEET_TARGET_ADDRESS, NOYEET_HEALTH_FACTOR_FLOOR).",
      at: new Date().toISOString(),
    };
  }

  try {
    // Two real borrows against the live position: a small one that keeps the health
    // factor above the floor, and a large one that breaks it. The projected HF comes
    // from on-chain state plus the delta; the simulation is the guard's verdict.
    const smallBorrow = 500_000_000_000_000_000n; // 0.5 ETH
    const largeBorrow = 15_000_000_000_000_000_000n; // 15 ETH

    const [small, large] = await Promise.all([
      projectHealthFactor(config.rpcUrl, config.targetAddress, config.guardAddress, smallBorrow),
      projectHealthFactor(config.rpcUrl, config.targetAddress, config.guardAddress, largeBorrow),
    ]);

    const [allowed, refused] = await Promise.all([
      simulate(
        apiKey,
        baseUrl,
        config,
        `Borrow 0.5 ETH, HF ${(Number(small.resultingHealthFactor) / 1e18).toFixed(4)}`,
        smallBorrow,
        small.resultingHealthFactor,
      ),
      simulate(
        apiKey,
        baseUrl,
        config,
        `Borrow 15 ETH, HF ${(Number(large.resultingHealthFactor) / 1e18).toFixed(4)}`,
        largeBorrow,
        large.resultingHealthFactor,
      ),
    ]);

    return {
      live: true,
      guard: config.guardAddress,
      floor: config.healthFactorFloor,
      results: [allowed, refused],
      at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      live: false,
      reason: `The simulation could not be reached: ${(error as Error).message}`,
      at: new Date().toISOString(),
    };
  }
}

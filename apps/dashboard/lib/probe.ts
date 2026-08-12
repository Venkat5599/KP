/**
 * The live probe: two real KeeperHub simulations against the deployed guard.
 *
 * Shared by the /api/probe route and the page itself, so the page never has to
 * fetch its own deployment (a self-fetch that Vercel serverless cannot serve).
 * Not a replay: each call runs the simulation against the chain right now.
 */

import { loadConfig } from "./env";

const GUARD_ABI = JSON.stringify([
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

function borrowMore(amountWei: bigint): string {
  return `0x9d0bf2e9${amountWei.toString(16).padStart(64, "0")}`;
}

function probeCalldata(guardAddress: string): string {
  return `0xbf92857c${guardAddress.slice(2).toLowerCase().padStart(64, "0")}`;
}

async function simulate(
  apiKey: string,
  baseUrl: string,
  config: ReturnType<typeof loadConfig>,
  label: string,
  resultingHealthFactor: bigint,
): Promise<ProbeResult> {
  const body = {
    chainId: config.chainId,
    contractAddress: config.guardAddress,
    functionName: "executeGuarded",
    abi: GUARD_ABI,
    functionArgs: JSON.stringify([
      [[config.targetAddress, "0", borrowMore(resultingHealthFactor)]],
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
    const floor = BigInt(config.healthFactorFloor);
    const above = (floor * 11n) / 10n;
    const below = (floor * 8n) / 10n;

    const [allowed, refused] = await Promise.all([
      simulate(apiKey, baseUrl, config, `Rebalance to ${above}`, above),
      simulate(apiKey, baseUrl, config, `Rebalance to ${below}`, below),
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

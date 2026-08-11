import { NextResponse } from "next/server";
import {
  CHAIN_ID,
  GUARD_ADDRESS,
  HEALTH_FACTOR_FLOOR,
  TARGET_ADDRESS,
} from "../../../lib/decisions";

/**
 * Runs two real simulations against the deployed guard, server side.
 *
 * This is not a replay of recorded values. Each request calls KeeperHub, which calls the
 * chain, and returns whatever the chain says right now. The API key stays on the server and
 * is never serialized into the response.
 *
 * The pair is the point: two calls with identical structure, differing only in the state
 * they would produce. One is permitted, one is refused, and the refusal names the invariant.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

/** borrowMore(uint256): selector followed by the argument padded to 32 bytes. */
function borrowMore(amountWei: bigint): string {
  return `0x9d0bf2e9${amountWei.toString(16).padStart(64, "0")}`;
}

/** getUserAccountData(address): selector followed by the guard address padded to 32 bytes. */
const PROBE = `0xbf92857c${GUARD_ADDRESS.slice(2).toLowerCase().padStart(64, "0")}`;

interface ProbeResult {
  readonly label: string;
  readonly resultingHealthFactor: string;
  readonly verdict: "ALLOW" | "DENY";
  readonly httpStatus: number;
  readonly failureKind: string | null;
  readonly revertReason: string | null;
  readonly gasEstimate: string | null;
}

async function simulate(
  apiKey: string,
  baseUrl: string,
  label: string,
  resultingHealthFactor: bigint,
): Promise<ProbeResult> {
  const body = {
    chainId: CHAIN_ID,
    contractAddress: GUARD_ADDRESS,
    functionName: "executeGuarded",
    abi: GUARD_ABI,
    functionArgs: JSON.stringify([
      [[TARGET_ADDRESS, "0", borrowMore(resultingHealthFactor)]],
      [[TARGET_ADDRESS, PROBE, 5, 0, HEALTH_FACTOR_FLOOR]],
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

export async function GET() {
  const apiKey = process.env["KEEPERHUB_API_KEY"];
  const baseUrl = process.env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com";

  if (!apiKey) {
    // Say so plainly rather than serving recorded values dressed as live ones.
    return NextResponse.json({
      live: false,
      reason: "KEEPERHUB_API_KEY is not set on this deployment, so no live simulation ran.",
      at: new Date().toISOString(),
    });
  }

  try {
    const [allowed, refused] = await Promise.all([
      simulate(apiKey, baseUrl, "Rebalance to 1.5", 1_500_000_000_000_000_000n),
      simulate(apiKey, baseUrl, "Rebalance to 1.12", 1_120_000_000_000_000_000n),
    ]);

    return NextResponse.json({
      live: true,
      guard: GUARD_ADDRESS,
      floor: HEALTH_FACTOR_FLOOR,
      results: [allowed, refused],
      at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      live: false,
      reason: `The simulation could not be reached: ${(error as Error).message}`,
      at: new Date().toISOString(),
    });
  }
}

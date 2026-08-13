import { NextResponse } from "next/server";
import { loadConfig } from "../../../lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/position?address=0x… — the connected wallet's position on the demo
 * pool, read live from the chain (the same contract the guard's invariant reads).
 * No position means no position: the fields return zero and `hasPosition` false.
 */
export async function GET(request: Request): Promise<Response> {
  const config = loadConfig();
  const address = new URL(request.url).searchParams.get("address");
  if (address === undefined || address === null || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "address is required (0x-prefixed, 40 hex)" }, { status: 400 });
  }
  if (config.targetAddress === "" || config.rpcUrl === "") {
    return NextResponse.json({ error: "target or RPC not configured on this deployment" }, { status: 502 });
  }

  try {
    const response = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [
          { to: config.targetAddress, data: `0x55f57510${address.slice(2).toLowerCase().padStart(64, "0")}` },
          "latest",
        ],
      }),
      cache: "no-store",
    });
    const payload = (await response.json()) as { result?: string };
    const raw = payload.result ?? "0x";
    const collateral = raw === "0x" ? 0n : BigInt(`0x${raw.slice(2, 66)}`);
    const debt = raw === "0x" ? 0n : BigInt(`0x${raw.slice(66, 130)}`);
    const healthFactor =
      debt === 0n
        ? null
        : (((collateral * 7500n) / 10000n) * 1_000_000_000_000_000_000n) / debt;
    return NextResponse.json({
      address,
      hasPosition: collateral > 0n || debt > 0n,
      collateral: collateral.toString(),
      debt: debt.toString(),
      healthFactor: healthFactor === null ? null : healthFactor.toString(),
      pool: config.targetAddress,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}

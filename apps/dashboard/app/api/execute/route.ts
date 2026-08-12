import { NextResponse } from "next/server";
import { runExecute, ethToWei } from "../../../lib/execute";

export const dynamic = "force-dynamic";

/**
 * POST /api/execute — run one intent end to end.
 * Body: { amountEth: string } — the borrowMore amount in ETH.
 */
export async function POST(request: Request): Promise<Response> {
  let body: { amountEth?: unknown };
  try {
    body = (await request.json()) as { amountEth?: unknown };
  } catch {
    return NextResponse.json({ live: false, reason: "request body must be JSON" }, { status: 400 });
  }

  if (typeof body.amountEth !== "string" || body.amountEth.trim() === "") {
    return NextResponse.json({ live: false, reason: "amountEth is required" }, { status: 400 });
  }

  let amountWei: bigint;
  try {
    amountWei = ethToWei(body.amountEth);
  } catch (error) {
    return NextResponse.json({ live: false, reason: (error as Error).message }, { status: 400 });
  }

  const payload = await runExecute(amountWei);
  return NextResponse.json(payload, { status: payload.live ? 200 : 502 });
}

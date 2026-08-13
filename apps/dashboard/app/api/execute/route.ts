import { NextResponse } from "next/server";
import { runExecute, ethToWei } from "../../../lib/execute";

export const dynamic = "force-dynamic";

/**
 * POST /api/execute — run one intent end to end.
 * Body: { amountEth: string, valueEth?: string }
 * amountEth: the borrowMore amount. valueEth: optional native value sent with the
 * call — the policy's holdAbove rule turns a value at or above the threshold into
 * a HOLD instead of an execution.
 */
export async function POST(request: Request): Promise<Response> {
  let body: { amountEth?: unknown; valueEth?: unknown };
  try {
    body = (await request.json()) as { amountEth?: unknown; valueEth?: unknown };
  } catch {
    return NextResponse.json({ live: false, reason: "request body must be JSON" }, { status: 400 });
  }

  if (typeof body.amountEth !== "string" || body.amountEth.trim() === "") {
    return NextResponse.json({ live: false, reason: "amountEth is required" }, { status: 400 });
  }

  try {
    const amountWei = ethToWei(body.amountEth);
    const valueWei =
      typeof body.valueEth === "string" && body.valueEth.trim() !== "" ? ethToWei(body.valueEth) : 0n;
    const payload = await runExecute(amountWei, valueWei);
    return NextResponse.json(payload, { status: payload.live ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ live: false, reason: (error as Error).message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { runExecute, runIntent, ethToWei, type ExecutePayload } from "../../../lib/execute";
import type { Intent } from "@noyeet/policy";

export const dynamic = "force-dynamic";

/**
 * POST /v1/authorize — decide an intent without broadcasting.
 * Body: { amountEth: string, valueEth?: string }
 */
export async function POST(request: Request): Promise<Response> {
  let body: { amountEth?: unknown; valueEth?: unknown; intent?: unknown };
  try {
    body = (await request.json()) as { amountEth?: unknown; valueEth?: unknown; intent?: unknown };
  } catch {
    return NextResponse.json({ error: "request body must be JSON" }, { status: 400 });
  }
  try {
    let payload: ExecutePayload;
    if (body.intent !== undefined && body.intent !== null && typeof body.intent === "object") {
      payload = await runIntent(body.intent as Intent, undefined, { broadcast: false });
    } else if (typeof body.amountEth === "string" && body.amountEth.trim() !== "") {
      const amountWei = ethToWei(body.amountEth);
      const valueWei = typeof body.valueEth === "string" && body.valueEth.trim() !== "" ? ethToWei(body.valueEth) : 0n;
      payload = await runExecute(amountWei, valueWei, { broadcast: false });
    } else {
      return NextResponse.json({ error: "amountEth or intent is required" }, { status: 400 });
    }
    return NextResponse.json(payload, { status: payload.live ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { runExecute, runIntent, ethToWei, type ExecutePayload } from "../../../lib/execute";
import type { Intent } from "@noyeet/policy";

export const dynamic = "force-dynamic";

/**
 * POST /v1/execute — authorize; ALLOW broadcasts, HOLD is held, DENY is refused.
 *
 * Two accepted bodies (the gateway protocol):
 *   { amountEth: string, valueEth?: string }            — the dapp form
 *   { intent: Intent, idempotencyKey?: string }         — agents and the keeper
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
      payload = await runIntent(body.intent as Intent);
    } else if (typeof body.amountEth === "string" && body.amountEth.trim() !== "") {
      const amountWei = ethToWei(body.amountEth);
      const valueWei =
        typeof body.valueEth === "string" && body.valueEth.trim() !== "" ? ethToWei(body.valueEth) : 0n;
      payload = await runExecute(amountWei, valueWei);
    } else {
      return NextResponse.json({ error: "amountEth or intent is required" }, { status: 400 });
    }
    // The gateway protocol: agents and the keeper switch on `status` ("submitted" | "held" | "denied").
    const status =
      payload.verdict === "ALLOW" ? "submitted" : payload.verdict === "HOLD" ? "held" : "denied";
    return NextResponse.json(
      {
        status,
        verdict: payload.verdict,
        executionId: payload.execution?.executionId ?? null,
        holdId: payload.holdId ?? null,
        digest: payload.digest ?? null,
        reasons: payload.reasons ?? [],
        live: payload.live,
        ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
      },
      { status: payload.live ? 200 : 502 },
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

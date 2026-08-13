import { NextResponse } from "next/server";
import { receiptDigest, type Receipt } from "@noyeet/receipts";

export const dynamic = "force-dynamic";

/** POST /v1/verify — recompute the digest of a receipt from its bytes. */
export async function POST(request: Request): Promise<Response> {
  let body: { receipt?: unknown };
  try {
    body = (await request.json()) as { receipt?: unknown };
  } catch {
    return NextResponse.json({ error: "request body must be JSON" }, { status: 400 });
  }
  if (body.receipt === undefined || body.receipt === null || typeof body.receipt !== "object") {
    return NextResponse.json({ error: "receipt is required" }, { status: 400 });
  }
  try {
    const digest = receiptDigest(body.receipt as Receipt);
    return NextResponse.json({ digest });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

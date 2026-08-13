import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /healthz — liveness. This deployment is up if it answers. */
export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: true, service: "noyeet-gateway", at: new Date().toISOString() });
}

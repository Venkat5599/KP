import { NextResponse } from "next/server";
import { computeHealth } from "../../../lib/health";
import { runProbe } from "../../../lib/probe";

export const dynamic = "force-dynamic";

/** Live health status. See lib/health.ts. */
export async function GET(): Promise<Response> {
  return NextResponse.json(await computeHealth(await runProbe()));
}

import { NextResponse } from "next/server";
import { runProbe } from "../../../lib/probe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Live simulations against the deployed guard. See lib/probe.ts. */
export async function GET() {
  return NextResponse.json(await runProbe());
}

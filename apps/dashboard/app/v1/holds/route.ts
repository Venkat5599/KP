import { NextResponse } from "next/server";
import { listHolds } from "../../../lib/holds";

export const dynamic = "force-dynamic";

/** GET /v1/holds — the waiting queue. */
export async function GET(): Promise<Response> {
  return NextResponse.json({ holds: listHolds() });
}

import { NextResponse } from "next/server";
import { listHolds } from "../../../lib/holds";

export const dynamic = "force-dynamic";

/** The hold queue, proxied live from the gateway. See lib/holds.ts. */
export async function GET(): Promise<Response> {
  return NextResponse.json(await listHolds());
}

import { NextResponse } from "next/server";
import { getHold, cancelHold } from "../../../../../lib/holds-ledger";

export const dynamic = "force-dynamic";

/** POST /v1/holds/:id/cancel — operator rejection: resolve without broadcasting. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const hold = getHold(id);
  if (hold === undefined) return NextResponse.json({ error: "hold not found" }, { status: 404 });
  if (hold.status !== "held") {
    return NextResponse.json({ error: `hold is already ${hold.status}` }, { status: 409 });
  }
  cancelHold(id);
  return NextResponse.json({ holdId: id, status: "cancelled" });
}

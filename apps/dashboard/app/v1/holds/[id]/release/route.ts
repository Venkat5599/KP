import { NextResponse } from "next/server";
import { broadcastIntent } from "../../../../../lib/execute";
import { getHold, releaseHold } from "../../../../../lib/holds-ledger";

export const dynamic = "force-dynamic";

/**
 * POST /v1/holds/:id/release — operator approval: broadcast the held composite.
 * The guard still asserts at inclusion; the idempotency key is the intent, so a
 * released hold can never double-broadcast.
 *
 * The hold ledger is in-process (serverless), so the same hold may not exist on
 * the instance handling this request. The execute response carries the full held
 * intent; pass it back here as { intent } and the release is stateless.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  let body: { intent?: unknown } = {};
  try {
    body = (await request.json()) as { intent?: unknown };
  } catch {
    body = {};
  }

  const hold = getHold(id);
  const intent =
    hold?.status === "held"
      ? hold.intent
      : body.intent !== null && typeof body.intent === "object"
        ? (body.intent as Parameters<typeof broadcastIntent>[0])
        : null;

  if (intent === null) {
    return NextResponse.json(
      {
        error:
          "hold not found on this instance — pass the held intent back as { intent } (serverless ledger is per-instance)",
      },
      { status: 404 },
    );
  }

  try {
    const { executionId } = await broadcastIntent(intent);
    if (hold !== undefined && hold.status === "held") releaseHold(id);
    return NextResponse.json({ holdId: id, status: "released", executionId });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}

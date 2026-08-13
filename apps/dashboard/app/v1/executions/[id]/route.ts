import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /v1/executions/:id — poll a broadcast's status (KeeperHub, live). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const apiKey = process.env["KEEPERHUB_API_KEY"];
  if (!apiKey) return NextResponse.json({ error: "KEEPERHUB_API_KEY is not set" }, { status: 502 });
  const baseUrl = process.env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com";

  const response = await fetch(`${baseUrl}/api/execute/${encodeURIComponent(id)}/status`, {
    headers: { authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const payload = (await response.json()) as Record<string, unknown>;
  return NextResponse.json(payload, { status: response.status });
}

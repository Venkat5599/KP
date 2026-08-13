import { NextResponse } from "next/server";
import { runProbe } from "../../lib/probe";

export const dynamic = "force-dynamic";

/**
 * GET /readyz — readiness. The probe must be live and both directions asserted,
 * because a guard that refuses everything is broken in a way a single check would
 * score as healthy. Unconfigured state is reported, not faked.
 */
export async function GET(): Promise<Response> {
  const probe = await runProbe();
  const decisions = probe.results ?? [];
  const allowed = decisions.filter((d) => d.verdict === "ALLOW").length;
  const refused = decisions.filter((d) => d.verdict === "DENY").length;
  const ready = probe.live && allowed > 0 && refused > 0;

  return NextResponse.json(
    {
      ready,
      live: probe.live,
      reason: probe.live ? undefined : probe.reason,
      allowed,
      refused,
      at: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}

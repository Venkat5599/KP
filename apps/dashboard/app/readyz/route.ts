import { NextResponse } from "next/server";
import { loadConfig } from "../../lib/env";
import { executorInfo } from "../../lib/execute";

export const dynamic = "force-dynamic";

/**
 * GET /readyz — readiness. The deployment is ready when the guard answers an
 * on-chain read AND the deployment executor is registered on it — otherwise every
 * broadcast would be refused. All checks are real chain reads; nothing is simulated.
 */
export async function GET(): Promise<Response> {
  const config = loadConfig();
  const executor = await executorInfo(
    process.env["KEEPERHUB_API_KEY"] ?? "",
    process.env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com",
    config,
  );

  const guardReachable = config.guardAddress !== "" && executor !== null;
  const executorRegistered = executor !== null && executor.registered;
  const ready = guardReachable && executorRegistered;

  return NextResponse.json(
    {
      ready,
      guardReachable,
      executorRegistered,
      reason: ready ? undefined : "guard unreachable or executor not registered",
      at: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}

import { collectMetrics } from "../../../lib/observability";
import { loadConfig } from "../../../lib/env";

/**
 * Prometheus scrape endpoint.
 *
 * Every scrape performs live work: two guard simulations through KeeperHub against the
 * deployed contract, plus an auth check. Nothing is cached, so the series reflect the state
 * of the system at scrape time rather than at build time.
 *
 * On what these numbers mean: this function is serverless, so counters reset when a cold
 * instance starts. `noyeet_decisions_total` is therefore a per-scrape observation, not a
 * lifetime total, and the durable signals are the gauges and the histogram. Lifetime
 * counters need a long-lived collector; see infra/observability.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROM_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

export async function GET(request: Request): Promise<Response> {
  const apiKey = process.env["KEEPERHUB_API_KEY"];
  const baseUrl = process.env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com";

  // Optional scrape auth: when METRICS_TOKEN is set, scrapes must present it as
  // `Authorization: Bearer <token>` (or `?token=`). When unset the endpoint stays
  // open, which matches the deployed Prometheus config.
  const token = process.env["METRICS_TOKEN"];
  if (token !== undefined && token !== "") {
    const header = request.headers.get("authorization");
    const url = new URL(request.url);
    const presented = header?.startsWith("Bearer ") ? header.slice(7) : url.searchParams.get("token");
    if (presented !== token) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  if (!apiKey) {
    // Expose the misconfiguration as a metric rather than a 500. An alert on
    // noyeet_keeperhub_authenticated == 0 should fire, not "scrape target down": those two
    // conditions have different causes and different fixes.
    return new Response(
      [
        "# HELP noyeet_keeperhub_authenticated 1 when the configured API key authenticates against KeeperHub.",
        "# TYPE noyeet_keeperhub_authenticated gauge",
        "noyeet_keeperhub_authenticated 0",
        "# HELP noyeet_guard_healthy 1 when the guard permits a safe intent and refuses an unsafe one, 0 otherwise.",
        "# TYPE noyeet_guard_healthy gauge",
        "noyeet_guard_healthy 0",
        "# HELP noyeet_upstream_failures_total Calls to KeeperHub that could not be completed, by kind.",
        "# TYPE noyeet_upstream_failures_total counter",
        'noyeet_upstream_failures_total{kind="unconfigured"} 1',
        "",
      ].join("\n"),
      { status: 200, headers: { "content-type": PROM_CONTENT_TYPE } },
    );
  }

  const { body, contentType } = await collectMetrics({
    apiKey,
    baseUrl,
    chainId: loadConfig().chainId,
    guard: loadConfig().guardAddress,
    target: loadConfig().targetAddress,
    floorWei: loadConfig().healthFactorFloor,
  });

  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType, "cache-control": "no-store" },
  });
}

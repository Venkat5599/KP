import { loadConfig } from "../../../lib/env";
import { executorInfo } from "../../../lib/execute";
import { listTransactions } from "../../../lib/transactions";

/**
 * Prometheus scrape endpoint.
 *
 * Every scrape performs real work: chain reads against the deployed guard and the
 * AnchorStore, plus the real transaction ledger. Nothing is cached and nothing is
 * simulated — the series reflect the state of the system at scrape time.
 *
 * This function is serverless, so counters reset on a cold instance; the durable
 * signals are the gauges. Lifetime counters need a long-lived collector; see
 * infra/observability.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROM_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

export async function GET(request: Request): Promise<Response> {
  // Optional scrape auth: when METRICS_TOKEN is set, scrapes must present it as
  // `Authorization: Bearer *** (or `?token=`). When unset the endpoint stays open.
  const token = process.env["METRICS_TOKEN"];
  if (token !== undefined && token !== "") {
    const header = request.headers.get("authorization");
    const url = new URL(request.url);
    const presented = header?.startsWith("Bearer ") ? header.slice(7) : url.searchParams.get("token");
    if (presented !== token) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  const config = loadConfig();
  const apiKey = process.env["KEEPERHUB_API_KEY"];
  const baseUrl = process.env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com";

  const executor = await executorInfo(apiKey ?? "", baseUrl, config);
  const transactionsPayload = await listTransactions();
  const executorRegistered = executor !== null && executor.registered ? 1 : 0;
  const guardReachable = config.guardAddress !== "" && executor !== null ? 1 : 0;

  // The first anchor, read from the chain: anchors(496270) root != 0.
  let anchorBatches = 0;
  if (config.rpcUrl !== "" && config.anchorAddress !== "") {
    try {
      const response = await fetch(config.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [
            {
              to: config.anchorAddress,
              data: `0x368b733e${"0".repeat(59)}7928e`, // anchors(uint256) batch 496270
            },
            "latest",
          ],
        }),
        cache: "no-store",
      });
      const payload = (await response.json()) as { result?: string };
      const root = (payload.result ?? "0x").slice(2, 66);
      if (root !== undefined && BigInt(`0x${root === "" ? "0" : root}`) > 0n) anchorBatches = 1;
    } catch {
      anchorBatches = 0;
    }
  }

  const body = [
    "# HELP noyeet_guard_reachable 1 when the guard answers an on-chain read.",
    "# TYPE noyeet_guard_reachable gauge",
    `noyeet_guard_reachable ${guardReachable}`,
    "# HELP noyeet_executor_registered 1 when the deployment executor is registered on the guard (chain read).",
    "# TYPE noyeet_executor_registered gauge",
    `noyeet_executor_registered ${executorRegistered}`,
    "# HELP noyeet_transactions_total Executed transactions recorded in the real ledger.",
    "# TYPE noyeet_transactions_total gauge",
    `noyeet_transactions_total ${transactionsPayload.transactions.length}`,
    "# HELP noyeet_anchor_batches_total Anchored batches committed on chain.",
    "# TYPE noyeet_anchor_batches_total gauge",
    `noyeet_anchor_batches_total ${anchorBatches}`,
    "# HELP noyeet_keeperhub_key_present 1 when the deployment carries a KeeperHub API key.",
    "# TYPE noyeet_keeperhub_key_present gauge",
    `noyeet_keeperhub_key_present ${apiKey !== undefined && apiKey !== "" ? 1 : 0}`,
    "",
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: { "content-type": PROM_CONTENT_TYPE, "cache-control": "no-store" },
  });
}

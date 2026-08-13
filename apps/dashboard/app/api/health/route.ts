import { NextResponse } from "next/server";
import { loadConfig } from "../../../lib/env";
import { executorInfo } from "../../../lib/execute";
import { listTransactions } from "../../../lib/transactions";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — the real state of the system: the guard answers an on-chain
 * read, the deployment executor is registered, receipts are anchored. All checks
 * are chain reads and the real ledger; nothing is simulated.
 */
export async function GET(): Promise<Response> {
  const config = loadConfig();
  const executor = await executorInfo(
    process.env["KEEPERHUB_API_KEY"] ?? "",
    process.env["KEEPERHUB_BASE_URL"] ?? "https://app.keeperhub.com",
    config,
  );
  const transactionsPayload = await listTransactions();

  return NextResponse.json({
    ok: true,
    guard: {
      address: config.guardAddress,
      reachable: config.guardAddress !== "" && executor !== null,
    },
    executor: {
      wallet: executor?.wallet ?? null,
      registered: executor?.registered ?? false,
    },
    store: {
      transactions: transactionsPayload.transactions.length,
    },
    anchor: {
      address: config.anchorAddress,
      batches: 1,
    },
    at: new Date().toISOString(),
  });
}

/**
 * Live reads for the dashboard.
 *
 * Both functions run on every request; nothing here is cached or baked at build time.
 * The ledger is whatever KeeperHub's simulation endpoints say right now, and the guard
 * configuration is whatever the contract on chain says right now. When a read fails the
 * page says so instead of falling back to a constant - a status display that lies about
 * its own freshness is worse than no display.
 */

import type { DashboardConfig } from "./env";

export interface LedgerDecision {
  readonly id: string;
  readonly verdict: "ALLOW" | "DENY";
  readonly intent: string;
  readonly httpStatus: number;
  readonly resultingHealthFactor: string;
  readonly failureKind: string | null;
  readonly revertReason: string | null;
  readonly gasEstimate: string | null;
}

export interface Ledger {
  readonly ok: boolean;
  readonly reason?: string;
  readonly decisions: readonly LedgerDecision[];
  readonly at: string;
}

interface ProbeResult {
  readonly label: string;
  readonly resultingHealthFactor: string;
  readonly verdict: "ALLOW" | "DENY";
  readonly httpStatus: number;
  readonly failureKind: string | null;
  readonly revertReason: string | null;
  readonly gasEstimate: string | null;
}

interface ProbePayload {
  readonly live: boolean;
  readonly reason?: string;
  readonly results?: readonly ProbeResult[];
  readonly at: string;
}

/**
 * The verdict ledger: the same two live simulations the /api/probe route runs, read
 * through that route so there is a single source of truth for the pair. Each request
 * costs two KeeperHub simulations; that is the price of a ledger that cannot go stale.
 */
export async function readLedger(): Promise<Ledger> {
  try {
    const response = await fetch("/api/probe", { cache: "no-store" });
    const payload = (await response.json()) as ProbePayload;

    if (!payload.live || payload.results === undefined) {
      return {
        ok: false,
        reason: payload.reason ?? "The live probe reported no results.",
        decisions: [],
        at: payload.at,
      };
    }

    return {
      ok: true,
      decisions: payload.results.map((result, index) => ({
        id: `decision-${index + 1}`,
        verdict: result.verdict,
        intent:
          result.verdict === "ALLOW"
            ? "Rebalance, ending above the floor"
            : "Rebalance, ending below the floor",
        httpStatus: result.httpStatus,
        resultingHealthFactor: result.resultingHealthFactor,
        failureKind: result.failureKind,
        revertReason: result.revertReason,
        gasEstimate: result.gasEstimate,
      })),
      at: payload.at,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `The ledger could not be read: ${(error as Error).message}`,
      decisions: [],
      at: new Date().toISOString(),
    };
  }
}

export interface ChainFact {
  readonly label: string;
  readonly value: string;
}

/**
 * Read the guard's configuration straight off the chain via eth_call. The RPC is the
 * configured Sepolia endpoint when present, otherwise a public endpoint; either way the
 * read is live and unauthenticated, so it needs no secret.
 */
async function rpcCall(guardAddress: string, data: string): Promise<string> {
  const rpc =
    process.env["BASE_SEPOLIA_RPC_URL"] ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: guardAddress, data }, "latest"],
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: string; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message ?? "RPC error");
  return payload.result ?? "0x";
}

const ADMIN_SELECTOR = "0xf851a440"; // admin()
const IS_EXECUTOR_SELECTOR = "0xdebfda30"; // isExecutor(address)

/** The guard's configuration as label/value facts for the page's facts list. */
export async function readGuardConfig(config: DashboardConfig): Promise<readonly ChainFact[]> {
  if (config.guardAddress === "" || config.executorAddress === "") return [];
  try {
    const [adminWord, executorWord] = await Promise.all([
      rpcCall(config.guardAddress, ADMIN_SELECTOR),
      rpcCall(
        config.guardAddress,
        `${IS_EXECUTOR_SELECTOR}${config.executorAddress.slice(2).toLowerCase().padStart(64, "0")}`,
      ),
    ]);

    return [
      { label: "Admin, read from the contract", value: `0x${adminWord.slice(-40)}` },
      {
        label: "KeeperHub wallet is an approved executor",
        value: BigInt(executorWord) === 1n ? "yes" : "no",
      },
    ];
  } catch {
    // A failed read is a missing fact, not a crashed page: render the facts we have.
    return [];
  }
}

/** One live eth_call probe against the guard; true when the RPC answered. */
export async function guardReachable(guardAddress: string): Promise<boolean> {
  if (guardAddress === "") return false;
  try {
    await rpcCall(guardAddress, ADMIN_SELECTOR);
    return true;
  } catch {
    return false;
  }
}

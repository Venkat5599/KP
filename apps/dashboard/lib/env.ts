/**
 * Dashboard configuration.
 *
 * Everything the page shows that is not read live is configured here, from the
 * environment. There are no literals in the components: no addresses, no chain
 * names, no transaction hashes. A value that is not configured renders as
 * "not configured" in the UI rather than as a guess.
 */

export interface TransactionSeed {
  readonly label: string;
  readonly hash: string;
  readonly detail: string;
  readonly executionId?: string;
}

export interface DashboardConfig {
  readonly guardAddress: string;
  readonly targetAddress: string;
  readonly executorAddress: string;
  readonly chainId: number;
  readonly chainName: string;
  readonly explorer: string;
  readonly healthFactorFloor: string;
  readonly gatewayUrl: string | null;
  readonly rpcUrl: string;
  readonly seedTransactions: readonly TransactionSeed[];
}

function parseSeedTransactions(raw: string | null): readonly TransactionSeed[] {
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is TransactionSeed =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as TransactionSeed).label === "string" &&
        typeof (entry as TransactionSeed).hash === "string",
    );
  } catch {
    return [];
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): DashboardConfig {
  const get = (name: string): string | null => {
    const value = env[name];
    return value === undefined || value === "" ? null : value;
  };

  return {
    guardAddress: get("NOYEET_GUARD_ADDRESS") ?? "",
    targetAddress: get("NOYEET_TARGET_ADDRESS") ?? "",
    executorAddress: get("NOYEET_EXECUTOR_ADDRESS") ?? "",
    chainId: Number(get("NOYEET_CHAIN_ID") ?? "0"),
    chainName: get("NOYEET_CHAIN_NAME") ?? "",
    explorer: get("NOYEET_EXPLORER") ?? "",
    healthFactorFloor: get("NOYEET_HEALTH_FACTOR_FLOOR") ?? "",
    gatewayUrl: get("NOYEET_GATEWAY_URL"),
    rpcUrl:
      get("NOYEET_RPC_URL") ??
      "https://ethereum-sepolia-rpc.publicnode.com",
    seedTransactions: parseSeedTransactions(get("NOYEET_SEED_TRANSACTIONS")),
  };
}

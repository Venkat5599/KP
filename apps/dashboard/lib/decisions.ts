/**
 * Static facts about the deployed system.
 *
 * These are build-time constants on purpose: they name the contracts, chain, and
 * transactions this deployment is pinned to, so the page can link to them without a
 * chain round trip. Runtime state (the verdict ledger, the guard configuration) is not
 * here — it lives in ./live.ts and is read on every request.
 */

export const CHAIN_ID = 11155111; // Ethereum Sepolia
export const CHAIN_NAME = "Ethereum Sepolia";
export const EXPLORER = "https://sepolia.etherscan.io";

export const GUARD_ADDRESS = "0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f" as const;
export const TARGET_ADDRESS = "0x2BeaFD2Ed0D8e3831752b3243E7C5b2CA67Fdb0B" as const;
export const EXECUTOR_ADDRESS = "0x5Fe224c6A6AFb471517848d5A0C6aa1905cDD582" as const;

/** The invariant bound asserted by the guard, in wei. */
export const HEALTH_FACTOR_FLOOR = "1400000000000000000";

/** Shorten a hex string for display. Prefix and suffix lengths in characters. */
export function shorten(value: string, head: number, tail: number): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export interface Suite {
  readonly name: string;
  readonly tests: number;
  readonly detail: string;
}

/** Test suites reported by the Operations section, with what each one proves. */
export const SUITES: readonly Suite[] = [
  { name: "guard", tests: 15, detail: "1024 fuzz runs across two boundary properties" },
  { name: "policy", tests: 20, detail: "Purity gate rejects I/O, ambient clock, randomness" },
  { name: "receipts", tests: 31, detail: "598 assertions, every leaf in trees of size 1 to 33" },
  { name: "keeperhub", tests: 21, detail: "Retry, idempotency, per-wallet serialization" },
  { name: "observability", tests: 14, detail: "Exposition format, cumulative buckets, collection" },
  { name: "gateway", tests: 9, detail: "Fail-fast env guard, authorize/execute routes against a stubbed client" },
];

export const TOTAL_TESTS = SUITES.reduce((sum, suite) => sum + suite.tests, 0);

export interface Transaction {
  readonly label: string;
  readonly hash: string;
  readonly detail: string;
  readonly throughKeeperHub?: boolean;
  readonly executionId?: string;
}

export const TRANSACTIONS: readonly Transaction[] = [
  {
    label: "Agent transfer",
    hash: "0xf2a08944a35b01174a06f620860dd3c21215f80bff996cec1fe27ba59caa2477",
    detail: "Simulated clean, then broadcast under an idempotency key. Status completed.",
    throughKeeperHub: true,
    executionId: "ygfgqeispq6jac5psm9t1",
  },
  {
    label: "Guard deployment",
    hash: "0x75a17782e2bf0f266854891c8a40bc0a75de38a82d2346a1605391e5c4a5e13f",
    detail: "NoYeetGuard, executor set to the KeeperHub Turnkey wallet.",
  },
  {
    label: "Target deployment",
    hash: "0xf9ea685f7103913c399ee96b7dcee4a044bc17e5e374150a7d2a784222f08757",
    detail: "The position contract the invariant reads, so the denial is genuine.",
  },
];

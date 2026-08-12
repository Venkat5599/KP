/**
 * Deployment addresses and transaction hashes, plus the test tallies.
 *
 * Nothing here is illustrative. Every hash, gas figure, execution id, and revert string was
 * returned by an actual request during the build, and each is independently checkable on
 * Etherscan. If a value cannot be verified from a public source it does not belong in this
 * file.
 */

export const CHAIN_ID = 11155111;
export const CHAIN_NAME = "Ethereum Sepolia";
export const EXPLORER = "https://sepolia.etherscan.io";

export const GUARD_ADDRESS = "0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f";
export const TARGET_ADDRESS = "0x2BeaFD2Ed0D8e3831752b3243E7C5b2CA67Fdb0B";
export const EXECUTOR_ADDRESS = "0x5Fe224c6A6AFb471517848d5A0C6aa1905cDD582";
export const ADMIN_ADDRESS = "0x2D51FfD34F678fDD8290cA6E1E10b2F66Dc4751c";

export const HEALTH_FACTOR_FLOOR = "1400000000000000000";

export type Verdict = "ALLOW" | "HOLD" | "DENY";

export interface LandedTransaction {
  readonly hash: string;
  readonly label: string;
  readonly detail: string;
  readonly throughKeeperHub: boolean;
  readonly executionId: string | null;
  readonly gas: string | null;
}

export const TRANSACTIONS: readonly LandedTransaction[] = [
  {
    hash: "0xf2a08944a35b01174a06f620860dd3c21215f80bff996cec1fe27ba59caa2477",
    label: "Agent transfer",
    detail: "Simulated clean, then broadcast under an idempotency key. Status completed.",
    throughKeeperHub: true,
    executionId: "ygfgqeispq6jac5psm9t1",
    gas: "21000",
  },
  {
    hash: "0x75a17782e2bf0f266854891c8a40bc0a75de38a82d2346a1605391e5c4a5e13f",
    label: "Guard deployment",
    detail: "NoYeetGuard, executor set to the KeeperHub Turnkey wallet.",
    throughKeeperHub: false,
    executionId: null,
    gas: null,
  },
  {
    hash: "0xf9ea685f7103913c399ee96b7dcee4a044bc17e5e374150a7d2a784222f08757",
    label: "Target deployment",
    detail: "The position contract the invariant reads, so the denial is genuine.",
    throughKeeperHub: false,
    executionId: null,
    gas: null,
  },
];

export interface SuiteResult {
  readonly name: string;
  readonly tests: number;
  readonly detail: string;
}

export const SUITES: readonly SuiteResult[] = [
  { name: "guard", tests: 15, detail: "1024 fuzz runs across two boundary properties" },
  { name: "policy", tests: 20, detail: "Purity gate rejects I/O, ambient clock, randomness" },
  { name: "receipts", tests: 31, detail: "598 assertions, every leaf in trees of size 1 to 33" },
  { name: "keeperhub", tests: 21, detail: "Retry, idempotency, per-wallet serialization" },
  { name: "observability", tests: 14, detail: "Exposition format, cumulative buckets, collection" },
];

export const TOTAL_TESTS = SUITES.reduce((sum, suite) => sum + suite.tests, 0);

export function shorten(hash: string, lead = 10, tail = 8): string {
  return hash.length <= lead + tail ? hash : `${hash.slice(0, lead)}...${hash.slice(-tail)}`;
}

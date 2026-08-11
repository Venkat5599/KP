/**
 * Core types for the noyeet policy VM.
 *
 * Everything here is data. The engine is a pure function of (intent, policy, context);
 * it performs no I/O and never consults a model. The agent's `rationale` is carried for
 * the audit trail and is deliberately NOT reachable from any decision function.
 */

export type Hex = `0x${string}`;

export type Verdict = "ALLOW" | "HOLD" | "DENY";

/** Severity a rule can raise. Absent means the rule passed. */
export type Severity = "hold" | "deny";

export interface Reason {
  /** Stable machine-readable code, e.g. "TARGET_NOT_ALLOWED". */
  readonly code: string;
  readonly severity: Severity;
  /** Human-readable, written for the person approving a HOLD. */
  readonly message: string;
  /** Structured detail for receipts and dashboards. */
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
}

export interface Call {
  readonly target: Hex;
  /** Native value in wei, decimal string. */
  readonly value: string;
  readonly data: Hex;
}

export type InvariantOp = "GTE" | "LTE" | "EQ" | "REL_DEC_MAX" | "REL_INC_MAX";

export interface Invariant {
  readonly target: Hex;
  readonly probe: Hex;
  readonly word: number;
  readonly op: InvariantOp;
  /** Decimal string, matching the on-chain uint256. */
  readonly threshold: string;
}

export interface Intent {
  readonly id: string;
  readonly chainId: number;
  readonly calls: readonly Call[];
  readonly invariants: readonly Invariant[];
  /** Metadata only. Never an input to a decision. */
  readonly rationale?: string;
  readonly submittedAt: string;
}

/** A prior decision, used by windowed rules. Supplied by the caller; the VM reads no store. */
export interface HistoryEntry {
  readonly at: string;
  readonly verdict: Verdict;
  readonly nativeValue: string;
}

export interface EvalContext {
  /** Injected clock. The VM never calls Date.now(). */
  readonly now: Date;
  readonly history: readonly HistoryEntry[];
  /** Gas estimate from preflight, in gas units. Absent before simulation. */
  readonly gasEstimate?: string;
  /** Addresses this account has transacted with before. */
  readonly knownCounterparties: readonly Hex[];
}

export interface Decision {
  readonly verdict: Verdict;
  readonly reasons: readonly Reason[];
}

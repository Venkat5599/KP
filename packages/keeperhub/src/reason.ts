/**
 * Parser for NoYeetGuard revert reasons.
 *
 * The guard reverts with `Error(string)` in a pinned grammar; KeeperHub decodes that into
 * `revertReason`. This module turns that string back into structured data for the receipt.
 *
 * Two failure classes must never be conflated:
 *
 *   - `failureKind: "validation"` — KeeperHub rejected the transaction before the EVM ran
 *     it (unfunded wallet, bad chain, spending cap). No invariant was evaluated.
 *   - an EVM revert — the transaction executed and the guard's assertion tripped.
 *
 * Reporting a validation failure as a broken invariant would tell an operator their health
 * factor collapsed when the real problem was an empty gas tank.
 */

export const REASON_PREFIX = "NOYEET/1:";

export type GuardDenial =
  | {
      readonly kind: "invariant";
      readonly index: number;
      readonly got: bigint;
      readonly want: bigint;
    }
  | { readonly kind: "probe_failed"; readonly index: number }
  | {
      readonly kind: "probe_short";
      readonly index: number;
      readonly length: number;
      readonly needed: number;
    }
  | { readonly kind: "not_executor" }
  | { readonly kind: "not_admin" }
  | { readonly kind: "reentrant" }
  | { readonly kind: "call_failed" };

/**
 * KeeperHub may hand back the raw string or wrap it, as in `Error(NOYEET/1:...)`.
 * Both shapes are accepted; anything else returns null so the caller falls back to the
 * verbatim reason rather than inventing structure.
 */
function extractPayload(reason: string): string | null {
  const trimmed = reason.trim();

  if (trimmed.startsWith(REASON_PREFIX)) return trimmed.slice(REASON_PREFIX.length);

  const wrapped = /^Error\((.*)\)$/s.exec(trimmed);
  const inner = wrapped?.[1]?.trim();
  if (inner !== undefined && inner.startsWith(REASON_PREFIX)) {
    return inner.slice(REASON_PREFIX.length);
  }

  const embedded = trimmed.indexOf(REASON_PREFIX);
  if (embedded >= 0) return trimmed.slice(embedded + REASON_PREFIX.length);

  return null;
}

function toIndex(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function toBig(value: string | undefined): bigint | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

/** Parse a guard revert reason. Returns null when the string is not guard-authored. */
export function parseGuardDenial(reason: string | undefined | null): GuardDenial | null {
  if (reason === undefined || reason === null) return null;

  const payload = extractPayload(reason);
  if (payload === null) return null;

  const parts = payload.split(":");

  switch (parts[0]) {
    case "INV": {
      const index = toIndex(parts[1]);
      const got = toBig(parts[2]);
      const want = toBig(parts[3]);
      if (index === null || got === null || want === null) return null;
      return { kind: "invariant", index, got, want };
    }
    case "PROBE_FAILED": {
      const index = toIndex(parts[1]);
      return index === null ? null : { kind: "probe_failed", index };
    }
    case "PROBE_SHORT": {
      const index = toIndex(parts[1]);
      const length = toIndex(parts[2]);
      const needed = toIndex(parts[3]);
      if (index === null || length === null || needed === null) return null;
      return { kind: "probe_short", index, length, needed };
    }
    case "NOT_EXECUTOR":
      return { kind: "not_executor" };
    case "NOT_ADMIN":
      return { kind: "not_admin" };
    case "REENTRANT":
      return { kind: "reentrant" };
    case "CALL_FAILED":
      return { kind: "call_failed" };
    default:
      return null;
  }
}

/** Operator-facing sentence. Written for whoever has to approve or investigate. */
export function describeDenial(denial: GuardDenial): string {
  switch (denial.kind) {
    case "invariant":
      return `Invariant ${denial.index} would break: got ${denial.got}, required ${denial.want}.`;
    case "probe_failed":
      return `Invariant ${denial.index} could not be read: the probe call reverted.`;
    case "probe_short":
      return `Invariant ${denial.index} read ${denial.length} bytes but needs ${denial.needed}; the word index is out of range.`;
    case "not_executor":
      return "The sending wallet is not an approved executor on this guard.";
    case "not_admin":
      return "Only the guard admin may rotate executors.";
    case "reentrant":
      return "Re-entrant call into the guard was rejected.";
    case "call_failed":
      return "An inner call failed without returning a reason.";
  }
}

import { hashJson, type Hex } from "./hash.ts";
import type { JsonValue } from "./canonical.ts";

export type Verdict = "ALLOW" | "HOLD" | "DENY";

export interface ReceiptReason {
  readonly code: string;
  readonly severity: "hold" | "deny";
  readonly message: string;
}

export interface SimulationRecord {
  readonly wouldRevert: boolean;
  readonly gasEstimate: string;
  /** Violated invariant index, when the guard named one. */
  readonly invariantIndex?: number;
}

export interface ExecutionRecord {
  readonly txHash: Hex;
  readonly gasUsed: string;
  readonly block: number;
}

export interface AnchorRecord {
  readonly root: Hex;
  readonly txHash: Hex;
  readonly leafIndex: number;
}

/**
 * A decision receipt. `anchor` is absent until the batch is written onchain, so the digest
 * is computed over everything except the anchor. That is deliberate: the anchor commits to
 * the digest, so including it would be circular.
 */
export interface Receipt {
  readonly intentId: string;
  readonly intentHash: Hex;
  readonly policyHash: Hex;
  readonly guard: Hex;
  readonly chainId: number;
  readonly verdict: Verdict;
  readonly reasons: readonly ReceiptReason[];
  readonly simulation: SimulationRecord | null;
  readonly execution: ExecutionRecord | null;
  readonly at: string;
}

export interface AnchoredReceipt extends Receipt {
  readonly digest: Hex;
  readonly anchor: AnchorRecord;
}

/** The exact subset that is hashed. Field order is irrelevant; JCS sorts keys. */
function digestPayload(receipt: Receipt): JsonValue {
  return {
    intentId: receipt.intentId,
    intentHash: receipt.intentHash,
    policyHash: receipt.policyHash,
    guard: receipt.guard,
    chainId: receipt.chainId,
    verdict: receipt.verdict,
    reasons: receipt.reasons.map((r) => ({
      code: r.code,
      severity: r.severity,
      message: r.message,
    })),
    simulation: receipt.simulation
      ? {
          wouldRevert: receipt.simulation.wouldRevert,
          gasEstimate: receipt.simulation.gasEstimate,
          ...(receipt.simulation.invariantIndex === undefined
            ? {}
            : { invariantIndex: receipt.simulation.invariantIndex }),
        }
      : null,
    execution: receipt.execution
      ? {
          txHash: receipt.execution.txHash,
          gasUsed: receipt.execution.gasUsed,
          block: receipt.execution.block,
        }
      : null,
    at: receipt.at,
  };
}

/** Content digest of a receipt. This value is the Merkle leaf. */
export function receiptDigest(receipt: Receipt): Hex {
  return hashJson(digestPayload(receipt));
}

/** Recompute the digest and compare. Used by the public verifier. */
export function verifyDigest(receipt: Receipt, claimed: Hex): boolean {
  return receiptDigest(receipt).toLowerCase() === claimed.toLowerCase();
}

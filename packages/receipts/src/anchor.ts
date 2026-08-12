/**
 * Anchor batches: receipts -> Merkle root + per-receipt proofs.
 *
 * A batch is an hour bucket derived from each receipt's decision time (UTC hours since
 * the epoch), so the batch id is deterministic and re-running the anchorer for the
 * same hour reproduces the same tree. Leaves are the receipt digests sorted
 * lexicographically, which makes the tree reproducible by any third party with the
 * same receipts.
 *
 * The proof is stored alongside the receipt (not part of the hashed document) so a
 * verifier needs only the receipt and its own digest computation — no batch state.
 */

import { buildTree, getProof, type MerkleTree } from "./merkle.ts";
import type { Hex } from "./hash.ts";

export interface AnchorInfo {
  readonly batchId: number;
  readonly root: Hex;
  readonly leafIndex: number;
  readonly proof: readonly Hex[];
  readonly executionId: string;
  readonly transactionHash: Hex | null;
}

/** UTC hour bucket for a decision timestamp. Deterministic and idempotent. */
export function batchIdFor(at: string): number {
  return Math.floor(Date.parse(at) / 3_600_000);
}

export interface AnchorBatch {
  readonly batchId: number;
  readonly root: Hex;
  /** digest -> proof material for this batch. */
  readonly entries: ReadonlyMap<string, { readonly leafIndex: number; readonly proof: readonly Hex[] }>;
}

/** Build the anchor batch for the receipts' digests. Sorted by digest for reproducibility. */
export function buildAnchorBatch(batchId: number, digests: readonly Hex[]): AnchorBatch {
  if (digests.length === 0) throw new Error("Cannot anchor an empty batch");
  const sorted = [...digests].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const tree = buildTree(sorted);

  const entries = new Map<string, { leafIndex: number; proof: readonly Hex[] }>();
  sorted.forEach((digest, index) => {
    entries.set(digest.toLowerCase(), { leafIndex: index, proof: getProof(tree, index) });
  });

  return { batchId, root: tree.root, entries };
}

export type { MerkleTree };

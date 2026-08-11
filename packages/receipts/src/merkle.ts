import { compareBytes, concatBytes, fromHex, keccak, toHex, type Hex } from "./hash.ts";

/**
 * Sorted-pair Merkle tree, byte-compatible with OpenZeppelin's `MerkleProof.verify`.
 *
 * Pairs are sorted before hashing, so a proof carries only sibling hashes and no direction
 * bits. An odd node at any level is promoted unchanged rather than duplicated: duplicating
 * it is the classic second-preimage footgun, where a proof for an internal node can be
 * replayed as a proof for a leaf.
 */

export interface MerkleTree {
  readonly root: Hex;
  readonly leaves: readonly Hex[];
  /** Levels from leaves (index 0) up to the root. */
  readonly levels: readonly (readonly Uint8Array[])[];
}

function hashPair(a: Uint8Array, b: Uint8Array): Uint8Array {
  return compareBytes(a, b) <= 0 ? keccak(concatBytes(a, b)) : keccak(concatBytes(b, a));
}

export function buildTree(leaves: readonly Hex[]): MerkleTree {
  if (leaves.length === 0) throw new Error("Cannot build a Merkle tree with no leaves");

  const levels: Uint8Array[][] = [leaves.map(fromHex)];

  while (levels[levels.length - 1]!.length > 1) {
    const current = levels[levels.length - 1]!;
    const next: Uint8Array[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = current[i + 1];
      next.push(right === undefined ? left : hashPair(left, right));
    }
    levels.push(next);
  }

  return { root: toHex(levels[levels.length - 1]![0]!), leaves, levels };
}

/** Sibling hashes proving `index` is in the tree, bottom-up. */
export function getProof(tree: MerkleTree, index: number): Hex[] {
  if (!Number.isInteger(index) || index < 0 || index >= tree.leaves.length) {
    throw new RangeError(`Leaf index ${index} is out of range (0..${tree.leaves.length - 1})`);
  }

  const proof: Hex[] = [];
  let position = index;

  for (let level = 0; level < tree.levels.length - 1; level++) {
    const nodes = tree.levels[level]!;
    const isRightChild = position % 2 === 1;
    const siblingIndex = isRightChild ? position - 1 : position + 1;
    const sibling = nodes[siblingIndex];
    // No sibling means this node was promoted, so nothing is added to the proof.
    if (sibling !== undefined) proof.push(toHex(sibling));
    position = Math.floor(position / 2);
  }

  return proof;
}

/** Recompute the root from a leaf and its proof. Mirrors OZ MerkleProof.processProof. */
export function processProof(leaf: Hex, proof: readonly Hex[]): Hex {
  let computed = fromHex(leaf);
  for (const step of proof) computed = hashPair(computed, fromHex(step));
  return toHex(computed);
}

export function verifyProof(leaf: Hex, proof: readonly Hex[], root: Hex): boolean {
  return processProof(leaf, proof).toLowerCase() === root.toLowerCase();
}

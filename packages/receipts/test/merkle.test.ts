import { describe, expect, test } from "bun:test";
import {
  buildTree,
  compareBytes,
  concatBytes,
  fromHex,
  getProof,
  keccak,
  processProof,
  toHex,
  verifyProof,
  type Hex,
} from "../src/index.ts";

/** Independent reimplementation of the pair rule, used to check the tree from outside. */
function pair(a: Hex, b: Hex): Hex {
  const x = fromHex(a);
  const y = fromHex(b);
  return compareBytes(x, y) <= 0
    ? toHex(keccak(concatBytes(x, y)))
    : toHex(keccak(concatBytes(y, x)));
}

function leaves(count: number): Hex[] {
  return Array.from({ length: count }, (_, i) =>
    toHex(keccak(new TextEncoder().encode(`leaf-${i}`))),
  );
}

describe("tree construction", () => {
  test("rejects an empty tree", () => {
    expect(() => buildTree([])).toThrow();
  });

  test("a single leaf is its own root", () => {
    const [only] = leaves(1) as [Hex];
    expect(buildTree([only]).root).toBe(only);
  });

  test("two leaves hash as a sorted pair", () => {
    const [a, b] = leaves(2) as [Hex, Hex];
    expect(buildTree([a, b]).root).toBe(pair(a, b));
  });

  test("pair order in the input does not change the root", () => {
    const [a, b] = leaves(2) as [Hex, Hex];
    expect(buildTree([a, b]).root).toBe(buildTree([b, a]).root);
  });

  test("odd node is promoted, not duplicated", () => {
    const [a, b, c] = leaves(3) as [Hex, Hex, Hex];
    // Level 1 is [pair(a,b), c]; the root pairs those two.
    expect(buildTree([a, b, c]).root).toBe(pair(pair(a, b), c));
  });

  test("root changes when any leaf changes", () => {
    const set = leaves(5);
    const mutated = [...set];
    mutated[3] = toHex(keccak(new TextEncoder().encode("tampered")));
    expect(buildTree(mutated).root).not.toBe(buildTree(set).root);
  });
});

describe("proofs", () => {
  test("every leaf verifies, for every tree size from 1 to 33", () => {
    for (let size = 1; size <= 33; size++) {
      const set = leaves(size);
      const tree = buildTree(set);
      for (let index = 0; index < size; index++) {
        const proof = getProof(tree, index);
        expect(verifyProof(set[index]!, proof, tree.root)).toBe(true);
      }
    }
  });

  test("proof length is logarithmic in the leaf count", () => {
    const tree = buildTree(leaves(1000));
    expect(getProof(tree, 500).length).toBeLessThanOrEqual(10);
  });

  test("a proof does not verify against a different leaf", () => {
    const set = leaves(8);
    const tree = buildTree(set);
    expect(verifyProof(set[1]!, getProof(tree, 0), tree.root)).toBe(false);
  });

  test("a proof does not verify against a different root", () => {
    const tree = buildTree(leaves(8));
    const other = buildTree(leaves(4));
    expect(verifyProof(tree.leaves[0]!, getProof(tree, 0), other.root)).toBe(false);
  });

  test("a truncated proof fails", () => {
    const tree = buildTree(leaves(8));
    const proof = getProof(tree, 3);
    expect(verifyProof(tree.leaves[3]!, proof.slice(0, -1), tree.root)).toBe(false);
  });

  test("a reordered proof fails", () => {
    const tree = buildTree(leaves(8));
    const proof = getProof(tree, 3);
    expect(verifyProof(tree.leaves[3]!, [proof[1]!, proof[0]!, proof[2]!], tree.root)).toBe(false);
  });

  test("out-of-range indices are rejected", () => {
    const tree = buildTree(leaves(4));
    expect(() => getProof(tree, 4)).toThrow(RangeError);
    expect(() => getProof(tree, -1)).toThrow(RangeError);
    expect(() => getProof(tree, 1.5)).toThrow(RangeError);
  });

  test("root verification is case-insensitive on hex", () => {
    const tree = buildTree(leaves(4));
    const upper = `0x${tree.root.slice(2).toUpperCase()}` as Hex;
    expect(verifyProof(tree.leaves[0]!, getProof(tree, 0), upper)).toBe(true);
  });
});

describe("structure", () => {
  /**
   * The classic Merkle attack presents an internal node as if it were a leaf. Promoting an
   * odd node rather than duplicating it is what prevents a proof for an internal node from
   * being replayed as a proof of leaf membership, so the property is asserted, not assumed.
   */
  test("internal nodes are never committed as leaves", () => {
    const set = leaves(4);
    const tree = buildTree(set);
    const internal = toHex(tree.levels[1]![0]!);
    expect(set).not.toContain(internal);
  });

  test("processProof on an empty proof returns the leaf unchanged", () => {
    const [only] = leaves(1) as [Hex];
    expect(processProof(only, [])).toBe(only);
  });
});

describe("hex helpers", () => {
  test("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255]);
    expect(fromHex(toHex(bytes))).toEqual(bytes);
  });

  test("rejects malformed hex", () => {
    expect(() => fromHex("0xabc" as Hex)).toThrow();
    expect(() => fromHex("0xzz" as Hex)).toThrow();
  });

  test("compareBytes orders lexicographically, then by length", () => {
    expect(compareBytes(new Uint8Array([1]), new Uint8Array([2]))).toBeLessThan(0);
    expect(compareBytes(new Uint8Array([2]), new Uint8Array([1]))).toBeGreaterThan(0);
    expect(compareBytes(new Uint8Array([1]), new Uint8Array([1, 0]))).toBeLessThan(0);
    expect(compareBytes(new Uint8Array([1]), new Uint8Array([1]))).toBe(0);
  });
});

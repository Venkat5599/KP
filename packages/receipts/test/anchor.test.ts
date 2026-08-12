import { describe, expect, test } from "bun:test";
import { batchIdFor, buildAnchorBatch } from "../src/anchor.ts";
import { verifyProof } from "../src/merkle.ts";
import type { Hex } from "../src/hash.ts";

const hex32 = (byte: number): Hex => `0x${byte.toString(16).padStart(2, "0").repeat(32)}` as Hex;

const DIGESTS: readonly Hex[] = [hex32(1), hex32(2), hex32(3), hex32(4), hex32(5)];

describe("batchIdFor", () => {
  test("buckets by UTC hour", () => {
    const a = batchIdFor("2026-08-12T06:10:00Z");
    const b = batchIdFor("2026-08-12T06:59:59Z");
    const c = batchIdFor("2026-08-12T07:00:00Z");
    expect(a).toBe(b);
    expect(c).toBe(a + 1);
  });

  test("is deterministic", () => {
    expect(batchIdFor("2026-08-12T06:10:00Z")).toBe(batchIdFor("2026-08-12T06:10:00Z"));
  });
});

describe("buildAnchorBatch", () => {
  test("every proof verifies against the committed root", () => {
    const batch = buildAnchorBatch(12345, [...DIGESTS]);
    for (const digest of DIGESTS) {
      const entry = batch.entries.get(digest.toLowerCase());
      expect(entry).toBeDefined();
      expect(verifyProof(digest, entry!.proof, batch.root)).toBe(true);
    }
  });

  test("is reproducible regardless of input order", () => {
    const shuffled = [...DIGESTS].reverse();
    const batch = buildAnchorBatch(1, [...DIGESTS]);
    const batchShuffled = buildAnchorBatch(1, shuffled);
    expect(batchShuffled.root).toBe(batch.root);
    expect(batchShuffled.entries.get(hex32(1).toLowerCase())?.leafIndex).toBe(
      batch.entries.get(hex32(1).toLowerCase())?.leafIndex,
    );
  });

  test("leaf indices match the sorted order", () => {
    const batch = buildAnchorBatch(1, [...DIGESTS]);
    const sorted = [...DIGESTS].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    sorted.forEach((digest, index) => {
      expect(batch.entries.get(digest.toLowerCase())?.leafIndex).toBe(index);
    });
  });

  test("rejects an empty batch", () => {
    expect(() => buildAnchorBatch(1, [])).toThrow("empty batch");
  });
});

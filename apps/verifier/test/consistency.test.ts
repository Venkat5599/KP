import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { receiptDigest, type Receipt } from "@noyeet/receipts";

const SAMPLE: Receipt = {
  intentId: "int_01J8ZQ4T7K",
  intentHash: "0x9f2b1c" as `0x${string}`,
  policyHash: "0xab3f77" as `0x${string}`,
  guard: "0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f" as `0x${string}`,
  chainId: 11155111,
  verdict: "DENY",
  reasons: [
    {
      code: "INVARIANT_BROKEN",
      severity: "deny",
      message: "Invariant 0 would break: got 1120000000000000000, required 1400000000000000000.",
    },
  ],
  simulation: { wouldRevert: true, gasEstimate: "0", invariantIndex: 0 },
  execution: null,
  at: "2026-08-11T14:02:12Z",
};

/**
 * The static bundle must agree byte-for-byte with the receipts package: the browser
 * verifier and the server-side receipts are the same computation, so a receipt verified
 * in one place verifies in the other.
 */
describe("static verifier bundle", () => {
  let dir: string;
  let bundle: { computeDigest(json: string): { digest: string; canonical: string } };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "noyeet-verifier-"));
    execSync(`bun build ./src/main.ts --outdir ${dir} --target browser --format esm --minify`, {
      cwd: new URL("..", import.meta.url).pathname,
      stdio: "pipe",
    });
    bundle = (await import(join(dir, "main.js"))) as typeof bundle;
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("bundle digest equals the receipts package digest", () => {
    const { digest } = bundle.computeDigest(JSON.stringify(SAMPLE));
    const expected = receiptDigest(SAMPLE);
    expect(digest.toLowerCase()).toBe(expected.toLowerCase());
  });

  test("key order does not change the bundle digest", () => {
    const reordered = JSON.parse(JSON.stringify(SAMPLE)) as Record<string, unknown>;
    const reasons = reordered.reasons as unknown[];
    reordered.reasons = [reasons[0]];
    const shuffled = {
      at: reordered.at,
      verdict: reordered.verdict,
      reasons: reordered.reasons,
      intentId: reordered.intentId,
      chainId: reordered.chainId,
      policyHash: reordered.policyHash,
      intentHash: reordered.intentHash,
      simulation: reordered.simulation,
      guard: reordered.guard,
      execution: reordered.execution,
    };
    const { digest } = bundle.computeDigest(JSON.stringify(shuffled));
    const expected = receiptDigest(SAMPLE);
    expect(digest.toLowerCase()).toBe(expected.toLowerCase());
  });

  test("malformed input raises a useful error", () => {
    expect(() => bundle.computeDigest("{not json")).toThrow();
  });
});

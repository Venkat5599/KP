import { describe, expect, test } from "bun:test";
import { decodeEvent } from "../src/validate.ts";
import { encodeEvent } from "../src/producer.ts";
import { EVENT_VERSION, type DecisionEvent } from "../src/schema.ts";

const DIGEST = `0x${"ab".repeat(32)}` as const;

function decision(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: DecisionEvent = {
    v: EVENT_VERSION,
    type: "decision",
    intentId: "itn_0001",
    chainId: 11155111,
    verdict: "DENY",
    digest: DIGEST,
    policyHash: `0x${"11".repeat(32)}`,
    guard: "0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f",
    reasons: [{ code: "INVARIANT_BROKEN", severity: "deny", message: "health factor" }],
    simulated: { wouldRevert: true, gasEstimate: "52667", invariantIndex: 0 },
    at: "2026-08-13T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

const bytes = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));

describe("decodeEvent", () => {
  test("round-trips a decision through the producer encoder", () => {
    const event = decision() as unknown as DecisionEvent;
    const result = decodeEvent(new Uint8Array(encodeEvent(event)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ intentId: "itn_0001", verdict: "DENY" });
  });

  test("rejects an unknown schema version rather than best-effort parsing", () => {
    const result = decodeEvent(bytes(decision({ v: 2 })));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe("v");
      expect(result.error.message).toContain("Unsupported event version 2");
    }
  });

  test("rejects a digest that is not 32 bytes, since it cannot be a Merkle leaf", () => {
    const result = decodeEvent(bytes(decision({ digest: "0xdeadbeef" })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("digest");
  });

  test("rejects an unknown verdict", () => {
    const result = decodeEvent(bytes(decision({ verdict: "MAYBE" })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("verdict");
  });

  test("rejects a non-integer chainId", () => {
    const result = decodeEvent(bytes(decision({ chainId: 1.5 })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("chainId");
  });

  test("rejects an unparseable timestamp", () => {
    const result = decodeEvent(bytes(decision({ at: "last tuesday" })));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("at");
  });

  test("returns a typed failure for malformed JSON instead of throwing", () => {
    const result = decodeEvent(new TextEncoder().encode("{not json"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("not valid JSON");
  });

  test("returns a typed failure for an empty payload", () => {
    expect(decodeEvent(null).ok).toBe(false);
    expect(decodeEvent(new Uint8Array(0)).ok).toBe(false);
  });

  test("rejects an unknown event type", () => {
    const result = decodeEvent(bytes({ v: EVENT_VERSION, type: "gossip" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("type");
  });

  test("accepts an anchor event on version alone", () => {
    const result = decodeEvent(
      bytes({ v: EVENT_VERSION, type: "anchor", root: DIGEST, leaves: [DIGEST], at: "2026-08-13T00:00:00.000Z" }),
    );
    expect(result.ok).toBe(true);
  });
});

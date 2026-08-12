import { describe, expect, test } from "bun:test";
import { buildIntent } from "../src/index.ts";

describe("buildIntent", () => {
  test("declares the floor as the invariant threshold", () => {
    const env = {
      GATEWAY_URL: "http://localhost:3000",
      CHAIN_ID: "11155111",
      TARGET_ADDRESS: "0x2BeaFD2Ed0D8e3831752b3243E7C5b2CA67Fdb0B",
      GUARD_ADDRESS: "0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f",
    };
    for (const [key, value] of Object.entries(env)) {
      process.env[key] = value;
    }
    const intent = buildIntent(new Date("2026-08-12T06:00:00Z"));
    expect(intent.chainId).toBe(11155111);
    expect(intent.invariants[0]?.op).toBe("GTE");
    expect(intent.invariants[0]?.threshold).toBe("1400000000000000000");
    expect(intent.id).toMatch(/^demo-/);
  });
});

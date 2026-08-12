import { describe, expect, test } from "bun:test";
import {
  borrowMoreCalldata,
  buildIntent,
  decide,
  probeCalldata,
  runOnce,
  type Intent,
} from "../src/core.ts";

const GUARD = "0x4Bd0501fb1c0dEecaCD3efd50340Cd82Bb8E7F0f" as const;
const TARGET = "0x2BeaFD2Ed0D8e3831752b3243E7C5b2CA67Fdb0B" as const;
const FLOOR = 1_400_000_000_000_000_000n;
const TARGET_HF = 1_500_000_000_000_000_000n;

const config = {
  chainId: 11155111,
  target: TARGET,
  guard: GUARD,
  floorWei: FLOOR,
  targetWei: TARGET_HF,
  idPrefix: "keeper",
};

describe("decide", () => {
  test("no action above the floor", () => {
    expect(decide(2_000_000_000_000_000_000n, FLOOR, TARGET_HF)).toBeNull();
  });

  test("no action exactly at the floor", () => {
    expect(decide(FLOOR, FLOOR, TARGET_HF)).toBeNull();
  });

  test("proposes a move when below the floor", () => {
    expect(decide(1_120_000_000_000_000_000n, FLOOR, TARGET_HF)).toBe(TARGET_HF);
  });
});

describe("calldata", () => {
  test("borrowMore encodes the amount as a uint256", () => {
    const calldata = borrowMoreCalldata(TARGET_HF);
    expect(calldata.startsWith("0x9d0bf2e9")).toBe(true);
    expect(calldata).toHaveLength(10 + 64);
  });

  test("probe targets the guard address", () => {
    const probe = probeCalldata(GUARD);
    expect(probe.startsWith("0xbf92857c")).toBe(true);
    expect(probe.slice(-40)).toBe(GUARD.slice(2).toLowerCase());
  });
});

describe("buildIntent", () => {
  test("declares the floor as the invariant threshold", () => {
    const intent = buildIntent(config, "keeper-1", new Date("2026-08-12T06:00:00Z"), TARGET_HF);
    expect(intent.calls[0]?.target).toBe(TARGET);
    expect(intent.invariants[0]?.threshold).toBe(FLOOR.toString());
    expect(intent.invariants[0]?.op).toBe("GTE");
  });
});

describe("runOnce", () => {
  test("healthy position: no submission", async () => {
    let submitted = 0;
    const outcome = await runOnce(
      {
        readHealthFactorWei: async () => 2_000_000_000_000_000_000n,
        submit: async (intent: Intent) => {
          submitted++;
          return "submitted";
        },
        now: () => new Date("2026-08-12T06:00:00Z"),
      },
      config,
      0,
    );
    expect(outcome.kind).toBe("noop");
    expect(submitted).toBe(0);
  });

  test("below floor: submits a guard-wrapped intent", async () => {
    const captured: Intent[] = [];
    const outcome = await runOnce(
      {
        readHealthFactorWei: async () => 1_120_000_000_000_000_000n,
        submit: async (intent: Intent) => {
          captured.push(intent);
          return "submitted";
        },
        now: () => new Date("2026-08-12T06:00:00Z"),
      },
      config,
      7,
    );
    expect(outcome.kind).toBe("submitted");
    expect(captured[0]?.id).toBe("keeper-7");
    expect(captured[0]?.calls[0]?.data).toBe(borrowMoreCalldata(TARGET_HF));
  });

  test("held intents are surfaced, not retried", async () => {
    const outcome = await runOnce(
      {
        readHealthFactorWei: async () => 1_120_000_000_000_000_000n,
        submit: async () => "held",
        now: () => new Date(),
      },
      config,
      1,
    );
    expect(outcome.kind).toBe("held");
  });

  test("denied intents are surfaced, not retried", async () => {
    const outcome = await runOnce(
      {
        readHealthFactorWei: async () => 1_120_000_000_000_000_000n,
        submit: async () => "denied",
        now: () => new Date(),
      },
      config,
      1,
    );
    expect(outcome.kind).toBe("denied");
  });
});
